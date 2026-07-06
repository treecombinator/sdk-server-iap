# AGENTS.md — @treecombinator/sdk-server-iap

In-app purchase domain of the Tree Combinator SDK (Apple App Store / Google Play). Distinct from external payment. Normalizes both stores into one purchase shape and parses their server-to-server notifications. Zero runtime dependencies.

## Use

```ts
import { createIap } from "@treecombinator/sdk-server-iap";

const iap = createIap();
const note = await iap.parseNotification("ios", rawBody);     // Apple S2S V2 / "android" → Google RTDN
// → { platform, type, productId?, transactionId?, verified: false, raw }
```

`createIap(config?)` → `parseNotification(platform, body)`, `validate(input)`.
`platform` is `"ios" | "android"`. Config: `{ apple?, google? }` (store credentials).
`type` is the store event name (Apple V2 names on ios; Google RTDN names on android).
Wire types: `Iap`, `Purchase`, `IapNotification`, `IapPlatform`, `ValidateInput`, `IapConfig`.

## Notes

- Notifications come back `verified: false` — nothing is signature-checked. Never grant entitlements from a webhook alone; confirm with Apple (JWS x5c chain) or the Google Play Developer API first.
- `validate()` is a STUB: it always throws a `TcError` (`iap_credentials_unconfigured` without credentials, `iap_validate_unimplemented` with them). Configuring credentials does not enable it.
