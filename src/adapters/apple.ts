import { TcError } from "@treecombinator/sdk-common";
import { decodeJwsPayload, importPrivateKey, signJwt } from "../jwt";
import type { AppleNotification, AppleStore, AppleSubscriptionStatus, AppleTransaction } from "../port";

/**
 * Apple App Store Server API client. Auth: JWT ES256 signed with an IN-APP PURCHASE
 * key (App Store Connect → Users and Access → Integrations → In-App Purchase) — the
 * Sign in with Apple / APNs key does NOT work here, nor does a Connect API team key.
 *
 * Environment routing: production first; a 4040010 (transaction not found) retries
 * against the sandbox host, per Apple's recommended pattern.
 */
export interface AppleStoreConfig {
  /** The .p8 private key (PEM, In-App Purchase type). */
  keyP8: string;
  keyId: string;
  issuerId: string;
  /** The app's bundle id (JWT `bid` claim), e.g. "com.tintvs". */
  bundleId: string;
  /** Overrides for tests. */
  productionUrl?: string;
  sandboxUrl?: string;
  fetch?: typeof fetch;
}

const PRODUCTION = "https://api.storekit.itunes.apple.com";
const SANDBOX = "https://api.storekit-sandbox.itunes.apple.com";
const TRANSACTION_NOT_FOUND = 4040010;

export function createAppleStore(config: AppleStoreConfig): AppleStore {
  const doFetch = config.fetch ?? globalThis.fetch;
  const production = config.productionUrl ?? PRODUCTION;
  const sandbox = config.sandboxUrl ?? SANDBOX;

  let cached: { token: string; expiresAt: number } | null = null;
  async function token(): Promise<string> {
    if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const key = await importPrivateKey(config.keyP8, "ES256");
    const jwt = await signJwt(
      "ES256",
      { kid: config.keyId, typ: "JWT" },
      { iss: config.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1", bid: config.bundleId },
      key,
    );
    cached = { token: jwt, expiresAt: (now + 1200) * 1000 };
    return jwt;
  }

  /** GET against one environment; returns the parsed body or throws TcError. */
  async function get(base: string, path: string): Promise<Record<string, unknown>> {
    const res = await doFetch(base + path, { headers: { Authorization: `Bearer ${await token()}` } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errorCode = typeof body.errorCode === "number" ? body.errorCode : undefined;
      throw new TcError(
        res.status === 401 ? "iap_apple_auth_failed" : "iap_apple_request_failed",
        `apple ${res.status}${errorCode ? ` (${errorCode})` : ""}`,
        { errorCode, path },
        res.status,
      );
    }
    return body;
  }

  /** Production first; 4040010 falls through to sandbox (sandbox purchases in review/tests). */
  async function getWithFallback(path: string): Promise<Record<string, unknown>> {
    try {
      return await get(production, path);
    } catch (err) {
      if (err instanceof TcError && err.details?.errorCode === TRANSACTION_NOT_FOUND) {
        return get(sandbox, path);
      }
      throw err;
    }
  }

  return {
    async getTransaction(transactionId: string): Promise<AppleTransaction> {
      const body = await getWithFallback(`/inApps/v1/transactions/${encodeURIComponent(transactionId)}`);
      const signed = body.signedTransactionInfo;
      if (typeof signed !== "string") {
        throw new TcError("iap_apple_response_invalid", "missing signedTransactionInfo");
      }
      return toTransaction(decodeJwsPayload(signed));
    },

    async getSubscriptionStatuses(originalTransactionId: string): Promise<AppleSubscriptionStatus[]> {
      const body = await getWithFallback(`/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`);
      const groups = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
      const statuses: AppleSubscriptionStatus[] = [];
      for (const group of groups) {
        const last = Array.isArray(group.lastTransactions) ? (group.lastTransactions as Record<string, unknown>[]) : [];
        for (const item of last) {
          statuses.push({
            status: Number(item.status ?? 0),
            transaction:
              typeof item.signedTransactionInfo === "string"
                ? toTransaction(decodeJwsPayload(item.signedTransactionInfo))
                : { raw: {} },
            renewal: typeof item.signedRenewalInfo === "string" ? decodeJwsPayload(item.signedRenewalInfo) : {},
          });
        }
      }
      return statuses;
    },

    async requestTestNotification(): Promise<{ testNotificationToken?: string }> {
      const res = await doFetch(`${production}/inApps/v1/notifications/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new TcError("iap_apple_request_failed", `test notification ${res.status}`, undefined, res.status);
      return { testNotificationToken: typeof body.testNotificationToken === "string" ? body.testNotificationToken : undefined };
    },
  };
}

/**
 * Decode an App Store Server Notification V2 body (`{ signedPayload }`). Decoding only:
 * the x5c chain is NOT verified — confirm the state via `getSubscriptionStatuses` /
 * `getTransaction` before acting on it.
 */
export function parseAppleNotification(body: string): AppleNotification {
  let envelope: { signedPayload?: string };
  try {
    envelope = JSON.parse(body) as { signedPayload?: string };
  } catch {
    throw new TcError("iap_notification_invalid", "body is not JSON");
  }
  const payload = typeof envelope.signedPayload === "string" ? decodeJwsPayload(envelope.signedPayload) : {};
  const data = (payload.data ?? {}) as Record<string, unknown>;
  return {
    type: String(payload.notificationType ?? "unknown"),
    subtype: typeof payload.subtype === "string" ? payload.subtype : undefined,
    notificationUUID: typeof payload.notificationUUID === "string" ? payload.notificationUUID : undefined,
    environment: typeof data.environment === "string" ? data.environment : undefined,
    transaction:
      typeof data.signedTransactionInfo === "string"
        ? toTransaction(decodeJwsPayload(data.signedTransactionInfo))
        : undefined,
    renewal: typeof data.signedRenewalInfo === "string" ? decodeJwsPayload(data.signedRenewalInfo) : undefined,
    verified: false,
    raw: payload,
  };
}

function toTransaction(payload: Record<string, unknown>): AppleTransaction {
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    transactionId: str(payload.transactionId),
    originalTransactionId: str(payload.originalTransactionId),
    productId: str(payload.productId),
    type: str(payload.type),
    purchaseDate: num(payload.purchaseDate),
    expiresDate: num(payload.expiresDate),
    revocationDate: num(payload.revocationDate),
    bundleId: str(payload.bundleId),
    environment: str(payload.environment),
    raw: payload,
  };
}
