/**
 * The PORT of the iap domain — in-app purchases (Apple/Google), distinct from
 * external payment. Covers receipt validation AND store server-notification webhooks
 * (Apple App Store Server Notifications V2 / Google Play RTDN).
 */
export type IapPlatform = "ios" | "android";

export interface ValidateInput {
  platform: IapPlatform;
  /** Receipt / purchase token from the client. */
  token: string;
  productId?: string;
}

export interface Purchase {
  productId: string;
  transactionId: string;
  platform: IapPlatform;
  purchasedAt: string;
  /** For subscriptions. */
  expiresAt?: string;
  raw: unknown;
}

export interface IapNotification {
  platform: IapPlatform;
  /**
   * Store event name: Apple V2 names on ios (e.g. "SUBSCRIBED", "DID_RENEW", "EXPIRED"),
   * Google RTDN names on android (e.g. "SUBSCRIPTION_PURCHASED", "SUBSCRIPTION_RENEWED").
   */
  type: string;
  productId?: string;
  transactionId?: string;
  /**
   * True only when the adapter verified the notification's authenticity (signature check or
   * store lookup). When false, treat the event as UNTRUSTED input — anyone can POST a webhook.
   */
  verified: boolean;
  raw: unknown;
}

export interface Iap {
  /** Validate a client purchase against the store. Requires store credentials. */
  validate(input: ValidateInput): Promise<Purchase>;
  /** Parse + classify a store server-notification webhook. */
  parseNotification(platform: IapPlatform, body: string): Promise<IapNotification>;
}
