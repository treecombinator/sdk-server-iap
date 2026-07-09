# AGENTS.md — @treecombinator/sdk-server-iap

> Guide for AI agents. IAP domain of the Tree Combinator SDK on the server: clients for
> the Apple App Store Server API and the Google Play Developer API, plus webhook parsers
> (Apple Server Notifications V2 / Google RTDN). Product mapping, storage and
> entitlement derivation are the APP's job — this package only talks to the stores.

## Use

```ts
import { createAppleStore, createGoogleStore, parseAppleNotification, parseGoogleRtdn } from "@treecombinator/sdk-server-iap";

const apple = createAppleStore({ keyP8, keyId, issuerId, bundleId }); // IN-APP PURCHASE key (.p8)
const tx = await apple.getTransaction(transactionId);       // production first, sandbox on not-found (4040010/4040005)
const statuses = await apple.getSubscriptionStatuses(tx.originalTransactionId);

const google = createGoogleStore({ email, privateKey, packageName }); // service-account
const sub = await google.getSubscription(purchaseToken);    // subscriptionsv2
await google.acknowledgeSubscription(subscriptionId, purchaseToken); // MANDATORY ≤3 days; idempotent

const an = parseAppleNotification(body);  // { type, subtype?, notificationUUID, transaction?, verified: false }
const gn = parseGoogleRtdn(body);         // { messageId, type, purchaseToken?, isTest, verified: false }
```

## Notes

- TRUST MODEL: parsers DECODE only (`verified: false`, always) — anyone can POST a webhook. Dedupe by `notificationUUID`/`messageId`, then CONFIRM real state via `getSubscriptionStatuses`/`getSubscription` before writing anything.
- Apple auth = JWT ES256 with an **In-App Purchase** key (not Sign in with Apple/APNs, not a Connect API team key — wrong key type 401s). Google auth = service-account OAuth (RS256), token cached; the SA needs Play Console permissions "view financial data" + "manage orders".
- `apiUrl`/`oauthUrl`/`productionUrl`/`sandboxUrl`/`fetch` are injectable for tests.
- Errors are `TcError` with `.status`: `iap_apple_auth_failed`, `iap_apple_request_failed`, `iap_apple_response_invalid`, `iap_google_auth_failed`, `iap_google_request_failed`, `iap_notification_invalid`.
- `acknowledge*` swallows the benign already-acknowledged 400 — safe to call on every verify.
