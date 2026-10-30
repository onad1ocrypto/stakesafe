const q = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const fmt = (n) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 5 }).format(n / 100000);
let current = null;
function render() {
  const el = q("#profile-content"),
    m = window.StakeSafe?.getPosition?.();
  if (!el || !m) return;
  current = m;
  const { address, snapshot, lastSuccess, errorText, busy } = m;
  q("#profile-refresh").disabled = !address || busy;
  if (!address) {
    el.innerHTML =
      '<div class="notice-box">No staking account selected. Use your Pay staking account below, or connect/watch an address from Overview. This is not a wallet login.</div>';
    return;
  }
  const stale =
    !!errorText || !lastSuccess || Date.now() - lastSuccess.getTime() > 90000;
  const record = snapshot?.staker,
    d = record?.delegation,
    v = window.getStakeSafeValidator?.(d),
    total = record
      ? record.balance + record.inactiveBalance + record.retiredBalance
      : 0;
  el.innerHTML = `<p class="profile-address">${esc(address)}</p><div class="notice-box">${esc(errorText || (!snapshot ? "Reading staking record…" : stale ? "Last known data — refresh before taking an action." : `Mainnet RPC observation · ${lastSuccess.toLocaleTimeString("en")}`))}</div>${snapshot ? `<div class="profile-total"><span>Total staked / held in staking</span><strong id="profile-total">${fmt(total)} <small>NIM</small></strong></div><div class="profile-balances"><div><span>Active</span><strong id="profile-active">${fmt(record?.balance || 0)} NIM</strong></div><div><span>Inactive</span><strong>${fmt(record?.inactiveBalance || 0)} NIM</strong></div><div><span>Retired</span><strong>${fmt(record?.retiredBalance || 0)} NIM</strong></div></div><p>Retired funds are included in the total above, but are not active staking. This is not Pay’s spendable wallet balance.</p><div class="profile-validator"><span>Your delegated validator</span><h3 id="profile-validator-name">${esc(d ? v?.name || "Name unavailable — use the address below" : "No delegation")}</h3>${d ? `<p class="profile-address">${esc(d)}</p><small>Directory name is metadata, not proof of current validator performance.</small>` : ""}</div>${!record ? "<p>No staking record was reported for this address. If you just staked with a different account, use “Use my Pay staking account”, then refresh.</p>" : ""}<div class="profile-actions"><button class="button primary" id="profile-add" ${!d || busy || stale ? "disabled" : ""}>Add stake</button><button class="button white" id="profile-change" data-page="validators" ${!d || busy || stale ? "disabled" : ""}>Change validator</button><button class="button white" id="profile-unstake" ${!record || !total || busy || stale ? "disabled" : ""}>Unstake / withdraw</button><button class="text-button" data-page="validators">Explore validators →</button></div>${d ? "<p>Add stake adds funds to this validator. Change validator opens the directory to choose a new delegation for the same staking account; it does not create a second position. Pay first asks for an account-check signature, not a transaction. Afterward, review your stake and validator change before requesting a transaction.</p>" : ""}` : ""}`;
}
window.renderStakeSafeProfile = render;
window.addEventListener("stakesafe:monitor", render);
window.addEventListener("stakesafe:directory", render);
q("#profile-refresh").onclick = () => window.StakeSafe.refresh();
q("#profile-use-pay").onclick = () =>
  window.StakeSafeNative.start({
    address: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
    name: "Read-only profile account check",
    intent: "profile",
  });
document.addEventListener("click", (e) => {
  const b = e.target.closest("#profile-add,#profile-unstake");
  if (!b || b.disabled || !current?.snapshot?.staker) return;
  const s = current.snapshot.staker,
    v = window.getStakeSafeValidator?.(s.delegation);
  window.StakeSafeNative.start({
    address: s.delegation || "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
    name: v?.name || s.delegation || "Your staking position",
    payoutType: v?.payoutType,
    expectedOwner: current.address,
    intent: b.id === "profile-add" ? "add" : "unstake",
  });
});
queueMicrotask(render);
