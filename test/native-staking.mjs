// Native wallet calls are STUBBED. This suite never submits a real transaction.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import {
  parseLuna,
  publicKeyToAddress,
  planStake,
  addressToHex,
  matchesStakingPayload,
  validateExitAmount,
  matchesExitPayload,
  exitStateMatches,
} from "../src/staking-utils.mjs";
assert.equal(parseLuna("100.00001"), 10000001);
assert.equal(parseLuna("0.00001"), 1);
for (const s of [
  "0",
  "-1",
  "1e3",
  "100.000001",
  "Infinity",
  "1,000",
  "100foo",
  "9007199254740991",
])
  assert.throws(() => parseLuna(s));
assert.equal(
  publicKeyToAddress("00".repeat(32)),
  "NQ73 H7MG SSLA D4ES UB6H BT83 D69H RQ59 97NA",
); // Cross-checked with official core 2.22.0.
const pub = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  S = publicKeyToAddress(pub),
  A = "NQ07 0000 0000 0000 0000 0000 0000 0000 0000";
// Deterministic, test-only directory entries; never bundled into the app.
const data = [
    {
      name: "Native test validator",
      address: A,
      isListed: true,
      fee: 0.05,
      payoutType: "direct",
    },
    {
      name: "Other test validator",
      address: "NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7",
      isListed: true,
      fee: 0.05,
      payoutType: "direct",
    },
  ],
  v = data[0],
  other = data[1],
  H = "ab".repeat(32),
  BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
