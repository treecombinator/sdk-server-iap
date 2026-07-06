import { TcError } from "@treecombinator/sdk-common";
import type { Iap, IapNotification, IapPlatform } from "../port";

export interface IapConfig {
  /**
   * Store credentials for validate():
   *  - apple: App Store Server API key (issuer/keyId/p8) to sign ES256 requests
   *  - google: Play Developer API service-account access
   * Left open; validate() requires the real integration per store.
   */
  apple?: unknown;
  google?: unknown;
}

/** Decode a JWS payload segment. Decoding only — the signature is NOT verified here. */
function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split(".");
  if (parts.length < 2) return {};
  const seg = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return JSON.parse(atob(seg + "===".slice((seg.length + 3) % 4))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

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

export function createStoresIap(config: IapConfig = {}): Iap {
  return {
    async validate(input) {
      const credentials = input.platform === "ios" ? config.apple : config.google;
      if (!credentials) {
        throw new TcError("iap_credentials_unconfigured", `no ${input.platform} store credentials configured`);
      }
      // The store calls themselves (Apple App Store Server API / Google Play Developer API)
      // are not implemented in this adapter — credentials alone do not enable validation.
      throw new TcError(
        "iap_validate_unimplemented",
        "store receipt validation is not implemented; do not grant entitlements from client receipts without it",
      );
    },

    async parseNotification(platform: IapPlatform, body: string): Promise<IapNotification> {
      if (platform === "ios") {
        // Apple App Store Server Notifications V2: { signedPayload: <JWS> }.
        // The JWS x5c certificate chain is NOT verified — hence verified: false.
        const envelope = JSON.parse(body) as { signedPayload?: string };
        const payload = envelope.signedPayload ? decodeJwsPayload(envelope.signedPayload) : {};
        const data = (payload.data ?? {}) as Record<string, unknown>;
        const info = data.signedTransactionInfo
          ? decodeJwsPayload(String(data.signedTransactionInfo))
          : {};
        return {
          platform,
          type: String(payload.notificationType ?? "unknown"),
          productId: info.productId ? String(info.productId) : undefined,
          transactionId: info.transactionId ? String(info.transactionId) : undefined,
          verified: false,
          raw: payload,
        };
      }

      // Google Play RTDN: Pub/Sub envelope { message: { data: base64(JSON) } }.
      // Not confirmed against the Play Developer API — hence verified: false.
      const envelope = JSON.parse(body) as { message?: { data?: string } };
      const json = envelope.message?.data
        ? (JSON.parse(atob(envelope.message.data)) as Record<string, unknown>)
        : {};
      const sub = json.subscriptionNotification as Record<string, unknown> | undefined;
      const oneTime = json.oneTimeProductNotification as Record<string, unknown> | undefined;
      const note = sub ?? oneTime ?? {};
      const typeCode = Number(note.notificationType);
      const typeName = sub
        ? SUBSCRIPTION_NOTIFICATION_TYPES[typeCode]
        : oneTime
          ? ONE_TIME_NOTIFICATION_TYPES[typeCode]
          : undefined;
      return {
        platform,
        type: typeName ?? String(note.notificationType ?? "unknown"),
        productId: note.subscriptionId ? String(note.subscriptionId) : note.sku ? String(note.sku) : undefined,
        transactionId: note.purchaseToken ? String(note.purchaseToken) : undefined,
        verified: false,
        raw: json,
      };
    },
  };
}
