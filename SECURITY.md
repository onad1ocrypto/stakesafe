# Security policy

StakeSafe is a mainnet mini app with read-only monitoring and opt-in native Pay staking with foreground monitoring and a public validator directory. Native-device testing is still required before claiming release readiness. It must not be represented as a background monitoring or notification service.

- Never enter a seed phrase or private key in StakeSafe.
- StakeSafe may request native staking transactions only after explicit review. Pay retains keys and final confirmation; StakeSafe never receives staking funds, signs locally, or submits transactions through its server.
- The optional web-wallet fallback must remain fixed to the verified official Nimiq Wallet origin. Native signing requires known host mainnet, fresh state checks, local attempt persistence and a cross-tab Web Lock.
- Validator-provided metadata is untrusted. Render text escaped; do not inject descriptions or logos as HTML.
- All live-source failures must be visible. Retained prior balances must be marked last known; never silently substitute zero for a failed read. Explicit no-staker errors are handled separately.
- Do not commit credentials, personal records, generated research, or deployment tokens.

## Reporting

A private reporting channel is not configured yet. The repository owner must enable GitHub private vulnerability reporting before public release. Do not publish exploitable security details, keys, or user information in issues.

## Read-only gateway

`api/rpc.js` accepts only getBlockNumber, getStakerByAddress, getValidatorByAddress, getAccountByAddress, and getTransactionByHash (64-hex hash only). Upstream is fixed, parameters and body size are checked, responses are not cached, and the handler adds no request-body logs or database writes. Transaction methods and arbitrary upstream URLs are never forwarded. The gateway remains a public service and should be monitored for abuse; no zero-risk or availability guarantee is made.

## Native account and transaction boundaries

The native SDK has no sender-binding parameter. A host account-check response determines which address to preview; it is not an authentication session, and its message signature is not used as a server-side ownership proof. The preview identifies the staker/owner, not necessarily the transaction’s funding From address; Pay normally spends from an HTLC. Users must verify the selected Pay wallet and final staking details, canceling if wrong or not verifiable. Never gate Pay affordability on the basic account balance or pretend it is the wallet spendable total. Never infer the signer from a shared/remembered watch address. If a host cannot show the final transaction details, do not approve.

A returned hash means submission only. Read-only checks validate transaction fields/payload, mined execution and expected staker state; these remain trusted RPC observations rather than consensus proofs. Never retry native writes automatically. Unknown outcomes and cancellation persist for review, including across reloads. The attempt guard contains public financial details locally; disconnecting monitoring does not remove it or cancel a transaction. Local storage deletion removes the duplicate guard, not the transaction. This is not a guarantee against duplicates across different devices or cleared storage.

HTLC-funded status matching checks the canonical local-owner proof at the end of an early-resolve proof; create/change actions also match the inner staking-owner proof, while additions encode the intended staker. Source `executionResult` validates signatures/contract execution; these are identity/format checks, not independent signature or consensus verification. Unsupported proof formats must remain unverified, not trigger resubmission.

## Profile action safeguards

Profile views are read-only and may monitor any public address; they are not wallet ownership claims. Every native shortcut identifies the current Pay owner and rejects mismatches with the displayed profile. Add stake rejects a changed delegation, never silently converts into a validator switch. Stale/error snapshots disable shortcuts.

Deactivate, retire and withdraw are separate, user-confirmed actions, never an automatic sequence. Validate exact integer amounts, stage balances, applicable remainder minimums and a fresh full position fingerprint. Do not block exits solely because a validator is flagged; leave eligibility, waiting periods and final affordability/fees to native Pay/network validation. Hashes alone never confirm an exit. Match outgoing staking withdrawals to the owner destination and canonical proof, and require a corresponding balance transition (or explicit no-staker after full withdrawal). New exit attempts store the public baseline position and intended active balance in local duplicate-guard records.

## Resolved-attempt handoff

A new explicit action can release the exact prior guard after a fresh read matches its hash, mainnet, owner, action/payload/value, mined block and known execution boolean. Explicit native permission cancellation can also release a hashless canceled record; unknown/awaiting hashless outcomes cannot. Do not equate the old receipt with the current position. Re-read account identity and state for the new preview. Guard removal uses the same cross-tab lock as native submission plus record identity comparison, so resolving old history cannot clear a newer in-flight request. Read errors, non-mined/mismatched receipts and unsupported proof formats keep the guard. No old transaction is replayed or new signature/send requested without fresh consent/review.