assert.ok(v);
assert.equal(planStake(null, v.address), "create");
assert.equal(planStake({ delegation: other.address }, v.address), "switch");
const b = await chromium.launch({ args: ["--no-sandbox"] });
const errors = [];
async function setup(options = {}) {
  const context = await b.newContext({ viewport: { width: 390, height: 844 } }),
    p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  let staker =
    options.kind === "add"
      ? {
          address: S,
          delegation: v.address,
          balance: 20000000,
          inactiveBalance: 0,
          retiredBalance: 0,
        }
      : options.kind === "switch"
        ? {
            address: S,
            delegation: other.address,
            balance: 20000000,
            inactiveBalance: 10000000,
            retiredBalance: 0,
          }
        : null;
  const config = {
    staker,
    tx: null,
    failRead: false,
    flag: false,
    balance: 500000000,
    reads: [],
  };
  await p.route(
    "https://validators-api-main.je-cf9.workers.dev/api/v1/validators",
    (r) =>
      r.fulfill({
        json: data,
        headers: { "access-control-allow-origin": "*" },
      }),
  );
  await p.route("**/api/rpc", async (r) => {
    const { method, params } = r.request().postDataJSON();
    config.reads.push({ method, params });
    if (config.failRead)
      return r.fulfill({ status: 504, json: { error: "timeout" } });
    let x;
    if (method === "getBlockNumber") x = 65590000;
    else if (method === "getAccountByAddress")
      x = { address: params[0], balance: config.balance, type: "basic" };
    else if (method === "getValidatorByAddress")
      x = {
        address: params[0],
        retired: config.flag,
        inactivityFlag: null,
        jailedFrom: null,
      };
    else if (method === "getStakerByAddress") {
      x = config.staker;
      if (!x)
        return r.fulfill({
          json: {
            error: {
              code: -32603,
              data: "No staker with address: " + params[0],
            },
          },
        });
    } else if (method === "getTransactionByHash") x = config.tx;
    else throw new Error("Unexpected method " + method);
    return r.fulfill({ json: { result: { data: x } } });
  });
  await p.addInitScript(
    ({ pub, options, H, A }) => {
      window.__calls = [];
      window.__mode = options.mode || "ok";
      window.nimiqPay = { network: options.network || "mainnet" };
      if (options.network === "unknown") delete window.nimiqPay.network;
      const tx = async (name, params) => {
        window.__calls.push({ name, params });
        if (window.__mode === "deny")
          return { error: { type: "PERMISSION_DENIED", message: "Canceled" } };
        if (window.__mode === "error")
          throw new Error("Connection lost after submission");
        if (window.__mode === "invalid")
          return { error: { type: "INTERNAL_ERROR", message: "Failed" } };
        if (window.__mode === "hang")
          return new Promise((resolve) => (window.__resolveTx = resolve));
        return H;
      };
      window.nimiq = {
        sign: async (m) => {
          window.__calls.push({ name: "sign", message: m });
          if (options.signDeny)
            return {
              error: { type: "PERMISSION_DENIED", message: "Canceled" },
            };
          return { publicKey: pub, signature: "00".repeat(64) };
        },
        sendNewStakerTransaction: (p) => tx("create", p),
        sendStakeTransaction: (p) => tx("add", p),
        sendUpdateStakerTransaction: (p) => tx("switch", p),
        sendSetActiveStakeTransaction: (p) => tx("deactivate", p),
        sendRetireStakeTransaction: (p) => tx("retire", p),
        sendRemoveStakeTransaction: (p) => tx("withdraw", p),
      };
      if (options.remember)
        localStorage.setItem(
          "stakesafe.remembered-address.v1",
          JSON.stringify({
            version: 1,
            network: "mainnet",
            rpc: "https://rpc.nimiqwatch.com",
            consent: "rpc-mainnet-v1",
            address: A,
          }),
        );
    },
    { pub, options, H, A },
  );
  await p.goto(BASE + "/#validators");
  await p.waitForFunction(() => !!window.StakeSafeNative && !!window.StakeSafe);
  return { context, p, config };
}
async function start(p) {
  await p.evaluate((v) => window.StakeSafeNative.start(v), v);
}
async function identify(p) {
  await start(p);
  await p.check("#native-data-consent");
  await p.click("#native-identify");
}
async function review(p, amount = "100") {
  await p.waitForSelector("#native-review-consent");
  if (await p.locator("#native-amount").count())
    await p.fill("#native-amount", amount);
  await p.check("#native-review-consent");
  await p.click("#native-review");
  await p.waitForSelector("#native-send");
}
const calls = (p) => p.evaluate(() => window.__calls);
// No implicit wallet requests on load or before data consent; native signer differs from watch.
{
  const { context, p, config } = await setup({ remember: true });
  assert.equal((await calls(p)).length, 0);
  await identify(p);
  assert.equal(await p.locator("#native-sender").textContent(), S);
  assert.ok(
    config.reads.some(
      (x) => x.method === "getStakerByAddress" && x.params[0] === S,
    ),
  );
  assert.match(await p.locator("#modal-title").textContent(), /Create/);
  await p.fill("#native-amount", "99");
  await p.check("#native-review-consent");
  await p.click("#native-review");
  assert.match(await p.locator("#native-error").textContent(), /100 NIM/);
  assert.equal((await calls(p)).filter((x) => x.name !== "sign").length, 0);
  await review(p, "100.00001");
  await p.click("#native-send");
  await p.waitForSelector("#native-check");
  let c = await calls(p);
  assert.deepEqual(c.find((x) => x.name === "create").params, {
    delegation: v.address,
    value: 10000001,
  });
  assert.match(
    await p.locator("#native-attempt-status").textContent(),
    /not confirmed/,
  );
  assert.equal(
    await p.evaluate(
      () =>
        JSON.parse(localStorage.getItem("stakesafe.native-attempt.v1")).hash,
    ),
    H,
  );
  // Read errors and unmatched transactions must never become success or cause resubmission.
  config.failRead = true;
  await p.click("#native-check");
  await p.waitForFunction(() =>
    document
      .querySelector("#native-attempt-status")
      .textContent.includes("not been retried"),
  );
  config.failRead = false;
  config.tx = {
    hash: H,
    networkId: 24,
    from: A,
    fromType: 0,
    value: 10000001,
    toType: 3,
    to: "NQ77 0000 0000 0000 0000 0000 0000 0000 0001",
    recipientData:
      "0501" + addressToHex(v.address) + "00" + pub + "00" + "00".repeat(64),
    blockNumber: 65590000,
    confirmations: 1,
    executionResult: true,
  };
  await p.click("#native-check");
  await p.waitForFunction(() =>
    document
      .querySelector("#native-attempt-status")
      .textContent.includes("could not be matched"),
  );
  config.tx.from = S;
  assert.equal(
    matchesStakingPayload(
      { ...config.tx, toType: 0 },
      { kind: "create", validator: v.address },
    ),
    false,
  );
  config.staker = {
    address: S,
    delegation: v.address,
    balance: 10000001,
    inactiveBalance: 0,
    retiredBalance: 0,
  };
  await p.click("#native-check");
  await p.waitForFunction(() =>
    document
      .querySelector("#native-attempt-status")
      .textContent.includes("expected staking record"),
  );
  assert.equal((await calls(p)).filter((x) => x.name === "create").length, 1);
  await p.reload();
  await p.waitForSelector("[data-native-attempt]");
  assert.equal((await calls(p)).length, 0);
  await start(p);
  await p.waitForSelector("#native-identify");
  assert.equal(
    await p.evaluate(() => localStorage.getItem("stakesafe.native-attempt.v1")),
    null,
  );
  assert.equal((await calls(p)).length, 0); // A resolved history entry must open review, not replay a transaction.
  await context.close();
}
// Existing position maps to add or explicit delegation switch, never silently creates/switches.
for (const kind of ["add", "switch"]) {
  const { context, p } = await setup({ kind });
  await identify(p);
  await review(p, kind === "add" ? "0.00001" : "100");
  await p.click("#native-send");
  await p.waitForSelector("#native-check");
  const c = (await calls(p)).find((x) => x.name === kind);
  assert.deepEqual(
    c.params,
    kind === "add"
      ? { value: 1 }
      : { newDelegation: v.address, reactivateAllStake: true },
  );
  await context.close();
}
// Regression: Pay wallet funds live in an HTLC, not the basic owner address.
{
  const { context, p, config } = await setup();
  config.balance = 0;
  await identify(p);
  await p.waitForSelector("#native-review-consent");
  assert.match(
    await p.locator("#modal-body").textContent(),
    /not wallet total/,
  );
  assert.match(
    await p.locator("#modal-body").textContent(),
    /not available to StakeSafe/,
  );
  assert.doesNotMatch(
    await p.locator("#modal-body").textContent(),
    /Spendable balance/,
  );
  await review(p, "473");
  await p.click("#native-send");
  await p.waitForSelector("#native-check");
  const localProof = "00" + pub + "00" + "00".repeat(64);
  config.tx = {
    hash: H,
    networkId: 24,
    from: other.address,
    fromType: 2,
    to: "NQ77 0000 0000 0000 0000 0000 0000 0000 0001",
    toType: 3,
    value: 47300000,
    recipientData: "0501" + addressToHex(v.address) + localProof,
    proof: "01" + "00".repeat(98) + localProof,
    blockNumber: 65590000,
    confirmations: 1,
    executionResult: true,
  };
  config.staker = {
    address: S,
    delegation: v.address,
    balance: 47300000,
    inactiveBalance: 0,
    retiredBalance: 0,
  };
  // A different HTLC owner or different staking proof must never pass status matching.
  const correctProof = config.tx.proof;
  config.tx.proof = "01" + "00".repeat(196);
  await p.click("#native-check");
  await p.waitForFunction(() =>
    document
      .querySelector("#native-attempt-status")
      .textContent.includes("could not be matched"),
  );
  config.tx.proof = correctProof;
  const correctData = config.tx.recipientData;
  config.tx.recipientData = "0501" + addressToHex(v.address) + "00".repeat(98);
  await p.click("#native-check");
  await p.waitForFunction(() =>
    document
      .querySelector("#native-attempt-status")
      .textContent.includes("could not be matched"),
  );
  config.tx.recipientData = correctData;
  await p.click("#native-check");
  await p.waitForFunction(() =>
    document
      .querySelector("#native-attempt-status")
      .textContent.includes("expected staking record"),
  );
  assert.equal((await calls(p)).filter((x) => x.name === "create").length, 1);
  await context.close();
}

