import { init, getHostNetwork } from "@nimiq/mini-app-sdk";
import {
  parseLuna,
  publicKeyToAddress,
  planStake,
  integerLuna,
  totalStake,
  matchesStakingPayload,
  matchesFundingOwner,
  isExit,
  validateExitAmount,
  positionKey,
  transactionValue,
  exitStateMatches,
  matchesExitPayload,
} from "./staking-utils.mjs";
const KEY = "stakesafe.native-attempt.v1",
  q = (s) => document.querySelector(s),
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
let preparing = false,
  sending = false,
  flow = null,
  attempt = null,
  revision = 0,
  checking = false,
  candidate = null,
  lockBusy = false,
  settling = false;
const normalize = (a) => window.StakeSafe.normalizeAddress(a);
const same = (a, b) =>
  String(a || "").replace(/\s/g, "") === String(b || "").replace(/\s/g, "");
function mainnet() {
  if (getHostNetwork() !== "mainnet")
    throw new Error(
      "Native staking requires Nimiq Pay to report mainnet. Open this mini app inside Pay on mainnet; unknown networks and testnet cannot sign here.",
    );
}
function unwrap(result) {
  if (result && typeof result === "object" && result.error) {
    const e = new Error(
      result.error.message || "Nimiq Pay could not complete the request.",
    );
    e.type = result.error.type;
    throw e;
  }
  return result;
}
function errorText(e) {
  return e?.type === "PERMISSION_DENIED"
    ? "Request canceled or permission denied. No automatic retry will be made."
    : e?.message ||
        "The request could not be completed. No automatic retry will be made.";
}
function save(a) {
  localStorage.setItem(KEY, JSON.stringify(a));
  attempt = a;
  renderAttempt();
}
function clear() {
  localStorage.removeItem(KEY);
  attempt = null;
  renderAttempt();
}
async function rpc(method, params = []) {
  const c = new AbortController(),
    t = setTimeout(() => c.abort(), 23000);
  try {
    const r = await fetch("/api/rpc", {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: c.signal,
    });
    if (!r.ok)
      throw new Error(
        "Mainnet read unavailable. No transaction has been retried.",
      );
    const j = await r.json();
    if (j.error) {
      if (
        method === "getStakerByAddress" &&
        typeof j.error.data === "string" &&
        j.error.data.startsWith("No staker with address:") &&
        same(j.error.data.slice("No staker with address:".length), params[0])
      )
        return null;
      throw new Error(
        "The mainnet source could not verify the requested record.",
      );
    }
    if (!j.result || !Object.hasOwn(j.result, "data"))
      throw new Error("Incomplete mainnet response.");
    return j.result.data;
  } finally {
    clearTimeout(t);
  }
}
function validateValidator(v, address) {
  if (
    !v ||
    normalize(v.address) !== address ||
    typeof v.retired !== "boolean" ||
    !Object.hasOwn(v, "inactivityFlag") ||
    !Object.hasOwn(v, "jailedFrom")
  )
    throw new Error("The validator’s live state could not be verified.");
  if (v.retired || v.inactivityFlag !== null || v.jailedFrom !== null)
    throw new Error(
      "This source reports a retirement, inactivity, or jail marker. StakeSafe blocks new staking to flagged validators. A jail marker can be historical; review it in Pay rather than assuming a current penalty.",
    );
}
async function readState(sender, validator, exit = false) {
  mainnet();
  const [staker, wallet, v, head] = await Promise.all([
    rpc("getStakerByAddress", [sender]),
    rpc("getAccountByAddress", [sender]),
    exit ? Promise.resolve(null) : rpc("getValidatorByAddress", [validator]),
    rpc("getBlockNumber"),
  ]);
  mainnet();
  if (!Number.isSafeInteger(head) || head < 1)
    throw new Error("Cannot verify the current mainnet block.");
  if (!exit) validateValidator(v, validator);
  if (staker) {
    if (normalize(staker.address) !== sender)
      throw new Error("Staker address mismatch.");
    totalStake(staker);
    if (staker.delegation) normalize(staker.delegation);
  }
  if (!wallet || normalize(wallet.address) !== sender)
    throw new Error("Wallet address mismatch.");
  return { staker, balance: integerLuna(wallet.balance), head };
}
const title = (kind) =>
  ({
    create: "Create staking position",
    add: "Add to existing stake",
    switch: "Change validator",
    deactivate: "Deactivate active stake",
    retire: "Retire inactive stake",
    withdraw: "Withdraw retired stake",
  })[kind];
