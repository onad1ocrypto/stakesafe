# Security policy

StakeSafe is a read-only mainnet staking mini app with foreground monitoring and a public validator directory. Native-device testing is still required before claiming release readiness. It must not be represented as a background monitoring or notification service.

- Never enter a seed phrase or private key in StakeSafe.
- This version does not create or sign transactions and does not receive funds.
- Staking links must remain fixed to the verified official Nimiq Wallet origin.
- Validator-provided metadata is untrusted. Render text escaped; do not inject descriptions or logos as HTML.
- All live-source failures must be visible. Retained prior balances must be marked last known; never silently substitute zero for a failed read. Explicit no-staker errors are handled separately.
- Do not commit credentials, personal records, generated research, or deployment tokens.

## Reporting

A private reporting channel is not configured yet. The repository owner must enable GitHub private vulnerability reporting before public release. Do not publish exploitable security details, keys, or user information in issues.
