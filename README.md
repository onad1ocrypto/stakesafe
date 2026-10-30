# StakeSafe

**Staking, in sight.** An independent, non-custodial Nimiq staking interface project.

> **Pre-release prototype — not a finished competition submission.** Monitoring, alert history, balances, and notification delivery are not live. The validator directory is the only live-data feature. Public deployment is for review, not production monitoring.

## Current features

- English interface with responsive mobile and desktop layouts.
- Light, Dark, and System appearance with local persistence.
- Explicit demo scenarios for normal, validator-warning, and unavailable-data conditions.
- Read-only validator directory from the Nimiq Validators API: search, payout filter, fee sorting, source disclosure, error/retry states.
- Fixed external staking handoff to `https://wallet.nimiq.com/staking?page=validators`.
- No custody, transfers, transaction signing, seed phrases, analytics, or marketing trackers.

The staking link opens the official validator list. It **does not preselect a validator** or initiate staking. Users must review their choice and confirm in Nimiq Wallet. Never transfer NIM directly to a validator address.

## Development

Requires Node.js 20+ and Python 3 for the local preview server.

```sh
npm ci
npm start
# http://localhost:3000
```

```sh
npx playwright install --with-deps chromium
npm test
```

Validator tests use a local test fixture if present; otherwise they fetch the public API to create the test input. Live API unavailability may prevent that test from starting. Test snapshots are not shipped.

## Production build / Vercel

```sh
npm ci
npm run build
```

Deploy `dist/` as static assets. `vercel.json` configures the build and security headers. No secrets or environment variables are required for the current app. No frame-blocking header is set, because compatibility with the Nimiq Pay host must be tested.

The build uses an explicit allowlist; source tests, research, screenshots, preview exports, dependency directories, and internal documents are not served. Opening `index.html` directly is not the recommended workflow. The sandboxed file viewer can block external API requests; use the live site for directory testing.

## Before competition submission

Rules: https://miniappscompetition.com/rules
Framework: https://nimiq.dev/mini-apps

These items are **not completed**:

- Implement meaningful Nimiq Pay Mini App SDK integration, with consent, host-network handling, and browser fallback. An external wallet link alone must not be assumed to satisfy the integration rule.
- Implement the promised real staking-position monitoring and clear data provenance.
- Implement actual alert delivery, or remove unsupported product promises and adjust the scope.
- Test end-to-end in the actual Nimiq Pay WebView and official wallet, on supported devices.
- Configure a public repository, operator contact, and private vulnerability reporting.
- Confirm entrant eligibility, category, one-submission-per-team rule, submission information, and current deadlines with the organizer.

No claim of organizer approval or complete rule compliance is made.

## Identity and disclosures

Editable vector assets: `logo-light.svg`, `logo-dark.svg`, `logo-symbol.svg`.

Read [ATTRIBUTIONS.md](ATTRIBUTIONS.md), [SECURITY.md](SECURITY.md), and the in-app [privacy and limitations](privacy.html). Independent project; not endorsed by Nimiq. Directory entries and scores are not safety guarantees or investment advice. A successful fetch does not establish that upstream data is current.

## License

Project code: MIT; see [LICENSE](LICENSE). Third-party names and metadata are not relicensed by this project's license.