const method = (kind) =>
  ({
    create: "sendNewStakerTransaction",
    add: "sendStakeTransaction",
    switch: "sendUpdateStakerTransaction",
    deactivate: "sendSetActiveStakeTransaction",
    retire: "sendRetireStakeTransaction",
    withdraw: "sendRemoveStakeTransaction",
  })[kind];
function failure(message) {
  openModal(
    "Native staking",
    `<div class="notice-box" role="alert">${esc(message)}</div><p>Monitoring stays read-only. Nothing will be sent automatically.</p><button class="button white" data-native-close>Close</button>`,
  );
}
// Display-only summary. The update transaction still carries no added stake.
function switchSummary(f) {
  if (f.kind !== "switch") return "";
  const s = f.state.staker;
  const from = window.getStakeSafeValidator?.(s.delegation);
  return `<section class="notice-box" id="native-switch-summary" aria-label="Validator change summary"><div class="detail-row"><span>Current stake held</span><strong id="native-switch-total">${fmt(totalStake(s))} NIM</strong></div><p>Active: ${fmt(s.balance)} NIM · Inactive: ${fmt(s.inactiveBalance)} NIM · Retired: ${fmt(s.retiredBalance)} NIM.</p><p><strong>From validator</strong><br>${esc(from?.name || "Current delegation")}<br><span class="full-validator-address">${esc(s.delegation || "None")}</span></p><p><strong>To validator</strong><br>${esc(f.v.name)}<br><span class="full-validator-address">${esc(f.v.address)}</span></p><p>This changes delegation for the existing staking account, not a second staking position. Additional stake: <strong>0 NIM</strong>. The request reactivates eligible inactive stake; protocol rules still apply. Retired funds are shown separately and are not reactivated or withdrawn. Network fees are separate.</p></section>`;
}
function showForm(f) {
  if (isExit(f.kind)) {
    showExitForm(f);
    return;
  }
  const { kind, sender, v, state } = f;
  openModal(
    title(kind),
    `<div class="notice-box">Mainnet · Staker / owner account reported by Pay<br><strong class="full-validator-address" id="native-sender">${esc(sender)}</strong></div><p>This is not necessarily your watched address. StakeSafe uses Pay’s account-check response to read this account; it is not a login or a backend ownership proof.</p><div class="detail-row"><span>Selected validator</span><strong>${esc(v.name)}</strong></div><p class="full-validator-address">${esc(v.address)}</p><div class="detail-row"><span>Basic address balance (not wallet total)</span><strong>${fmt(state.balance)} NIM</strong></div><div class="notice-box">Pay wallet spendable balance: <strong>not available to StakeSafe</strong>. Pay can hold NIM in HTLC funding contracts while this basic address reads 0. Do not interpret that as an empty Pay wallet. Pay must check available funds and the fee in its native transaction flow.</div>${state.staker ? `<div class="detail-row"><span>Existing delegation</span><strong class="full-validator-address">${esc(state.staker.delegation || "None")}</strong></div><p>Total staked: ${fmt(totalStake(state.staker))} NIM.</p>` : ""}${switchSummary(f)}${kind === "switch" ? '<div class="notice-box">This changes the existing position’s delegation; it does not add funds. All stake eligible for reactivation will be reactivated, including inactive stake. Retired stake is not withdrawn. Protocol timing restrictions can prevent the change. No new validator is selected silently.</div>' : `<label for="native-amount">Amount in NIM</label><input class="native-amount" id="native-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="${kind === "create" ? "Minimum 100 NIM" : "Amount to add"}"><p>${kind === "create" ? "The protocol minimum for a new position is 100 NIM." : "If active and inactive balances are zero, at least 100 NIM must be added."} Leave funds for any network fee. StakeSafe does not set a fee or charge a service fee; Pay must show and validate its final fee.</p>`}<p>Staking carries validator and protocol risks; rewards are variable. Unstaking and validator changes can involve a waiting period. Directory fee and payout terms may be stale; check the validator’s terms.</p>${v.payoutType === "none" ? '<div class="no-rewards">The directory reports no reward payouts.</div>' : ""}<label class="consent-row"><input id="native-review-consent" type="checkbox"> <span>I reviewed the validator and understand this action${kind === "switch" ? " changes my delegation and requests reactivation of eligible stake" : ""}${v.payoutType === "none" ? " with no reported rewards" : ""}. In Pay’s final confirmation I will check the selected wallet, staking action, validator, amount, fee and mainnet. The owner address above is the staking identity, not necessarily the transaction’s funding From address: Pay may spend from its HTLC contract. I will cancel if the selected wallet or staking details are wrong or cannot be verified.</span></label><p id="native-error" class="native-error" role="alert"></p><button class="button primary" id="native-review">Review action</button><button class="button white" data-native-close>Cancel</button>`,
  );
}
function start(v) {
  if (preparing || sending || lockBusy || settling || checking) return;
  if (attempt && v.intent !== "profile") return resolvePreviousForNewReview(v);
  try {
    mainnet();
    candidate = v;
    openModal(
      "Stake inside Nimiq Pay",
      `<p>Step 1: Pay will ask you to sign an account-check message, not a transaction; it has no staking amount and moves no funds. Step 2: StakeSafe reads that reported account’s mainnet balance and staking record and the selected validator’s live status. Step 3: review the stake amount and validator before requesting a separate transaction.</p><p>${v.intent === "profile" ? "Purpose" : "Validator / position"}: <strong>${esc(v.name)}</strong></p><label class="consent-row"><input id="native-data-consent" type="checkbox"><span>I agree to these public-address queries through StakeSafe’s read-only gateway to rpc.nimiqwatch.com. Hosting and RPC operators receive the request. Only if I later request a transaction, its public details are saved on this device to guard against duplicates. My watched address may differ from the signing account.</span></label>${v.intent === "profile" ? '<label class="consent-row"><input type="checkbox" id="native-profile-remember" checked><span>Remember this public staking address and mainnet read consent on this device. Reload resumes read-only profile checks without another account prompt. Avoid on shared devices.</span></label>' : ""}<p>No keys or seed phrases are requested. The account-check signature stays in tab memory only and is not used for backend authentication. No transaction is requested at this step.</p><a class="text-button" href="privacy.html">Privacy & limitations ↗</a><p id="native-error" role="alert"></p><button class="button primary" id="native-identify">Check Pay account</button><button class="button white" data-native-close>Cancel</button>`,
    );
  } catch (e) {
    failure(errorText(e));
  }
}
async function identify(v) {
  if (preparing || sending) return;
  if (attempt && v.intent !== "profile") {
    showAttempt();
    return;
  }
  const profileRemember =
    v.intent === "profile" && !!q("#native-profile-remember")?.checked;
  preparing = true;
  const run = ++revision;
  try {
    mainnet();
    const address = normalize(v.address);
    const p = await init({ timeout: 5000 });
    if (typeof p.sign !== "function")
      throw new Error(
        "This Pay version does not support account checking. Update Pay to use native staking.",
      );
    openModal(
      "Identify your Pay account",
      `<p>The next Pay prompt signs an account-check message, not a transaction. No funds move. Afterward you can review the actual staking action before requesting a transaction.</p><p>${v.intent === "profile" ? "Purpose" : "Validator / position"}: <strong>${esc(v.name)}</strong></p><p id="native-identify-state">Waiting for the account-check response in Pay…</p>`,
    );
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const answer = unwrap(
      await p.sign(
        `StakeSafe account check only\nMainnet\nPurpose: ${v.intent === "profile" ? "Read-only staking profile" : address}\nNonce: ${nonce}\nThis message does not authorize a staking transaction.`,
      ),
    );
    if (run !== revision) return;
    mainnet();
    if (
      !answer ||
      typeof answer.signature !== "string" ||
      !/^[0-9a-f]{128}$/i.test(answer.signature)
    )
      throw new Error("Invalid account-check response from Nimiq Pay.");
    const sender = publicKeyToAddress(answer.publicKey);
    if (v.intent === "profile") {
      closeModal();
      window.StakeSafe.useProfileAddress(sender, { remember: profileRemember });
      return;
    }
    if (v.expectedOwner && normalize(v.expectedOwner) !== sender)
      throw new Error(
        "The selected Pay account differs from this profile. No transaction requested. Use “Use my Pay staking account” to load the correct profile.",
      );
    const state = await readState(sender, address, v.intent === "unstake");
    if (run !== revision) return;
    let kind = planStake(state.staker, address);
    if (v.intent === "add" && kind !== "add")
      throw new Error(
        "The profile delegation changed. Refresh your profile; no validator change will be made automatically.",
      );
    if (v.intent === "unstake") {
      if (!state.staker || totalStake(state.staker) === 0)
        throw new Error("No stake is available to unstake for this account.");
      kind =
        state.staker.balance > 0
          ? "deactivate"
          : state.staker.inactiveBalance > 0
            ? "retire"
            : "withdraw";
    }
    if (typeof p[method(kind)] !== "function")
      throw new Error(
        "This Pay version does not expose the required native staking method. Update Pay or use its own wallet.",
      );
    flow = { p, v: { ...v, address }, sender, state, kind, run };
    showForm(flow);
  } catch (e) {
    if (run === revision) failure(errorText(e));
  } finally {
    preparing = false;
  }
}
function amountFor(f) {
  if (f.kind === "switch") return 0;
  const value = parseLuna(q("#native-amount").value);
  const s = f.state.staker;
  if (isExit(f.kind)) return validateExitAmount(f.kind, value, s);
  if ((!s || s.balance + s.inactiveBalance === 0) && value < 10000000)
    throw new Error("At least 100 NIM is required for this position.");
  return value;
}
function review() {
  const f = flow;
  if (!f || sending || f.run !== revision) return;
  try {
    mainnet();
    if (!q("#native-review-consent").checked)
      throw new Error(
        "Review the action and check the confirmation box first.",
      );
    f.value = amountFor(f);
    openModal(
      "Confirm native staking request",
      `<div class="notice-box">${esc(title(f.kind))} · Mainnet</div><p><strong>Staker / owner account reported by Pay</strong><br><span class="full-validator-address">${esc(f.sender)}</span></p><p><strong>Validator</strong><br>${esc(f.v.name)}<br><span class="full-validator-address">${esc(f.v.address)}</span></p><div class="detail-row"><span>${f.kind === "switch" ? "New funds" : isExit(f.kind) ? "Amount for this step" : "Amount"}</span><strong>${fmt(f.value)} NIM</strong></div>${switchSummary(f)}${f.kind === "switch" ? "<p>Change the existing delegation and request reactivation of all eligible inactive stake. No withdrawal.</p>" : ""}${isExit(f.kind) ? `<div class="notice-box">${exitExplanation(f.kind)} This is only one step, not an automatic unstaking sequence. Pay and the network must accept timing and balance rules.</div>` : ""}<p>Network fee: <strong>review the actual fee in Pay</strong>. No StakeSafe service fee. This screen is not a fee quote or a guarantee that Pay will accept the transaction.</p><div class="notice-box">Pay controls the selected wallet and funding source; this SDK cannot lock either. The staking owner above is not necessarily the funding <strong>From</strong> address: Pay normally uses an HTLC. Verify the selected Pay wallet, staking identity if shown, mainnet, validator, action, amount and fee; cancel if details are wrong or cannot be verified. Pay must validate available funds, which StakeSafe cannot read as a wallet total. A returned transaction hash is not confirmation.</div><p id="native-error" class="native-error" role="alert"></p><button class="button primary" id="native-send">Continue to Nimiq Pay</button><button class="button white" id="native-back">Back</button>`,
    );
  } catch (e) {
    q("#native-error").textContent = errorText(e);
  }
}
async function send() {
  if (lockBusy || sending) return;
  if (!navigator.locks?.request) {
    failure(
      "This WebView does not support the transaction lock needed to prevent parallel requests. Update Nimiq Pay to continue.",
    );
    return;
  }
  lockBusy = true;
  try {
    await navigator.locks.request(
      "stakesafe-native-staking",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          failure(
            "Another StakeSafe tab is handling a native request. Review it in Pay first.",
          );
          return;
        }
        if (localStorage.getItem(KEY) && !attempt) {
          restoreAttempt();
          showAttempt();
          return;
        }
        await performSend();
      },
    );
  } catch (e) {
    failure(errorText(e));
  } finally {
    ((lockBusy = false), (settling = false));
  }
}
async function performSend() {
  const f = flow;
  if (!f || sending || attempt || f.run !== revision) return;
  sending = true;
  const button = q("#native-send");
  if (button) {
    button.disabled = true;
    button.textContent = "Checking current state…";
  }
  let called = false;
  try {
    mainnet();
    const fresh = await readState(f.sender, f.v.address, isExit(f.kind));
    if (
      (!isExit(f.kind) && planStake(fresh.staker, f.v.address) !== f.kind) ||
      (isExit(f.kind) &&
        positionKey(fresh.staker) !== positionKey(f.state.staker)) ||
      !same(fresh.staker?.delegation, f.state.staker?.delegation) ||
      totalStake(fresh.staker) !== totalStake(f.state.staker)
    )
      throw new Error(
        "The staking position changed since preview. Close and start again to review current data.",
      );
    if (
      !isExit(f.kind) &&
      f.kind !== "switch" &&
      (!fresh.staker ||
        fresh.staker.balance + fresh.staker.inactiveBalance === 0) &&
      f.value < 10000000
    )
      throw new Error("Minimum-stake checks changed. Close and review again.");
    if (isExit(f.kind)) validateExitAmount(f.kind, f.value, fresh.staker);
    if (f.run !== revision)
      throw new Error("Preview closed. No transaction requested.");
    mainnet();
    save({
      version: 1,
      network: "mainnet",
      sender: f.sender,
      validator: isExit(f.kind) ? fresh.staker.delegation || null : f.v.address,
      name: f.v.name,
      kind: f.kind,
      value: f.value,
      previousTotal: totalStake(fresh.staker),
      before: isExit(f.kind) ? fresh.staker : undefined,
      newActiveBalance:
        f.kind === "deactivate" ? fresh.staker.balance - f.value : undefined,
      time: Date.now(),
      status: "awaiting",
      hash: null,
    });
    called = true;
    if (button) button.textContent = "Confirm or cancel in Pay…";
    const params =
      f.kind === "deactivate"
        ? { newActiveBalance: fresh.staker.balance - f.value }
        : f.kind === "retire"
          ? { retireStake: f.value }
          : f.kind === "withdraw"
            ? { value: f.value }
            : f.kind === "create"
              ? { delegation: f.v.address, value: f.value }
              : f.kind === "add"
                ? { value: f.value }
                : { newDelegation: f.v.address, reactivateAllStake: true };
    const result = unwrap(await f.p[method(f.kind)](params));
    if (typeof result !== "string" || !/^[a-f0-9]{64}$/i.test(result))
      throw new Error(
        "Pay did not return a valid transaction hash. Its outcome is unknown; inspect Pay before doing anything else.",
      );
    const submitted = {
      ...attempt,
      hash: result.toLowerCase(),
      status: "submitted",
    };
    try {
      save(submitted);
    } catch {
      attempt = submitted;
      renderAttempt();
      throw new Error(
        "Pay returned the hash below, but device storage could not save it. Copy it and inspect Pay. Do not repeat the request.",
      );
    }
    window.dispatchEvent(
      new CustomEvent("stakesafe:native-observed", {
        detail: { address: f.sender },
      }),
    );
    showAttempt();
  } catch (e) {
    if (called) {
      try {
        if (e?.type === "PERMISSION_DENIED") {
          save({ ...attempt, status: "canceled" });
        } else if (attempt) {
          save({ ...attempt, status: "unknown" });
        }
      } catch {}
      showAttempt(errorText(e));
    } else if (q("#native-error"))
      q("#native-error").textContent = errorText(e);
    else failure(errorText(e));
  } finally {
    sending = false;
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = "Continue to Nimiq Pay";
    }
  }
}
function renderAttempt() {
  let el = q("#native-attempt-notice");
  if (!attempt) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = "native-attempt-notice";
    el.className = "notice-box native-attempt-notice";
    q("main").prepend(el);
  }
  el.innerHTML = `<strong>Native staking: ${esc(attempt.status)}</strong><span>${attempt.hash ? "A hash alone is not confirmation." : "Review the outcome in Pay before another staking request."}</span><button class="button white" data-native-attempt>Review transaction</button>`;
}
function showAttempt(message = "") {
  if (!attempt) return;
  const a = attempt;
  openModal(
    "Native transaction status",
    `<div class="notice-box" id="native-attempt-status" role="status">${esc(message || { awaiting: "Waiting for Pay, or outcome unknown after reload. Do not repeat the transaction.", submitted: "Submitted hash received — not confirmed. Use the read-only check below.", unknown: "Outcome unknown. The request may have reached Pay. Inspect Pay transaction history; do not repeat blindly.", canceled: "Pay reported cancellation or permission denied. No automatic retry.", confirmed: "Mainnet source reported mined execution and the expected staking record. This is an RPC observation, not an independent finality guarantee.", failed: "Mainnet source reported failed execution. Review Pay before another action." }[a.status] || "Review the outcome in Pay.")}</div><p>${esc(title(a.kind))} · ${esc(a.name)} · ${fmt(a.value)} NIM<br><span class="full-validator-address">${esc(a.sender)}</span><br>${esc(new Date(a.time).toLocaleString("en"))}</p>${a.hash ? `<p>Transaction hash<br><span class="full-validator-address">${esc(a.hash)}</span></p><button class="button primary" id="native-check" ${checking ? "disabled" : ""}>Check mainnet status (read-only)</button>` : "<p>No usable hash was returned. StakeSafe cannot infer whether a transaction was submitted. Check Pay’s transaction history.</p>"}<hr><label class="consent-row"><input id="native-clear-consent" type="checkbox"><span>I reviewed this transaction in Pay, resolved any pending/unknown outcome, and understand clearing this local record does not cancel a transaction. I will not duplicate a pending request.</span></label><p id="native-clear-error" role="alert"></p><button class="button white" id="native-clear" ${sending ? "disabled" : ""}>Clear reviewed record</button><p>The public transaction details above are saved on this device to prevent accidental duplicate requests. Clearing browser storage also removes this protection.</p>`,
  );
}
async function readMatchedMinedReceipt(a) {
  const t = await rpc("getTransactionByHash", [a.hash]);
  if (
    !t ||
    t.hash !== a.hash ||
    t.networkId !== 24 ||
    (a.kind !== "withdraw" && !matchesFundingOwner(t, a)) ||
    t.value !== transactionValue(a) ||
    !(isExit(a.kind) ? matchesExitPayload(t, a) : matchesStakingPayload(t, a))
  )
    throw new Error(
      "The transaction could not be matched to the expected mainnet funding owner, staking identity, action, validator and value. Do not repeat it; inspect Pay.",
    );
  if (
    !Number.isSafeInteger(t.blockNumber) ||
    t.blockNumber < 1 ||
    !Number.isSafeInteger(t.confirmations) ||
    t.confirmations < 1
  )
    throw new Error(
      "The transaction is not yet reported as mined. Do not repeat it.",
    );
  if (typeof t.executionResult !== "boolean")
    throw new Error(
      "Execution status is unavailable. Do not repeat the request.",
    );
  return t;
}
async function checkAttempt() {
  if (!attempt?.hash || checking) return;
  checking = true;
  const a = attempt,
    b = q("#native-check");
  if (b) b.disabled = true;
  try {
    const t = await readMatchedMinedReceipt(a);
    if (attempt !== a) return;
    if (t.executionResult === false) {
      save({ ...a, status: "failed" });
      showAttempt();
      return;
    }
    const staker = await rpc("getStakerByAddress", [a.sender]);
    if (attempt !== a) return;
    if (
      (staker && normalize(staker.address) !== a.sender) ||
      (isExit(a.kind)
        ? !exitStateMatches(a, staker)
        : !staker ||
          !same(staker.delegation, a.validator) ||
          totalStake(staker) < a.previousTotal + a.value)
    )
      throw new Error(
        "Mined execution reported, but the expected staking record is not yet verified. Check again later; do not resubmit.",
      );
    save({ ...a, status: "confirmed" });
    window.dispatchEvent(
      new CustomEvent("stakesafe:native-observed", {
        detail: { address: a.sender },
      }),
    );
    showAttempt();
  } catch (e) {
    if (attempt === a)
      showAttempt(errorText(e) + " The transaction has not been retried.");
  } finally {
    checking = false;
    const c = q("#native-check");
    if (c) c.disabled = false;
  }
}
window.StakeSafeNative = { start };
document.addEventListener("click", (e) => {
  const el = e.target.closest("button");
  if (!el) return;
  if (el.id === "native-identify") {
    if (!q("#native-data-consent").checked) {
      q("#native-error").textContent =
        "Please approve the public-address data queries first.";
      return;
    }
    if (candidate) identify(candidate);
  } else if (el.matches("[data-native-close]")) {
    revision++;
    flow = null;
    closeModal();
  } else if (el.id === "native-review") review();
  else if (el.id === "native-back" && flow && !sending) showForm(flow);
  else if (el.id === "native-send") send();
  else if (el.matches("[data-native-attempt]")) showAttempt();
  else if (el.id === "native-check") checkAttempt();
  else if (el.id === "native-clear") {
    if (sending) return;
    if (!q("#native-clear-consent").checked) {
      q("#native-clear-error").textContent =
        "Review the outcome in Pay and acknowledge the checkbox first.";
      return;
    }
    try {
      clear();
      flow = null;
      revision++;
      closeModal();
    } catch {
      q("#native-clear-error").textContent = "Could not clear device storage.";
    }
  }
});
// Closing any app modal invalidates its unsigned preview, even while read checks finish.
new MutationObserver(() => {
  if (q("#modal-backdrop").classList.contains("hidden")) {
    revision++;
    flow = null;
  }
}).observe(q("#modal-backdrop"), {
  attributes: true,
  attributeFilter: ["class"],
});
function restoreAttempt() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const a = JSON.parse(raw);
      if (
        a.version !== 1 ||
        a.network !== "mainnet" ||
        ![
          "create",
          "add",
          "switch",
          "deactivate",
          "retire",
          "withdraw",
        ].includes(a.kind) ||
        !Number.isSafeInteger(a.time) ||
        !Number.isSafeInteger(a.value) ||
        a.value < 0 ||
        !Number.isSafeInteger(a.previousTotal) ||
        a.previousTotal < 0 ||
        !(a.hash === null || /^[a-f0-9]{64}$/.test(a.hash))
      )
        throw new Error("Invalid attempt");
      if (isExit(a.kind)) {
        if (!a.before) throw new Error("Incomplete exit preview");
        totalStake(a.before);
        if (a.kind === "deactivate") integerLuna(a.newActiveBalance);
      }
      a.sender = normalize(a.sender);
      a.validator = a.validator ? normalize(a.validator) : null;
      if (!isExit(a.kind) && !a.validator) throw new Error("Missing validator");
      attempt = a;
      renderAttempt();
    }
  } catch {
    attempt = {
      status: "unknown",
      name: "Unresolved saved request",
      kind: "create",
      sender: "Unknown",
      value: 0,
      time: Date.now(),
      hash: null,
    };
    renderAttempt();
  }
}
queueMicrotask(restoreAttempt);
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    attempt = null;
    restoreAttempt();
    renderAttempt();
  }
});

