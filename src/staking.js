import { init, getHostNetwork } from "@nimiq/mini-app-sdk";
import {
  parseLuna,
  publicKeyToAddress,
  planStake,
  integerLuna,
  totalStake,
  matchesStakingPayload,
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
  lockBusy = false;
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
async function readState(sender, validator) {
  mainnet();
  const [staker, wallet, v, head] = await Promise.all([
    rpc("getStakerByAddress", [sender]),
    rpc("getAccountByAddress", [sender]),
    rpc("getValidatorByAddress", [validator]),
    rpc("getBlockNumber"),
  ]);
  mainnet();
  if (!Number.isSafeInteger(head) || head < 1)
    throw new Error("Cannot verify the current mainnet block.");
  validateValidator(v, validator);
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
  })[kind];
const method = (kind) =>
  ({
    create: "sendNewStakerTransaction",
    add: "sendStakeTransaction",
    switch: "sendUpdateStakerTransaction",
  })[kind];
function failure(message) {
  openModal(
    "Native staking",
    `<div class="notice-box" role="alert">${esc(message)}</div><p>Monitoring stays read-only. Nothing will be sent automatically.</p><button class="button white" data-native-close>Close</button>`,
  );
}
function showForm(f) {
  const { kind, sender, v, state } = f;
  openModal(
    title(kind),
    `<div class="notice-box">Mainnet · Account reported by Nimiq Pay<br><strong class="full-validator-address" id="native-sender">${esc(sender)}</strong></div><p>This is not necessarily your watched address. StakeSafe uses Pay’s account-check response to read this account; it is not a login or a backend ownership proof.</p><div class="detail-row"><span>Selected validator</span><strong>${esc(v.name)}</strong></div><p class="full-validator-address">${esc(v.address)}</p><div class="detail-row"><span>Spendable balance</span><strong>${fmt(state.balance)} NIM</strong></div>${state.staker ? `<div class="detail-row"><span>Existing delegation</span><strong class="full-validator-address">${esc(state.staker.delegation || "None")}</strong></div><p>Total staked: ${fmt(totalStake(state.staker))} NIM.</p>` : ""}${kind === "switch" ? '<div class="notice-box">This changes the existing position’s delegation; it does not add funds. All stake eligible for reactivation will be reactivated, including inactive stake. Retired stake is not withdrawn. Protocol timing restrictions can prevent the change. No new validator is selected silently.</div>' : `<label for="native-amount">Amount in NIM</label><input class="native-amount" id="native-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="${kind === "create" ? "Minimum 100 NIM" : "Amount to add"}"><p>${kind === "create" ? "The protocol minimum for a new position is 100 NIM." : "If active and inactive balances are zero, at least 100 NIM must be added."} Leave funds for any network fee. StakeSafe does not set a fee or charge a service fee; Pay must show and validate its final fee.</p>`}<p>Staking carries validator and protocol risks; rewards are variable. Unstaking and validator changes can involve a waiting period. Directory fee and payout terms may be stale; check the validator’s terms.</p>${v.payoutType === "none" ? '<div class="no-rewards">The directory reports no reward payouts.</div>' : ""}<label class="consent-row"><input id="native-review-consent" type="checkbox"> <span>I reviewed the validator and understand this action${kind === "switch" ? " changes my delegation and requests reactivation of eligible stake" : ""}${v.payoutType === "none" ? " with no reported rewards" : ""}. In Pay’s final confirmation I will check the From account, validator, amount, fee and mainnet. StakeSafe’s SDK cannot lock the sender; I will cancel if the From account differs from the address above.</span></label><p id="native-error" class="native-error" role="alert"></p><button class="button primary" id="native-review">Review action</button><button class="button white" data-native-close>Cancel</button>`,
  );
}
function start(v) {
  if (preparing || sending || lockBusy) return;
  if (attempt) {
    showAttempt();
    return;
  }
  try {
    mainnet();
    candidate = v;
    openModal(
      "Stake inside Nimiq Pay",
      `<p>First Pay will ask you to sign an account-check message (not a transaction). Then StakeSafe reads that reported account’s mainnet balance and staking record and the selected validator’s live status.</p><p>Validator: <strong>${esc(v.name)}</strong></p><label class="consent-row"><input id="native-data-consent" type="checkbox"><span>I agree to these public-address queries through StakeSafe’s read-only gateway to rpc.nimiqwatch.com. Hosting and RPC operators receive the request. Only if I later request a transaction, its public details are saved on this device to guard against duplicates. My watched address may differ from the signing account.</span></label><p>No keys or seed phrases are requested. The account-check signature stays in tab memory only and is not used for backend authentication. No transaction is requested at this step.</p><a class="text-button" href="privacy.html">Privacy & limitations ↗</a><p id="native-error" role="alert"></p><button class="button primary" id="native-identify">Check Pay account</button><button class="button white" data-native-close>Cancel</button>`,
    );
  } catch (e) {
    failure(errorText(e));
  }
}
async function identify(v) {
  if (preparing || sending) return;
  if (attempt) {
    showAttempt();
    return;
  }
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
      `<p>The next Pay prompt signs an account-check message, not a transaction. No funds move. Afterward you can review the actual staking action before requesting a transaction.</p><p>Validator: <strong>${esc(v.name)}</strong></p><p id="native-identify-state">Waiting for the account-check response in Pay…</p>`,
    );
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const answer = unwrap(
      await p.sign(
        `StakeSafe account check only\nMainnet\nValidator: ${address}\nNonce: ${nonce}\nThis message does not authorize a staking transaction.`,
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
    const sender = publicKeyToAddress(answer.publicKey),
      state = await readState(sender, address);
    if (run !== revision) return;
    const kind = planStake(state.staker, address);
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
  if ((!s || s.balance + s.inactiveBalance === 0) && value < 10000000)
    throw new Error("At least 100 NIM is required for this position.");
  if (value >= f.state.balance)
    throw new Error(
      "Amount must be below your spendable balance. Leave funds for the fee shown by Pay.",
    );
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
      `<div class="notice-box">${esc(title(f.kind))} · Mainnet</div><p><strong>From account reported by Pay</strong><br><span class="full-validator-address">${esc(f.sender)}</span></p><p><strong>Validator</strong><br>${esc(f.v.name)}<br><span class="full-validator-address">${esc(f.v.address)}</span></p><div class="detail-row"><span>${f.kind === "switch" ? "New funds" : "Amount"}</span><strong>${fmt(f.value)} NIM</strong></div>${f.kind === "switch" ? "<p>Change the existing delegation and request reactivation of all eligible inactive stake. No withdrawal.</p>" : ""}<p>Network fee: <strong>review the actual fee in Pay</strong>. No StakeSafe service fee. This screen is not a fee quote or a guarantee that Pay will accept the transaction.</p><div class="notice-box">Pay controls the final signing account; this SDK has no sender-binding parameter. Check <strong>From</strong> against the address above and cancel if it differs. Also check mainnet, validator, action, amount and fee. A returned transaction hash is not confirmation.</div><p id="native-error" class="native-error" role="alert"></p><button class="button primary" id="native-send">Continue to Nimiq Pay</button><button class="button white" id="native-back">Back</button>`,
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
    lockBusy = false;
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
    const fresh = await readState(f.sender, f.v.address);
    if (
      planStake(fresh.staker, f.v.address) !== f.kind ||
      !same(fresh.staker?.delegation, f.state.staker?.delegation) ||
      totalStake(fresh.staker) !== totalStake(f.state.staker)
    )
      throw new Error(
        "The staking position changed since preview. Close and start again to review current data.",
      );
    if (
      f.kind !== "switch" &&
      (f.value >= fresh.balance ||
        ((!fresh.staker ||
          fresh.staker.balance + fresh.staker.inactiveBalance === 0) &&
          f.value < 10000000))
    )
      throw new Error(
        "Balance or minimum-stake checks changed. Close and review again.",
      );
    if (f.run !== revision)
      throw new Error("Preview closed. No transaction requested.");
    mainnet();
    save({
      version: 1,
      network: "mainnet",
      sender: f.sender,
      validator: f.v.address,
      name: f.v.name,
      kind: f.kind,
      value: f.value,
      previousTotal: totalStake(fresh.staker),
      time: Date.now(),
      status: "awaiting",
      hash: null,
    });
    called = true;
    if (button) button.textContent = "Confirm or cancel in Pay…";
    const params =
      f.kind === "create"
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
async function checkAttempt() {
  if (!attempt?.hash || checking) return;
  checking = true;
  const a = attempt,
    b = q("#native-check");
  if (b) b.disabled = true;
  try {
    const t = await rpc("getTransactionByHash", [a.hash]);
    if (attempt !== a) return;
    if (
      !t ||
      t.hash !== a.hash ||
      t.networkId !== 24 ||
      !same(t.from, a.sender) ||
      t.value !== a.value ||
      !matchesStakingPayload(t, a)
    )
      throw new Error(
        "The transaction could not be matched to the expected mainnet sender, staking action, validator and value. Do not repeat it; inspect Pay.",
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
    if (t.executionResult === false) {
      save({ ...a, status: "failed" });
      showAttempt();
      return;
    }
    if (t.executionResult !== true)
      throw new Error(
        "Execution status is not available. No success is inferred.",
      );
    const staker = await rpc("getStakerByAddress", [a.sender]);
    if (attempt !== a) return;
    if (
      !staker ||
      normalize(staker.address) !== a.sender ||
      !same(staker.delegation, a.validator) ||
      totalStake(staker) < a.previousTotal + a.value
    )
      throw new Error(
        "Mined execution reported, but the expected staking record is not yet verified. Check again later; do not resubmit.",
      );
    save({ ...a, status: "confirmed" });
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
        !["create", "add", "switch"].includes(a.kind) ||
        !Number.isSafeInteger(a.time) ||
        !Number.isSafeInteger(a.value) ||
        a.value < 0 ||
        !Number.isSafeInteger(a.previousTotal) ||
        a.previousTotal < 0 ||
        !(a.hash === null || /^[a-f0-9]{64}$/.test(a.hash))
      )
        throw new Error("Invalid attempt");
      a.sender = normalize(a.sender);
      a.validator = normalize(a.validator);
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
