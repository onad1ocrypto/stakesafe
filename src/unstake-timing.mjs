// Read-only timing, never an authorization to sign or broadcast.
// Protocol reference: core-rs-albatross/albatross, primitives/src/policy.rs
// block_after_collateral_lockup(n) = n + blocks_per_epoch + 1;
// block_after_jail(n) = n + blocks_per_epoch * jail_epochs + 1.
// inactiveFrom already denotes an election block; DO NOT round it to another epoch.
const integer = (n) => Number.isSafeInteger(n) && n >= 0;
const positive = (n) => integer(n) && n > 0;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (n) => n.toLocaleString('en');
export function unstakeTiming({snapshot, lastSuccess, errorText, busy = false}, now = Date.now()) {
  const s = snapshot?.staker;
  if (!s || (!positive(s.inactiveBalance) && !positive(s.retiredBalance))) return {state:'none'};
  const observedAt = lastSuccess instanceof Date ? lastSuccess.getTime() : lastSuccess;
  if (errorText || !Number.isFinite(observedAt) || now < observedAt || now - observedAt > 90000) return {state:'stale',title:'Timing not currently verified',detail:'The last check failed or is over 90 seconds old. Refresh the staking record; elapsed time alone does not prove eligibility.'};
  if (busy) return {state:'checking', title:'Checking unstaking timing…',detail:'Reading current mainnet data. No transaction is being sent.'};
  if (!positive(s.inactiveBalance)) return {state:'retired', title:'Retired stake: review withdrawal', detail:'No new inactive cooling-off timer applies to retired funds. Review Withdraw in Nimiq Pay; fees and network checks still apply.'};
  const head = snapshot.head;
  if (!positive(head)) return {state:'unknown',title:'Release timing unavailable',detail:'The source did not report a valid mainnet block. No zero or ready status has been substituted.'};
  if (!s.delegation) return {state:'eligible',title:'No delegated-validator lock reported',detail:'The latest record has no delegation. Review Retire in Nimiq Pay, then Withdraw. This is an RPC observation, not a transaction guarantee.',head};
  const p = snapshot.policy;
  if (!p || !positive(p.blocksPerEpoch) || !positive(p.jailEpochs) || !positive(p.blockSeparationTime) || !integer(p.genesisBlockNumber) || !integer(s.inactiveFrom) || s.inactiveFrom < p.genesisBlockNumber || (s.inactiveFrom-p.genesisBlockNumber)%p.blocksPerEpoch !== 0) return {state:'unknown',title:'Release timing unavailable',detail:'A valid inactive-from election block and network policy are required. Refresh or inspect the official wallet; no fixed 24-hour fallback is used.'};
  const v = snapshot.validator;
  if (snapshot.validatorError || !v || String(v.address).replace(/\s/g,'') !== String(s.delegation).replace(/\s/g,'') || !Object.hasOwn(v,'jailedFrom') || (v.jailedFrom !== null && !integer(v.jailedFrom))) return {state:'unknown',title:'Validator timing not verified',detail:'Validator jail information is unavailable or invalid. A normal cooling-off estimate alone cannot establish eligibility.'};
  const normalRelease = s.inactiveFrom + p.blocksPerEpoch + 1;
  const jailRelease = v.jailedFrom === null ? 0 : v.jailedFrom + p.blocksPerEpoch*p.jailEpochs + 1;
  const targetBlock = Math.max(normalRelease,jailRelease);
  if (!Number.isSafeInteger(targetBlock) || targetBlock > 0xffffffff) return {state:'unknown',title:'Release timing unavailable',detail:'The release block could not be validated.'};
  // Conservative head: never infer readiness from a newer, unrelated account read.
  const blocks = Math.max(0,targetBlock-head);
  const remainingMs = Math.max(0,blocks*p.blockSeparationTime-(now-observedAt));
  const result = {targetBlock,head,remainingBlocks:blocks,remainingMs,estimateAt:observedAt+blocks*p.blockSeparationTime,jailed:jailRelease>head && jailRelease>normalRelease};
  if (!blocks) return {...result,state:'eligible',title:'Release block reached — review Retire',detail:'The latest RPC head has reached the calculated release block. Retire and then Withdraw still need separate approvals in Nimiq Pay. A new jail or stake change can affect eligibility.'};
  if (!remainingMs) return {...result,state:'awaiting-block',title:'Estimate reached — checking the chain is still required',detail:'The last observed block is below the release block. Refresh; the clock cannot mark funds ready on its own.'};
  return {...result,state:'waiting',title:result.jailed?'Validator jail extends the waiting period':'Inactive stake cooling-off',detail:'Estimated time at the network’s target block interval, not a guaranteed unlock time. Retire, then Withdraw: each step requires your approval.'};
}
export function formatRemaining(ms) {
  let t = Math.max(0, Math.ceil(ms/1000));
  const days = Math.floor(t/86400);t%=86400;
  const h = Math.floor(t/3600),m = Math.floor(t%3600/60),s = t%60;
  return `${days ? days+'d ' : ''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
export function timingHtml(t) {
  if (!t || t.state === 'none') return '';
  return `<section class="unstake-timing ${t.state === 'eligible' ? 'timing-ready' : ''}" data-timing-state="${esc(t.state)}"><div class="timing-title">${esc(t.title)}</div>${t.state === 'waiting' ? `<strong class="timing-countdown">~ ${formatRemaining(t.remainingMs)}</strong><div class="timing-date">Estimated ${esc(new Date(t.estimateAt).toLocaleString('en',{dateStyle:'medium',timeStyle:'short'}))} · your local time</div>` : ''}${t.targetBlock !== undefined ? `<dl class="timing-blocks"><div><dt>Release block</dt><dd>${number(t.targetBlock)}</dd></div><div><dt>Last observed head</dt><dd>${number(t.head)}</dd></div><div><dt>Blocks remaining at check</dt><dd>${number(t.remainingBlocks)}</dd></div></dl>` : ''}<p>${esc(t.detail)}</p><small>Read-only estimate · refreshes while this page is open · nothing retires or withdraws automatically.</small></section>`;
}
