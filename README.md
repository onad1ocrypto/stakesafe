# StakeSafe

**Staking, in sight.** Independent Nimiq Pay mini app for mainnet staking monitoring, validator discovery and opt-in native staking.

Live: https://stakesafe-kappa.vercel.app

## What works

- Official `@nimiq/mini-app-sdk` integration: `init()` waits for host injection; `listAccounts()` requests user-approved shared addresses. Supported hosts use `getBalance()` for the selected address. Connecting for monitoring requests no signature or transaction.
- Browser fallback: watch a checksum-validated public mainnet address.
- Explicit consent before mainnet reads. The browser uses the same-origin `/api/rpc` gateway, which forwards allowlisted read-only requests to `rpc.nimiqwatch.com`.
- Real active, inactive, and retired stake, delegation, source block, and validator flags from RPC. Missing staker records are distinguished from failures. Failed checks retain labeled last-known values instead of replacing them with zero.
- Foreground auto-refresh every 60 seconds while visible, pause/resume, manual refresh, on-screen change alerts, and up to 100 session events.
- Mainnet-only guard: known testnet hosts are blocked; unknown/older hosts require explicit mainnet confirmation. The optional Remember this address setting persists only the selected public address and RPC/mainnet consent on this device. Shared account lists, balances, and history are not persisted.
- Public validator directory: search, payout filters, fee sorting, source disclosures, and native Pay staking with an explicit preview and native confirmation. A separate web-wallet link remains optional.
- English UI, Light / Dark / System themes, responsive mobile layouts with a top hamburger menu (no bottom navigation bar).

## Open inside Nimiq Pay

1. Open Nimiq Pay on your phone.
2. Go to **Mini Apps** and find the **Custom URL** field.
3. Enter `https://stakesafe-kappa.vercel.app`.
4. Load StakeSafe inside the app.

No external app-opening link is provided. If your version does not expose Custom URL, check the current Nimiq Pay instructions or update the app.

Click **Connect Nimiq Pay**, review source/privacy and mainnet confirmations, then approve account sharing in the native wallet. If several addresses are shared, choose one to monitor. The selection is not a wallet signer selection or proof of ownership. Use Change address to request a fresh shared list. Disconnect & forget removes the remembered address.

**No repeated connection for read-only monitoring:** keep Remember this address enabled at first connection. On return, the saved mainnet address is queried through the read-only gateway; wallet account permissions are not requested again. This is a remembered watch address, not a wallet login or proof of ownership. If you switch Nimiq Pay wallets, use Change address; the app will not silently assume the remembered address belongs to the current wallet. Storage must remain available on the same site and device.

A normal desktop browser does not have the Nimiq Pay provider. It can still monitor a public address, without pretending to connect a wallet. A newly accessed mini app may trigger Nimiq Pay's warning screen.

## Stake inside Pay

1. Open a validator’s details and choose **Continue in Nimiq Pay**.
2. Review the data-source disclosure and approve the native **account-check message**. This is not a transaction. The reported public key is converted to an address (cross-checked against official Nimiq Core); this host response identifies the account to query, not a backend login or independently verified ownership proof. The signature is not sent to a server or stored.
3. StakeSafe reads that account’s current balance/position and the validator’s current flags. The account can differ from your remembered watch address.
4. Review **create position**, **add stake to the same delegation**, or a separately disclosed **change validator**. A change requests reactivation of all eligible inactive stake; it does not withdraw retired funds. New positions require at least 100 NIM, matching the protocol minimum (10,000,000 Luna). Additions are positive; a zero active/inactive position also needs the minimum. Amounts accept at most five decimals, never floating-point coin multiplication. The basic address balance is not Pay’s wallet spendable total: Pay may hold funds in HTLCs while the owner address reads 0. StakeSafe cannot quote that total and does not gate affordability on the basic address balance. Pay must validate funds and display/validate the final fee. StakeSafe charges no service fee.
5. Continue to native Pay confirmation. **The SDK has no sender-binding parameter. Verify the selected Pay wallet, staking identity if shown, mainnet, validator, action, amount and fee. The preview identifies the staker/owner, not necessarily the funding From address: Pay normally spends from an HTLC. Cancel if wallet or transaction details are wrong or cannot be verified.** If your Pay version cannot show these details, do not approve. Native signing requires a known host `mainnet` value, durable device storage, and Web Locks for cross-tab exclusion; unknown networks cannot sign.

