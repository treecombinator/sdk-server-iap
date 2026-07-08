/**
 * The IAP domain on the server — in-app purchases against the two stores, distinct
 * from external payment. Two store clients (Apple App Store Server API / Google Play
 * Developer API) plus webhook parsers (Apple Server Notifications V2 / Google RTDN).
 *
 * Trust model: webhook payloads are DECODED, never verified locally — `verified: false`
 * on every parsed notification. The BFF confirms the real state with a store-client
 * call over TLS before writing anything (the parse only tells it WHAT to confirm).
 */

/** Decoded slice of an Apple signed transaction (JWS payload of signedTransactionInfo). */
export interface AppleTransaction {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  /** "Auto-Renewable Subscription" | "Consumable" | "Non-Consumable" | "Non-Renewing Subscription" */
  type?: string;
  /** ms epoch. */
  purchaseDate?: number;
  /** ms epoch — subscriptions only. */
  expiresDate?: number;
  /** ms epoch — present when refunded/revoked. */
  revocationDate?: number;
  bundleId?: string;
  environment?: string;
  raw: Record<string, unknown>;
}

/** One subscription's current state as the Apple statuses endpoint reports it. */
export interface AppleSubscriptionStatus {
  /** 1 active · 2 expired · 3 billing retry · 4 grace period · 5 revoked. */
  status: number;
  transaction: AppleTransaction;
  /** Decoded signedRenewalInfo (autoRenewStatus, expirationIntent…). */
  renewal: Record<string, unknown>;
}

export interface AppleStore {
  /** Look a transaction up (production first, sandbox on 4040010). Throws TcError. */
  getTransaction(transactionId: string): Promise<AppleTransaction>;
  /** Current state of every subscription sharing the originalTransactionId. */
  getSubscriptionStatuses(originalTransactionId: string): Promise<AppleSubscriptionStatus[]>;
  /** Asks Apple to POST a test notification to the configured webhook URL. */
  requestTestNotification(): Promise<{ testNotificationToken?: string }>;
}

/** Decoded Apple App Store Server Notification V2 (NOT verified — confirm via client). */
export interface AppleNotification {
  /** e.g. SUBSCRIBED, DID_RENEW, DID_CHANGE_RENEWAL_STATUS, EXPIRED, REFUND. */
  type: string;
  subtype?: string;
  /** Dedupe key. */
  notificationUUID?: string;
  environment?: string;
  transaction?: AppleTransaction;
  renewal?: Record<string, unknown>;
  verified: false;
  raw: Record<string, unknown>;
}

/** Google subscriptionsv2 purchase state (raw API shape, minimally typed). */
export interface GoogleSubscriptionPurchase {
  /** e.g. SUBSCRIPTION_STATE_ACTIVE, _IN_GRACE_PERIOD, _ON_HOLD, _CANCELED, _EXPIRED. */
  subscriptionState?: string;
  lineItems?: { productId?: string; expiryTime?: string; [k: string]: unknown }[];
  acknowledgementState?: string;
  latestOrderId?: string;
  [k: string]: unknown;
}

export interface GoogleProductPurchase {
  /** 0 purchased · 1 canceled · 2 pending. */
  purchaseState?: number;
  /** 0 yet to be consumed · 1 consumed. */
  consumptionState?: number;
  /** 0 yet to be acknowledged · 1 acknowledged. */
  acknowledgementState?: number;
  orderId?: string;
  purchaseTimeMillis?: string;
  [k: string]: unknown;
}

export interface GoogleStore {
  /** subscriptionsv2 lookup by purchase token. Throws TcError. */
  getSubscription(purchaseToken: string): Promise<GoogleSubscriptionPurchase>;
  /** One-time product lookup. Throws TcError. */
  getProduct(productId: string, purchaseToken: string): Promise<GoogleProductPurchase>;
  /**
   * Acknowledge a subscription purchase (MANDATORY within 3 days or Google refunds).
   * Idempotent: an already-acknowledged error is swallowed.
   */
  acknowledgeSubscription(subscriptionId: string, purchaseToken: string): Promise<void>;
  /** Same, for one-time products. */
  acknowledgeProduct(productId: string, purchaseToken: string): Promise<void>;
}

/** Decoded Google RTDN Pub/Sub push (NOT verified — confirm via client). */
export interface GoogleRtdnNotification {
  /** Pub/Sub messageId — dedupe key. */
  messageId?: string;
  packageName?: string;
  /** Mapped event name (e.g. SUBSCRIPTION_RENEWED) or the raw code as string. */
  type: string;
  /** RTDN integer code as received. */
  typeCode?: number;
  /** Present on subscription notifications. */
  purchaseToken?: string;
  subscriptionId?: string;
  /** Present on one-time product notifications. */
  sku?: string;
  /** True for Play's console test notifications. */
  isTest: boolean;
  verified: false;
  raw: Record<string, unknown>;
}
