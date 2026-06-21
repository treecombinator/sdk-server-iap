# @treecombinator/sdk-server-iap

---

> Developed by Danthur Lice.\
> Copyright © 2026 Tree Combinator.\
> Contact: dev (at) treecombinator.com

---

The **in-app-purchase** domain of the Tree Combinator SDK — normalizes Apple App Store and Google Play into one purchase shape. It parses store-to-server notifications (Apple App Store Server Notifications V2, Google Play RTDN) out of the box, with zero runtime dependencies.

## Install

```bash
npm install github:treecombinator/sdk-server-iap
```

## Use

```ts
import { createIap } from "@treecombinator/sdk-server-iap";

const iap = createIap();

// Webhook handler: classify a store server-notification (no credentials needed).
const note = await iap.parseNotification("ios", rawBody);     // Apple S2S V2
// const note = await iap.parseNotification("android", rawBody); // Google RTDN
// → { platform, type, productId?, transactionId?, raw }

// Receipt validation against the store (requires credentials):
const purchase = await iap.validate({ platform: "ios", token: receiptToken });
// → { productId, transactionId, platform, purchasedAt, expiresAt?, raw }
```

`createIap(config?)` returns the IAP API:

- `parseNotification(platform, body)` — parse and classify a raw store webhook body into an `IapNotification` (`{ platform, type, productId?, transactionId?, raw }`). `type` is the store event name (e.g. `"SUBSCRIBED"`, `"DID_RENEW"`, `"EXPIRED"`, `"REFUND"`). Works without credentials.
- `validate(input)` — validate a client purchase against the store, returning a normalized `Purchase`. Requires store credentials.

`platform` is `"ios" | "android"`. Config: `{ apple?, google? }` — store credentials for `validate()` (Apple App Store Server API key to sign ES256 requests; Google Play Developer API service-account access). The package also exports the wire types `Iap`, `Purchase`, `IapNotification`, `IapPlatform`, `ValidateInput` and `IapConfig`.

## Notes

- `parseNotification` works without credentials; `validate()` requires them and throws until `apple`/`google` are configured.
- `parseNotification` decodes the notification envelope but does not verify the signature: confirm Apple's JWS x5c certificate chain, or look up the Google Play Developer API, before trusting an event.