Live reads are rechecked immediately before the native request. Retired/flagged or unverifiable validators, invalid basic-account responses and changed positions block the action. A historical jail marker can block this conservative flow without proving the validator is currently jailed.

A returned hash is **submitted, not confirmed**. Use the read-only transaction check. It matches mainnet ID, the basic sender or HTLC owner proof, staking-contract destination/type, staking payload/action/delegation or staker address, value, mined execution, and the expected staking record before displaying a successful RPC observation. This is not an independent consensus/finality proof. Missing data or timeouts never imply a failed transaction or a successful stake.

The public attempt details (account, validator, amount, action, prior stake total, time, status and optional hash) are stored locally, even if Remember this address is off. There is one unresolved attempt at a time; cancellation, ambiguous errors and reload never auto-retry a transaction. A persistent review notice remains until you inspect Pay and explicitly clear it. **Clearing the notice/site storage or Disconnect does not cancel an on-chain transaction.** Disconnect & forget clears the monitoring address, not the separate attempt guard. Keep the guard until you resolve the outcome. Do not retry blindly after connection loss or a pending prompt.

## Deliberate limits

- **Foreground only.** No background monitoring, email, Telegram, push notifications, server-side subscriptions, or delivery guarantees.
- No key custody, server-side transaction submission, automatic delegation, guaranteed rewards, or safety rankings. Transaction signing and confirmation remain in Nimiq Pay. Never transfer funds directly to a validator address.
- Validator flags are reported as-is, not interpreted as guaranteed current performance. A historical jail marker does not prove current jail duration. Separate RPC responses are not an atomic snapshot or an independently verified consensus proof.
- On-chain checks and directory retrieval depend on third-party availability. Host testnet is not supported in this version. Refresh after changing networks; disconnect when finished.
- SDK behavior has been tested with controlled host responses. **Physical-device Nimiq Pay signatures, transaction previews, approval/cancellation and WebView compatibility still require owner testing. No real transaction was submitted during automated tests.**

## Development

Node.js 20+:

```sh
npm ci
npm start
# Builds and serves dist on port 3000
```

```sh
npx playwright install --with-deps chromium
npm test
```

Tests cover the SDK wrapper with host stubs, consent, denial, missing provider, testnet guard, real-data rendering, no-staker vs RPC errors, stale values, disconnection, directory filtering, native create/add/explicit delegation switch, exact Luna conversion, minimum-stake checks, zero-basic-balance HTLC funding, strict native mainnet gating, cancellation, unknown outcomes, duplicate/reload/multi-tab guards, read-only transaction matching, themes and mobile widths. Mock tests do not prove native-device compatibility. Directory test data is fetched from the public API if no local test fixture exists.

## Build and deployment

```sh
npm ci
npm run build
```

The build bundles the official SDK locally with esbuild and copies an explicit allowlist of browser assets to `dist/`. `api/rpc.js` is a separate Vercel Node.js function, not a static file. `npm start` runs the same gateway locally. Static-only hosting without the API function is not supported. No CDN is needed for the SDK. Vercel uses `vercel.json`; deploy the API function alongside the assets. The upstream has a seven-second deadline per attempt and one retry for transient failures. Browser requests have a separate timeout; repeated identical failure toasts are throttled for five minutes while errors remain visible in the status/history. No credentials or environment variables are required by the app. Build files, test fixtures, screenshots, private documents, and repository configuration are not served.

Current deployment updates are manual; automatic Git-triggered Vercel deployment is not configured.

## Privacy, attribution, license

Read [privacy.html](privacy.html), [SECURITY.md](SECURITY.md), [ATTRIBUTIONS.md](ATTRIBUTIONS.md), and [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

Project code is MIT. Third-party names and metadata are not relicensed by the project license. StakeSafe is not an official Nimiq service and is not endorsed by any validator.

### Pay HTLC balance boundary

The displayed basic-address balance is not the total shown on Pay’s home screen. `getAccountByAddress` and the native `getBalance(address)` can both correctly return zero for the owner address while Pay funds remain in HTLCs. StakeSafe shows the wallet spendable total as unavailable rather than inventing a total or blocking on that zero. Final affordability belongs to Pay. Post-submission checks accept HTLC funding only with the expected canonical local-owner proof; create/change actions also match the inner staking-owner proof, and additions match the explicit staker address. These identity-format matches rely on the RPC mined-execution result for signature/contract validation; they are not independent cryptographic or consensus verification. Unknown proof formats stay unverified and must not be blindly resubmitted.