function exitExplanation(kind) {
  return {
    deactivate:
      "Moves the chosen amount from active to inactive stake. Funds remain in staking and stop being active; they are not paid out.",
    retire:
      "Requests retirement of inactive stake after the protocol waiting period. This is not a withdrawal. Pay/network must validate eligibility; no unlock date is promised.",
    withdraw:
      "Requests removal of eligible retired stake to your own Pay owner account. Pay may subsequently move it into its funding HTLC. Only the network can confirm execution.",
  }[kind];
}
function showExitForm(f) {
  const b = f.state.staker;
  openModal(
    title(f.kind),
    `<div class="notice-box">Mainnet · Staking owner<br><strong class="full-validator-address">${esc(f.sender)}</strong></div><p>Validator: ${esc(f.v.name)}</p><p>Active: ${fmt(b.balance)} NIM · Inactive: ${fmt(b.inactiveBalance)} NIM · Retired: ${fmt(b.retiredBalance)} NIM</p><div id="native-unstake-timer" aria-live="off" data-unstake-timer data-owner="${esc(f.sender)}" data-position="${esc(positionKey(b))}"></div><label for="native-stage">Unstaking step</label><select id="native-stage">${[
      ["deactivate", "1. Deactivate active stake", b.balance],
      ["retire", "2. Retire inactive stake", b.inactiveBalance],
      ["withdraw", "3. Withdraw retired stake", b.retiredBalance],
    ]
      .map(
        ([kind, label, n]) =>
          `<option value="${kind}" ${kind === f.kind ? "selected" : ""} ${!n ? "disabled" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select><div class="notice-box">${exitExplanation(f.kind)}</div><p>Inactive-from block: ${esc(b.inactiveFrom ?? "Not reported")}. This is a recorded block, not a guarantee that retirement or withdrawal is currently allowed. Check Pay’s final confirmation. A waiting period or validator restrictions can cause rejection.</p><label for="native-amount">Amount for this step (NIM)</label><input class="native-amount" id="native-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="Amount in NIM"><p>For partial retirement/withdrawal, the protocol requires applicable remaining stake to be 0 or at least 100 NIM. Review the network fee in Pay. No StakeSafe service fee.</p><label class="consent-row"><input id="native-review-consent" type="checkbox"><span>I understand this is only the selected step. It will not automatically retire or withdraw funds later. I will verify the selected Pay wallet, staking account, action, amount, destination, fee and mainnet before approving; I will cancel if anything is wrong or unclear.</span></label><p id="native-error" role="alert"></p><button class="button primary" id="native-review">Review action</button><button class="button white" data-native-close>Cancel</button>`,
  );
  window.renderStakeSafeUnstakeTimers?.();
}
document.addEventListener("change", (e) => {
  if (e.target.id === "native-stage" && flow && !sending && !lockBusy) {
    const kind = e.target.value;
    if (!isExit(kind)) return;
    if (typeof flow.p[method(kind)] !== "function") {
      q("#native-error").textContent =
        "This Pay version does not support that step.";
      return;
    }
    flow.kind = kind;
    showForm(flow);
  }
});

// A completed receipt is history, not a permanently pending write. Starting a new
// user-requested review may release only that exact resolved guard, under the same
// origin-wide lock as transaction submission. It never replays the old transaction.
async function resolvePreviousForNewReview(v) {
  const a = attempt;
  if (!a) return start(v);
  settling = true;
  const run = ++revision;
  openModal(
    "Checking the previous transaction",
    '<p id="native-previous-check" role="status">Reading the previous receipt on mainnet before opening a new action. No transaction or account-signing request is being sent.</p><button class="button white" data-native-close>Cancel</button>',
  );
  let released = false;
  try {
    mainnet();
    if (a.hash) await readMatchedMinedReceipt(a);
    else if (a.status !== "canceled")
      throw new Error(
        "The previous request has no usable hash and its outcome is unresolved. Inspect Pay history first; only clear its local record after resolving it.",
      );
    if (run !== revision) return;
    if (!navigator.locks?.request)
      throw new Error(
        "Update Pay to use the cross-tab transaction lock. The previous record has not been cleared.",
      );
    await navigator.locks.request(
      "stakesafe-native-staking",
      { ifAvailable: true },
      async (lock) => {
        if (!lock)
          throw new Error(
            "Another tab is processing a native request. Review it in Pay first.",
          );
        if (run !== revision) return;
        const raw = localStorage.getItem(KEY),
          stored = raw ? JSON.parse(raw) : null;
        const identical = (x) =>
          x &&
          x.time === a.time &&
          x.sender === a.sender &&
          x.hash === a.hash &&
          x.kind === a.kind &&
          x.value === a.value;
        if (!stored && !attempt) {
          released = true;
          return;
        }
        if (!identical(attempt) || !identical(stored))
          throw new Error(
            "The saved transaction changed in another tab. No record was cleared. Review the current transaction first.",
          );
        clear();
        released = true;
      },
    );
  } catch (e) {
    if (run === revision)
      showAttempt(
        "A new action is paused: " +
          errorText(e) +
          " Nothing has been resubmitted.",
      );
  } finally {
    settling = false;
  }
  if (released && run === revision) {
    toast(
      "Previous request resolved. Review a new action; nothing is sent automatically.",
    );
    start(v);
  }
}