// Profile totals, validator metadata, remembered native owner and explicit exit steps.
for (const kind of ["deactivate", "retire", "withdraw"]) {
  const { context, p, config } = await setup({ kind: "add" });
  config.staker = {
    address: S,
    delegation: v.address,
    balance: kind === "deactivate" ? 20000000 : 0,
    inactiveBalance: kind === "retire" ? 20000000 : 0,
    retiredBalance: kind === "withdraw" ? 20000000 : 0,
    inactiveFrom: 65580000,
  };
  config.flag = true; // Validator flags must not trap funds by blocking exits.
  await p.evaluate(() => navigate("profile"));
  assert.match(
    await p.locator("#profile-content").textContent(),
    /No staking account/,
  );
  await p.click("#profile-use-pay");
  await p.check("#native-data-consent");
  await p.click("#native-identify");
  await p.waitForFunction(
    () => document.querySelector("#profile-total")?.textContent === "200 NIM",
  );
  assert.equal(
    await p.locator("#profile-validator-name").textContent(),
    v.name,
  );
  assert.equal(await p.locator("#delegated-validator").textContent(), v.name);
  assert.equal((await calls(p)).filter((c) => c.name !== "sign").length, 0);
  await p.reload();
  await p.waitForFunction(
    () => document.querySelector("#profile-total")?.textContent === "200 NIM",
  );
  assert.equal((await calls(p)).length, 0);
  for (const theme of ["light", "dark"]) {
    await p.click(`[data-theme-choice=${theme}]`);
    for (const width of [320, 390, 640]) {
      await p.setViewportSize({ width, height: 900 });
      assert.equal(await p.locator(".mobile-brand").isVisible(), true);
      assert.match(await p.locator(".mobile-brand").textContent(), /StakeSafe/);
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
  }
  await p.screenshot({ path: `test/profile-${kind}.png`, fullPage: false });
  await p.click("#profile-unstake");
  await p.check("#native-data-consent");
  await p.click("#native-identify");
  await p.waitForSelector("#native-stage");
  assert.equal(await p.locator("#native-stage").inputValue(), kind);
  await p.fill("#native-amount", "201");
  await p.check("#native-review-consent");
  await p.click("#native-review");
  assert.match(await p.locator("#native-error").textContent(), /exceeds/);
  await review(p, "100");
  await p.click("#native-send");
  await p.waitForSelector("#native-check");
  const c = (await calls(p)).find((c) => c.name === kind);
  assert.deepEqual(
    c.params,
    kind === "deactivate"
      ? { newActiveBalance: 10000000 }
      : kind === "retire"
        ? { retireStake: 10000000 }
        : { value: 10000000 },
  );
  const proof = "00" + pub + "00" + "00".repeat(64),
    contract = "NQ77 0000 0000 0000 0000 0000 0000 0000 0001";
  config.tx = {
    hash: H,
    networkId: 24,
    from: kind === "withdraw" ? contract : other.address,
    fromType: kind === "withdraw" ? 3 : 2,
    to: kind === "withdraw" ? S : contract,
    toType: kind === "withdraw" ? 0 : 3,
    value: kind === "withdraw" ? 10000000 : 0,
    senderData: kind === "withdraw" ? "01" : "",
    recipientData:
      kind === "withdraw"
        ? ""
        : (kind === "deactivate" ? "08" : "09") +
          BigInt(10000000).toString(16).padStart(16, "0") +
          proof,
    proof: kind === "withdraw" ? proof : "01" + "00".repeat(98) + proof,
    blockNumber: 65590000,
    confirmations: 1,
    executionResult: true,
  };
  const before = { ...config.staker };
  await p.click("#native-check");
  await p.waitForFunction(() =>
    document
      .querySelector("#native-attempt-status")
      .textContent.includes("not yet verified"),
  );
  config.staker = {
    ...before,
    balance: kind === "deactivate" ? 10000000 : 0,
    inactiveBalance: kind === "deactivate" || kind === "retire" ? 10000000 : 0,
    retiredBalance: kind === "retire" || kind === "withdraw" ? 10000000 : 0,
  };
  await p.click("#native-check");
  await p.waitForFunction(() =>
    document
      .querySelector("#native-attempt-status")
      .textContent.includes("expected staking record"),
  );
  assert.equal((await calls(p)).filter((c) => c.name === kind).length, 1);
  assert.equal((await calls(p)).filter((c) => c.name !== "sign").length, 1);
  await context.close();
}
// Wrong native owner must block both profile shortcuts, never silently stake/exit for another address.
for (const intent of ["add", "unstake"]) {
  const { context, p } = await setup({ kind: "add" });
  await p.evaluate(
    (v) =>
      window.StakeSafeNative.start({
        ...v,
        intent: v.intent,
        expectedOwner: "NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7",
      }),
    { ...v, intent },
  );
  await p.check("#native-data-consent");
  await p.click("#native-identify");
  await p.waitForFunction(() =>
    document
      .querySelector("#modal-body")
      .textContent.includes("differs from this profile"),
  );
  assert.equal((await calls(p)).filter((c) => c.name !== "sign").length, 0);
  await context.close();
}
// Applicable remainder minimums; full eligible exit is allowed for native protocol validation.
assert.throws(() =>
  validateExitAmount("retire", 15000000, {
    balance: 0,
    inactiveBalance: 20000000,
    retiredBalance: 0,
  }),
);
assert.throws(() =>
  validateExitAmount("withdraw", 15000000, {
    balance: 0,
    inactiveBalance: 0,
    retiredBalance: 20000000,
  }),
);
assert.equal(
  validateExitAmount("retire", 20000000, {
    balance: 0,
    inactiveBalance: 20000000,
    retiredBalance: 0,
  }),
  20000000,
);
assert.equal(
  validateExitAmount("withdraw", 20000000, {
    balance: 0,
    inactiveBalance: 0,
    retiredBalance: 20000000,
  }),
  20000000,
);

// Regression: an old submitted stake must not hijack Profile Add or Unstake forever.
for (const intent of ["add", "unstake"]) {
  const { context, p, config } = await setup({ kind: "add" });
  const old = {
    version: 1,
    network: "mainnet",
    sender: S,
    validator: v.address,
    name: v.name,
    kind: "create",
    value: 10000000,
    previousTotal: 0,
    time: Date.now() - 3600000,
    status: "submitted",
    hash: H,
  };
  const proof = "00" + pub + "00" + "00".repeat(64);
  config.tx = {
    hash: H,
    networkId: 24,
    from: other.address,
    fromType: 2,
    to: "NQ77 0000 0000 0000 0000 0000 0000 0000 0001",
    toType: 3,
    value: 10000000,
    recipientData: "0501" + addressToHex(v.address) + proof,
    proof: "01" + "00".repeat(98) + proof,
    blockNumber: 65590000,
    confirmations: 12,
    executionResult: true,
  };
  await p.evaluate(
    ({ old, S }) => {
      localStorage.setItem("stakesafe.native-attempt.v1", JSON.stringify(old));
      localStorage.setItem(
        "stakesafe.remembered-address.v1",
        JSON.stringify({
          version: 1,
          network: "mainnet",
          rpc: "https://rpc.nimiqwatch.com",
          consent: "rpc-mainnet-v1",
          address: S,
        }),
      );
    },
    { old, S },
  );
  await p.reload();
  await p.evaluate(() => navigate("profile"));
  await p.waitForFunction(
    () => !document.querySelector("#profile-add")?.disabled,
  );
  await p.click(intent === "add" ? "#profile-add" : "#profile-unstake");
  await p.waitForSelector("#native-identify");
  assert.equal(await p.locator("#native-attempt-status").count(), 0);
  assert.equal(
    await p.evaluate(() => localStorage.getItem("stakesafe.native-attempt.v1")),
    null,
  );
  assert.equal((await calls(p)).length, 0);
  await p.check("#native-data-consent");
  await p.click("#native-identify");
  await p.waitForSelector("#native-review-consent");
  assert.match(
    await p.locator("#modal-title").textContent(),
    intent === "add" ? /Add to existing/ : /Deactivate/,
  );
  assert.equal((await calls(p)).filter((c) => c.name !== "sign").length, 0);
  await context.close();
}
// Receipt errors, unmined receipts and owner mismatches must retain the guard.
for (const problem of ["timeout", "pending", "wrong-owner"]) {
  const { context, p, config } = await setup({ kind: "add" });
  const proof = "00" + pub + "00" + "00".repeat(64);
  const old = {
    version: 1,
    network: "mainnet",
    sender: S,
    validator: v.address,
    name: v.name,
    kind: "create",
    value: 10000000,
    previousTotal: 0,
    time: Date.now() - 10000,
    status: "submitted",
    hash: H,
  };
  config.tx = {
    hash: H,
    networkId: 24,
    from: problem === "wrong-owner" ? A : S,
    fromType: 0,
    to: "NQ77 0000 0000 0000 0000 0000 0000 0001",
    toType: 3,
    value: 10000000,
    recipientData: "0501" + addressToHex(v.address) + proof,
    blockNumber: 65590000,
    confirmations: problem === "pending" ? 0 : 3,
    executionResult: true,
  };
  await p.evaluate(
    (old) =>
      localStorage.setItem("stakesafe.native-attempt.v1", JSON.stringify(old)),
    old,
  );
  await p.reload();
  if (problem === "timeout") config.failRead = true;
  await start(p);
  assert.equal(await p.locator("#native-identify").count(), 0);
  assert.ok(
    await p.evaluate(() => localStorage.getItem("stakesafe.native-attempt.v1")),
  );
  assert.equal((await calls(p)).length, 0);
  // Manual override stays explicit for unresolved outcomes.
  await p.click("#native-clear");
  assert.match(
    await p.locator("#native-clear-error").textContent(),
    /acknowledge/,
  );
  await context.close();
}
// Host mainnet must be known; testnet/unknown never request signatures or transactions.
for (const network of ["testnet", "unknown"]) {
  const { context, p, config } = await setup({ network });
  await start(p);
  assert.match(
    await p.locator("#modal-body").textContent(),
    /requires Nimiq Pay to report mainnet/,
  );
  assert.deepEqual(await calls(p), []);
  assert.equal(config.reads.length, 0);
  await context.close();
}
// Explicit signature cancellation stays read-only.
{
  const { context, p } = await setup({ signDeny: true });
  await identify(p);
  await p.waitForFunction(() =>
    document.querySelector("#modal-body").textContent.includes("canceled"),
  );
  assert.equal((await calls(p)).filter((x) => x.name !== "sign").length, 0);
  await context.close();
}
// RPC timeout / validator flag / insufficient spendable amount block all native writes.
for (const scenario of ["timeout", "flag", "changed", "network-change"]) {
  const { context, p, config } = await setup();
  if (scenario === "timeout") config.failRead = true;
  if (scenario === "flag") config.flag = true;
  await identify(p);
  if (["timeout", "flag"].includes(scenario)) {
    await p.waitForFunction(
      () =>
        document.querySelector("#modal-title").textContent === "Native staking",
    );
  } else {
    if (scenario === "changed")
      config.staker = {
        address: S,
        delegation: other.address,
        balance: 20000000,
        inactiveBalance: 0,
        retiredBalance: 0,
      };
    await review(p);
    if (scenario === "network-change")
      await p.evaluate(() => (window.nimiqPay.network = "testnet"));
    await p.click("#native-send");
    await p.waitForFunction(
      () => document.querySelector("#native-error").textContent.length > 0,
    );
  }
  assert.equal((await calls(p)).filter((x) => x.name !== "sign").length, 0);
  await context.close();
}
// Rejection, ambiguous errors, legacy errors persist outcome; do not automatically retry.
for (const mode of ["deny", "error", "invalid"]) {
  const { context, p } = await setup({ mode });
  await identify(p);
  await review(p);
  await p.click("#native-send");
  await p.waitForSelector("#native-clear");
  assert.equal((await calls(p)).filter((x) => x.name === "create").length, 1);
  assert.equal(
    await p.evaluate(
      () =>
        JSON.parse(localStorage.getItem("stakesafe.native-attempt.v1")).status,
    ),
    mode === "deny" ? "canceled" : "unknown",
  );
  await p.reload();
  await start(p);
  assert.equal(
    await p.locator("#native-identify").count(),
    mode === "deny" ? 1 : 0,
  );
  assert.equal((await calls(p)).length, 0);
  await context.close();
}
// A pending native prompt blocks duplicate clicks, reload and parallel tabs.
{
  const { context, p, config } = await setup({ mode: "hang" });
  const p2 = await context.newPage();
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.addInitScript(() => {
    window.nimiqPay = { network: "mainnet" };
    window.__calls = [];
    window.nimiq = {
      sign: async () => {
        window.__calls.push("sign");
        throw new Error("Must not sign");
      },
    };
  });
  await p2.route(
    "https://validators-api-main.je-cf9.workers.dev/api/v1/validators",
    (r) =>
      r.fulfill({
        json: data,
        headers: { "access-control-allow-origin": "*" },
      }),
  );
  await p2.goto(BASE + "/#validators");
  await p2.waitForFunction(() => !!window.StakeSafeNative);
  await identify(p);
  await review(p);
  await p.click("#native-send");
  await p.waitForFunction(() =>
    window.__calls.some((x) => x.name === "create"),
  );
  await p2.waitForSelector("[data-native-attempt]");
  await start(p2);
  assert.equal(await p2.locator("#native-identify").count(), 0);
  assert.deepEqual(await calls(p2), []);
  await p.evaluate(() => document.querySelector("#native-send").click());
  assert.equal((await calls(p)).filter((x) => x.name === "create").length, 1);
  await p.reload();
  await p.waitForSelector("[data-native-attempt]");
  await start(p);
  assert.equal(await p.locator("#native-identify").count(), 0);
  assert.equal((await calls(p)).length, 0);
  await context.close();
}
// Fail closed if durable storage or the cross-tab lock is unavailable.
for (const mode of ["storage", "lock"]) {
  const { context, p } = await setup();
  await identify(p);
  await review(p);
  await p.evaluate((mode) => {
    if (mode === "storage")
      Storage.prototype.setItem = () => {
        throw new Error("Device storage unavailable");
      };
    else Object.defineProperty(navigator, "locks", { value: undefined });
  }, mode);
  await p.click("#native-send");
  await p.waitForFunction(
    () =>
      document.querySelector("#native-error")?.textContent.length > 0 ||
      document.querySelector("#modal-title").textContent === "Native staking",
  );
  assert.equal((await calls(p)).filter((x) => x.name !== "sign").length, 0);
  await context.close();
}
// Native flow UI stays within mobile viewports and in both themes.
{
  const { context, p } = await setup();
  await identify(p);
  for (const theme of ["light", "dark"]) {
    await p.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [320, 390, 640]) {
      await p.setViewportSize({ width, height: 900 });
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
  }
  await p.screenshot({
    path: "test/native-staking-mobile.png",
    fullPage: true,
  });
  await context.close();
}
await b.close();
assert.deepEqual(errors, []);
console.log(
  "PASS: mocked native create/add/explicit switch, exact Luna/minimum, zero basic balance with HTLC funding, reported signer vs watched address, strict mainnet, consent, cancellation, ambiguous outcomes, duplicate/reload guard, read-only status matching, mobile branding/profile totals/validator names, native deactivate/retire/withdraw, settled-history handoff to fresh Profile actions, unresolved-receipt blocking and owner-mismatch guards. No real transactions submitted.",
);
