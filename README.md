# @treecombinator/sdk-server-iap

---

> Developed by Danthur Lice.\
> Copyright © 2026 Tree Combinator.\
> Contact: dev (at) treecombinator.com

---

The **IAP** domain of the Tree Combinator SDK on the server — typed clients for the two store server APIs plus webhook parsers. It powers a BFF's purchase verification (`/billing/verify`-style routes) and store webhooks. What it deliberately does NOT do: product→entitlement mapping, persistence, or entitlement derivation — those are product decisions that live in the app's BFF.

## Install

```bash
givo add @treecombinator/sdk-server-iap
```

## Use

```ts
import {
  createAppleStore,
  createGoogleStore,
  parseAppleNotification,
  parseGoogleRtdn,
} from "@treecombinator/sdk-server-iap";

// Apple App Store Server API — auth is a JWT ES256 signed with an IN-APP PURCHASE key.
const apple = createAppleStore({
  keyP8: env.APPLE_IAP_KEY_P8,
  keyId: env.APPLE_IAP_KEY_ID,
  issuerId: env.APPLE_IAP_ISSUER_ID,
  bundleId: "com.example",
});
const tx = await apple.getTransaction(transactionId); // production first; sandbox on 4040010
const statuses = await apple.getSubscriptionStatuses(tx.originalTransactionId!);
await apple.requestTestNotification(); // asks Apple to hit your webhook

// Google Play Developer API — service-account OAuth (invited in Play Console with
// "view financial data" + "manage orders").
const google = createGoogleStore({
  email: env.GOOGLE_SA_EMAIL,
  privateKey: env.GOOGLE_SA_PRIVATE_KEY,
  packageName: "com.example",
});
const sub = await google.getSubscription(purchaseToken); // subscriptionsv2
const product = await google.getProduct(productId, purchaseToken);
await google.acknowledgeSubscription(subscriptionId, purchaseToken); // mandatory ≤3 days; idempotent

// Webhooks: DECODE ONLY (verified: false) — dedupe, then confirm via the clients above.
const appleNotification = parseAppleNotification(requestBody);
const rtdn = parseGoogleRtdn(requestBody);
```

## Trust model

Store webhooks are unauthenticated HTTP from your point of view: anyone can POST one. The parsers therefore never mark anything `verified` — they exist to tell you WHAT to confirm. The rule for a correct BFF:

1. Parse → dedupe (`notificationUUID` / Pub/Sub `messageId`).
2. Confirm the CURRENT state with `getSubscriptionStatuses` / `getSubscription` over TLS.
3. Only then write to your database.

## Notes

- Key types matter on Apple: the In-App Purchase key is its own kind — a Sign in with Apple/APNs key or an App Store Connect API team key gets a 401.
- `createAppleStore` retries the sandbox host when production answers `4040010` (transaction not found), Apple's recommended routing for review/sandbox purchases.
- OAuth/JWTs are cached near their expiry (Apple ~20 min, Google ~1 h) per store instance.
- Test seams: `productionUrl`/`sandboxUrl` (Apple), `apiUrl`/`oauthUrl` (Google) and `fetch` are injectable.
- Errors are `TcError` (`@treecombinator/sdk-common`) carrying the HTTP `status` and a specific code (`iap_apple_auth_failed`, `iap_google_request_failed`, `iap_notification_invalid`, …).
