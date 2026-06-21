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

/** Decode a JWS payload segment (no signature verification — see TODO in parseNotification). */
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

export function createStoresIap(config: IapConfig = {}): Iap {
  void config;
  return {
    async validate() {
      // Requires Apple App Store Server API (ES256 JWT) or Google Play Developer API
      // (service-account token). Wire credentials via IapConfig and call the store endpoint.
      throw new Error("iap.validate: store credentials required (configure Apple/Google).");
    },

    async parseNotification(platform: IapPlatform, body: string): Promise<IapNotification> {
      if (platform === "ios") {
        // Apple App Store Server Notifications V2: { signedPayload: <JWS> }
        // TODO: verify the JWS x5c certificate chain before trusting.
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
          raw: payload,
        };
      }

      // Google Play RTDN: Pub/Sub envelope { message: { data: base64(JSON) } }
      // TODO: confirm via Play Developer API lookup before trusting.
      const envelope = JSON.parse(body) as { message?: { data?: string } };
      const json = envelope.message?.data
        ? (JSON.parse(atob(envelope.message.data)) as Record<string, unknown>)
        : {};
      const note = (json.subscriptionNotification ?? json.oneTimeProductNotification ?? {}) as Record<string, unknown>;
      return {
        platform,
        type: String(note.notificationType ?? "unknown"),
        productId: note.subscriptionId ? String(note.subscriptionId) : note.sku ? String(note.sku) : undefined,
        transactionId: note.purchaseToken ? String(note.purchaseToken) : undefined,
        raw: json,
      };
    },
  };
}
