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
// → { platform, type, productId?, transactionId?, verified: false, raw }
```

`createIap(config?)` returns the IAP API:

- `parseNotification(platform, body)` — parse and classify a raw store webhook body into an `IapNotification` (`{ platform, type, productId?, transactionId?, verified, raw }`). `type` is the store event name — Apple V2 names on ios (e.g. `"SUBSCRIBED"`, `"DID_RENEW"`, `"EXPIRED"`), Google RTDN names on android (e.g. `"SUBSCRIPTION_PURCHASED"`, `"SUBSCRIPTION_RENEWED"`). Works without credentials.
- `validate(input)` — STUB, not implemented: it throws `iap_credentials_unconfigured` without credentials and `iap_validate_unimplemented` with them. The real store calls (Apple App Store Server API / Google Play Developer API) are not built yet.

`platform` is `"ios" | "android"`. Config: `{ apple?, google? }` — store credentials for `validate()` (Apple App Store Server API key to sign ES256 requests; Google Play Developer API service-account access). The package also exports the wire types `Iap`, `Purchase`, `IapNotification`, `IapPlatform`, `ValidateInput` and `IapConfig`.

## Notes

- **Notifications come back `verified: false`**: `parseNotification` decodes the envelope but verifies nothing — anyone who knows the URL can POST a forged webhook. Do NOT grant purchases/entitlements from a notification alone: confirm Apple's JWS x5c certificate chain, or look the purchase up in the Google Play Developer API, first.
- `validate()` is a stub: it always throws (`iap_credentials_unconfigured` / `iap_validate_unimplemented`) — configuring credentials does not enable it. Not production-ready for granting entitlements.
