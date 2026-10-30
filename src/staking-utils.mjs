import { blake2b } from "@noble/hashes/blake2b";
export function parseLuna(value) {
  const s = String(value).trim();
  if (!/^\d{1,11}(?:\.\d{1,5})?$/.test(s))
    throw new Error("Enter NIM with at most 5 decimal places.");
  const [whole, part = ""] = s.split(".");
  const n = Number(whole) * 100000 + Number(part.padEnd(5, "0"));
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error("Enter a positive amount.");
  return n;
}
export function publicKeyToAddress(hex) {
  if (typeof hex !== "string" || !/^[a-f0-9]{64}$/i.test(hex))
    throw new Error("Nimiq Pay did not return a valid account public key.");
  const bytes = blake2b(
    Uint8Array.from(hex.match(/../g).map((x) => parseInt(x, 16))),
    { dkLen: 32 },
  ).slice(0, 20);
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVXY";
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  let mod = 0;
  for (const c of out + "NQ00")
    for (const d of /\d/.test(c) ? c : String(c.charCodeAt(0) - 55))
      mod = (mod * 10 + Number(d)) % 97;
  return ("NQ" + String(98 - mod).padStart(2, "0") + out)
    .match(/.{1,4}/g)
    .join(" ");
}
export function planStake(staker, validator) {
  if (!staker) return "create";
  return String(staker.delegation || "").replace(/\s/g, "") ===
    validator.replace(/\s/g, "")
    ? "add"
    : "switch";
}
export function integerLuna(value, label = "balance") {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(
      `Cannot verify ${label}. Please try the read-only check later.`,
    );
  return value;
}
export function totalStake(s) {
  return s
    ? integerLuna(
        ["balance", "inactiveBalance", "retiredBalance"].reduce(
          (n, k) => n + integerLuna(s[k], k),
          0,
        ),
        "total stake",
      )
    : 0;
}
export function addressToHex(address) {
  const s = String(address).replace(/\s/g, "").slice(4),
    alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVXY";
  if (s.length !== 32) throw new Error("Invalid address length.");
  let bits = 0,
    value = 0,
    hex = "";
  for (const c of s) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Invalid address encoding.");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      hex += ((value >>> bits) & 255).toString(16).padStart(2, "0");
    }
  }
  return hex;
}
// Format and discriminants cross-checked against official core 2.22.0 TransactionBuilder.
export function matchesStakingPayload(t, a) {
  if (
    t.toType !== 3 ||
    String(t.to).replace(/\s/g, "") !==
      "NQ7700000000000000000000000000000001" ||
    typeof t.recipientData !== "string" ||
    !/^([0-9a-f]{2})+$/i.test(t.recipientData)
  )
    return false;
  const raw = t.recipientData.toLowerCase();
  if (a.kind === "add") return raw === "06" + addressToHex(a.sender);
  const prefix =
    (a.kind === "create" ? "0501" : "0701") +
    addressToHex(a.validator) +
    (a.kind === "switch" ? "01" : "");
  return (
    raw.startsWith(prefix) &&
    matchesSingleSigOwner(raw.slice(prefix.length), a.sender)
  );
}

// Canonical Ed25519 single-signature proof: type byte, public key, empty Merkle path, signature.
// ExecutionResult=true is checked separately; this matches identity, not independent crypto verification.
function matchesSingleSigOwner(proof, owner) {
  return (
    typeof proof === "string" &&
    /^00[0-9a-f]{64}00[0-9a-f]{128}$/i.test(proof) &&
    publicKeyToAddress(proof.slice(2, 66)) === owner
  );
}
export function matchesFundingOwner(t, a) {
  if (t.fromType === 0)
    return (
      String(t.from).replace(/\s/g, "") === String(a.sender).replace(/\s/g, "")
    );
  // Pay early-resolve: 01 + cosigner proof (variable length) + canonical local-owner proof.
  // The mined-execution check ensures the node validated the HTLC proof and the contract spend.
  return (
    t.fromType === 2 &&
    typeof t.proof === "string" &&
    /^01[0-9a-f]+$/i.test(t.proof) &&
    t.proof.length >= 394 &&
    matchesSingleSigOwner(t.proof.slice(-196), a.sender)
  );
}
