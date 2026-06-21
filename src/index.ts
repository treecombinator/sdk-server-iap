import type { Iap } from "./port";
import { createStoresIap, type IapConfig } from "./adapters/stores";

export type { Iap, Purchase, IapNotification, IapPlatform, ValidateInput } from "./port";
export type { IapConfig } from "./adapters/stores";

/**
 * IAP domain factory. parseNotification (webhook) works now; validate() needs store
 * credentials (Apple App Store Server API / Google Play Developer API).
 */
export function createIap(config?: IapConfig): Iap {
  return createStoresIap(config);
}
