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
  /** e.g. "SUBSCRIBED", "DID_RENEW", "EXPIRED", "REFUND". */
  type: string;
  productId?: string;
  transactionId?: string;
  raw: unknown;
}

export interface Iap {
  /** Validate a client purchase against the store. Requires store credentials. */
  validate(input: ValidateInput): Promise<Purchase>;
  /** Parse + classify a store server-notification webhook. */
  parseNotification(platform: IapPlatform, body: string): Promise<IapNotification>;
}
