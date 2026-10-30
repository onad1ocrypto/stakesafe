# StakeSafe

**Staking, in sight.** Independent read-only Nimiq Pay mini app for mainnet staking records and validator discovery.

Live: https://stakesafe-kappa.vercel.app

Open in Nimiq Pay: https://nimpay.app/miniapps/open/stakesafe-kappa.vercel.app

## What works

- Official `@nimiq/mini-app-sdk` integration: `init()` waits for host injection; `listAccounts()` requests user-approved shared addresses. Supported hosts use `getBalance()` for the selected address. No signing or payment requests.
- Browser fallback: watch a checksum-validated public mainnet address.
- Explicit consent before sending the selected address to `rpc.nimiqwatch.com`.
- Real active, inactive, and retired stake, delegation, source block, and validator flags from RPC. Missing staker records are distinguished from failures. Failed checks retain labeled last-known values instead of replacing them with zero.
- Foreground auto-refresh every 60 seconds while visible, pause/resume, manual refresh, on-screen change alerts, and up to 100 session events.
- Mainnet-only guard: known testnet hosts are blocked; unknown/older hosts require explicit mainnet confirmation. Wallet addresses and session history are not persisted.
- Public validator directory: search, payout filters, fee sorting, source disclosures, and a fixed official-wallet handoff. It does not preselect a validator or initiate staking.
- English UI, Light / Dark / System themes, responsive mobile layouts.

## Open inside Nimiq Pay

Use the open-in-app link above, or Nimiq Pay → Mini Apps → Custom URL → `https://stakesafe-kappa.vercel.app`.

Click **Connect Nimiq Pay**, review source/privacy and mainnet confirmations, then approve account sharing in the native wallet. If several addresses are shared, choose one to monitor. The selection is not a wallet signer selection or proof of ownership. Disconnect and reconnect to request a fresh shared list.

A normal desktop browser does not have the Nimiq Pay provider. It can still monitor a public address, without pretending to connect a wallet. A newly accessed mini app may trigger Nimiq Pay's warning screen.

## Deliberate limits

- **Foreground only.** No background monitoring, email, Telegram, push notifications, server-side subscriptions, or delivery guarantees.
- No transaction signing, fund custody, automatic delegation, guaranteed rewards, or safety rankings. Never transfer funds directly to a validator address.
- Validator flags are reported as-is, not interpreted as guaranteed current performance. A historical jail marker does not prove current jail duration. Separate RPC responses are not an atomic snapshot or an independently verified consensus proof.
- On-chain checks and directory retrieval depend on third-party availability. Host testnet is not supported in this version. Refresh after changing networks; disconnect when finished.
- SDK behavior has been tested with controlled host responses. **Physical-device Nimiq Pay approval, WebView behavior, and external-wallet handoff still require owner testing.** Not yet claimed to be fully approved or competition-compliant.

## Development

Node.js 20+ and Python 3:

```sh
npm ci
npm start
# Builds and serves dist on port 3000
```

```sh
npx playwright install --with-deps chromium
npm test
```

Tests cover the SDK wrapper with host stubs, consent, denial, missing provider, testnet guard, real-data rendering, no-staker vs RPC errors, stale values, disconnection, directory filtering, official wallet destination, themes and mobile widths. Mock tests do not prove native-device compatibility. Directory test data is fetched from the public API if no local test fixture exists.

## Build and deployment

```sh
npm ci
npm run build
```

The build bundles the official SDK locally with esbuild and copies an explicit allowlist of assets to `dist/`. No CDN is needed for the SDK. Vercel uses `vercel.json`. No credentials or environment variables are required by the app. Build files, test fixtures, screenshots, private documents, and repository configuration are not served.

Current deployment updates are manual; automatic Git-triggered Vercel deployment is not configured.

## Before competition submission

Rules: https://miniappscompetition.com/rules
Framework: https://nimiq.dev/mini-apps

- Complete supported-device testing inside Nimiq Pay.
- Confirm category eligibility, entrant details, and the one-submission-per-team rule.
- Describe the actual foreground-monitoring scope, not background notifications.
- Enable GitHub private vulnerability reporting and confirm a private reporting channel.
- Make no claim of organizer approval or zero risk.

## Privacy, attribution, license

Read [privacy.html](privacy.html), [SECURITY.md](SECURITY.md), [ATTRIBUTIONS.md](ATTRIBUTIONS.md), and [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

Project code is MIT. Third-party names and metadata are not relicensed by the project license. StakeSafe is not an official Nimiq service and is not endorsed by any validator.
