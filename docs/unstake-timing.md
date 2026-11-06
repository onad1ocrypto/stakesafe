# Inactive stake countdown

The countdown is a read-only aid in Overview, Profile and an unstake preview that matches the monitored owner and staking position. It never signs, broadcasts, schedules or retries a transaction.

## Release height, not a guaranteed clock time

`getStakerByAddress` reports `inactiveFrom`, which is already the next election block. Do not round it to an additional election block.

For a delegated position, the normal first release block is:

```
inactiveFrom + blocksPerEpoch + 1
```

When a validator has a jail marker, compute:

```
jailedFrom + jailEpochs * blocksPerEpoch + 1
```

The later block applies. An old jail marker whose end is already passed does not add a fresh jail period. No delegated-validator lock applies when the staking record has no delegation.

Network constants are read through the same read-only gateway using zero-argument `getPolicyConstants`. No fixed 24-hour fallback is used when policy, election-height or validator data cannot be verified.

References reviewed:
- https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/account/src/account/staking_contract/staker.rs (`is_inactive_stake_released`, `inactive_from`)
- https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/src/policy.rs (`block_after_collateral_lockup`, `block_after_jail`)

## Display and failure handling

Time remaining is estimated from the last observed head and the network's target block interval (`blockSeparationTime`, milliseconds). The local countdown ticks once per second without sending extra RPC requests. Existing foreground checks normally run once per minute.

Reaching zero on the device clock **cannot** mark funds eligible. The latest successfully read head must reach the release height. Reads older than 90 seconds, failures and clock rollback produce a not-verified status, not a fresh ready state. Policy/validator failures produce an unavailable estimate. Browser local time is used for the displayed estimated date.

Readiness is an RPC observation, not an independently verified consensus proof or authorization guarantee. Separate account, validator and head calls are not an atomic snapshot. Pay/network enforce actual rules at execution; a new deactivation or jail can change timing.

Retired funds do not get a second inactive cooling-off countdown. The user still needs to approve Retire and Withdraw separately. Matching monitor/preview ownership and position checks prevent displaying another account's estimate in a native transaction preview.

## Tests

`npm test` includes deterministic boundary, jail, stale/error, clock-only, retired and input-validation tests plus mocked browser integration. Existing native transaction tests keep all wallet calls stubbed. Neither test suite is a real-mainnet signing test. Actual public mainnet read-only observations do not validate wallet execution.
