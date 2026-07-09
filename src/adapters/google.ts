import { TcError } from "@treecombinator/sdk-common";
import { base64UrlDecodeToString, importPrivateKey, signJwt } from "../jwt";
import type { GoogleProductPurchase, GoogleRtdnNotification, GoogleStore, GoogleSubscriptionPurchase } from "../port";

/**
 * Google Play Developer API client. Auth: service-account OAuth2 (JWT RS256 exchanged
 * for an access token, cached until close to expiry). The service account must be
 * invited in Play Console with "view financial data" + "manage orders" permissions.
 */
export interface GoogleStoreConfig {
  /** Service-account client_email. */
  email: string;
  /** Service-account private_key (PKCS#8 PEM). */
  privateKey: string;
  /** Android application id, e.g. "com.tintvs". */
  packageName: string;
  /** Overrides for tests. */
  apiUrl?: string;
  oauthUrl?: string;
  fetch?: typeof fetch;
}

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const OAUTH = "https://oauth2.googleapis.com/token";

/** Google Play RTDN subscriptionNotification.notificationType — int code → event name. */
const SUBSCRIPTION_NOTIFICATION_TYPES: Record<number, string> = {
  1: "SUBSCRIPTION_RECOVERED",
  2: "SUBSCRIPTION_RENEWED",
  3: "SUBSCRIPTION_CANCELED",
  4: "SUBSCRIPTION_PURCHASED",
  5: "SUBSCRIPTION_ON_HOLD",
  6: "SUBSCRIPTION_IN_GRACE_PERIOD",
  7: "SUBSCRIPTION_RESTARTED",
  8: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED",
  9: "SUBSCRIPTION_DEFERRED",
  10: "SUBSCRIPTION_PAUSED",
  11: "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED",
  12: "SUBSCRIPTION_REVOKED",
  13: "SUBSCRIPTION_EXPIRED",
};

/** Google Play RTDN oneTimeProductNotification.notificationType — int code → event name. */
const ONE_TIME_NOTIFICATION_TYPES: Record<number, string> = {
  1: "ONE_TIME_PRODUCT_PURCHASED",
  2: "ONE_TIME_PRODUCT_CANCELED",
};

export function createGoogleStore(config: GoogleStoreConfig): GoogleStore {
  const doFetch = config.fetch ?? globalThis.fetch;
  const api = config.apiUrl ?? API;
  const oauth = config.oauthUrl ?? OAUTH;
  const app = `/applications/${encodeURIComponent(config.packageName)}`;

  let cached: { token: string; expiresAt: number } | null = null;
  async function token(): Promise<string> {
    if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const key = await importPrivateKey(config.privateKey, "RS256");
    const assertion = await signJwt(
      "RS256",
      { typ: "JWT" },
      {
        iss: config.email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: OAUTH, // audience is the REAL token endpoint even when oauthUrl is overridden in tests
        iat: now,
        exp: now + 3600,
      },
      key,
    );
    const res = await doFetch(oauth, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof body.access_token !== "string") {
      throw new TcError("iap_google_auth_failed", `oauth ${res.status}`, undefined, res.status);
    }
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
    cached = { token: body.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return cached.token;
  }

  async function request(method: string, path: string): Promise<Record<string, unknown>> {
    const res = await doFetch(api + path, { method, headers: { Authorization: `Bearer ${await token()}` } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new TcError("iap_google_request_failed", `google ${res.status}`, { path, body }, res.status);
    }
    return body;
  }

  /** Acknowledge is mandatory but idempotence-friendly: "already acknowledged" is swallowed. */
  async function acknowledge(path: string): Promise<void> {
    try {
      await request("POST", path);
    } catch (err) {
      if (err instanceof TcError && err.status === 400) return; // benign: already acknowledged
      throw err;
    }
  }

  return {
    getSubscription(purchaseToken: string): Promise<GoogleSubscriptionPurchase> {
      return request("GET", `${app}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
    },

    getProduct(productId: string, purchaseToken: string): Promise<GoogleProductPurchase> {
      return request(
        "GET",
        `${app}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`,
      );
    },

    acknowledgeSubscription(subscriptionId: string, purchaseToken: string): Promise<void> {
      return acknowledge(
        `${app}/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      );
    },

    acknowledgeProduct(productId: string, purchaseToken: string): Promise<void> {
      return acknowledge(
        `${app}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      );
    },
  };
}

/**
 * Decode a Google RTDN Pub/Sub push body. Decoding only — the caller validates the
 * shared token in the URL and confirms state via `getSubscription`/`getProduct`.
 */
export function parseGoogleRtdn(body: string): GoogleRtdnNotification {
  let envelope: { message?: { data?: string; messageId?: string } };
  try {
    envelope = JSON.parse(body) as { message?: { data?: string; messageId?: string } };
  } catch {
    throw new TcError("iap_notification_invalid", "body is not JSON");
  }
  let inner: Record<string, unknown> = {};
  if (typeof envelope.message?.data === "string") {
    try {
      inner = JSON.parse(base64UrlDecodeToString(envelope.message.data)) as Record<string, unknown>;
    } catch {
      inner = {};
    }
  }
  const sub = inner.subscriptionNotification as Record<string, unknown> | undefined;
  const oneTime = inner.oneTimeProductNotification as Record<string, unknown> | undefined;
  const test = inner.testNotification as Record<string, unknown> | undefined;
  const note = sub ?? oneTime ?? {};
  const typeCode = Number(note.notificationType);
  const typeName = sub
    ? SUBSCRIPTION_NOTIFICATION_TYPES[typeCode]
    : oneTime
      ? ONE_TIME_NOTIFICATION_TYPES[typeCode]
      : undefined;
  return {
    messageId: envelope.message?.messageId,
    packageName: typeof inner.packageName === "string" ? inner.packageName : undefined,
    type: test ? "TEST_NOTIFICATION" : (typeName ?? String(note.notificationType ?? "unknown")),
    typeCode: Number.isFinite(typeCode) ? typeCode : undefined,
    purchaseToken: typeof note.purchaseToken === "string" ? note.purchaseToken : undefined,
    subscriptionId: typeof note.subscriptionId === "string" ? note.subscriptionId : undefined,
    sku: typeof note.sku === "string" ? note.sku : undefined,
    isTest: Boolean(test),
    verified: false,
    raw: inner,
  };
}
