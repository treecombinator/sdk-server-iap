# AGENTS.md — @treecombinator/sdk-server-iap

In-app purchase domain of the Tree Combinator SDK (Apple App Store / Google Play). Distinct from external payment. Normalizes both stores into one purchase shape and parses their server-to-server notifications. Zero runtime dependencies.

## Use

```ts
import { createIap } from "@treecombinator/sdk-server-iap";

const iap = createIap();
const note = await iap.parseNotification("ios", rawBody);     // Apple S2S V2 / "android" → Google RTDN
const purchase = await iap.validate({ platform: "ios", token }); // needs store credentials
```

`createIap(config?)` → `parseNotification(platform, body)`, `validate(input)`.
`platform` is `"ios" | "android"`. Config: `{ apple?, google? }` (store credentials for `validate()`).
Wire types: `Iap`, `Purchase`, `IapNotification`, `IapPlatform`, `ValidateInput`, `IapConfig`.

## Notes

- `parseNotification` works without credentials; `validate()` requires them and throws a plain `Error` until `apple`/`google` are configured.
- `parseNotification` decodes the envelope but does not verify signatures — verify Apple's JWS x5c chain or the Google Play Developer API before trusting an event.
