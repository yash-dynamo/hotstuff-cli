// ------------- Imports -------------
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { privateKeyToAccount } from "viem/accounts";
import { printAuthHelp, printCard } from "./ui.mjs";

// ------------- Storage Paths -------------
const CONFIG_DIR = path.join(os.homedir(), ".hotstuff-cli");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");

// ------------- Helpers -------------
function parseArgs(argv = []) {
  const positionals = [];
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "");

    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (!token.startsWith("--") || token.length <= 2) {
      positionals.push(token);
      continue;
    }

    const eq = token.indexOf("=");
    if (eq !== -1) {
      options[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !String(next).startsWith("--")) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }

  return { positionals, options };
}

function normalizeAddress(input) {
  return String(input ?? "").trim();
}

function normalizePrivateKey(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function validateAddress(address) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Wallet address must be a valid 0x-prefixed 40-hex address.");
  }
}

function validatePrivateKey(privateKey) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("Private key must be 64 hex chars (with or without 0x prefix).");
  }
}

function maskSecret(secret, keep = 4) {
  const raw = String(secret ?? "");
  if (raw.length <= keep * 2) {
    return "*".repeat(Math.max(raw.length, 4));
  }
  return `${raw.slice(0, keep)}...${raw.slice(-keep)}`;
}

async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

// ------------- Public Credential API -------------
export async function loadCredentials() {
  try {
    const raw = await fs.readFile(CREDENTIALS_FILE, "utf8");
    const data = JSON.parse(raw);

    const privateKey = normalizePrivateKey(data?.privateKey);
    const address = normalizeAddress(
      data?.address || (privateKey ? privateKeyToAccount(privateKey).address : ""),
    );

    if (!privateKey) {
      return null;
    }

    return { address, privateKey };
  } catch {
    return null;
  }
}

export async function saveCredentials({ address, privateKey }) {
  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  const providedAddress = normalizeAddress(address);

  validatePrivateKey(normalizedPrivateKey);
  const derivedAddress = privateKeyToAccount(normalizedPrivateKey).address;

  if (providedAddress) {
    validateAddress(providedAddress);
    if (providedAddress.toLowerCase() !== derivedAddress.toLowerCase()) {
      throw new Error(
        `Address does not match private key. Derived address is ${derivedAddress}.`,
      );
    }
  }

  const normalizedAddress = providedAddress || derivedAddress;

  await ensureConfigDir();
  await fs.writeFile(
    CREDENTIALS_FILE,
    JSON.stringify(
      {
        address: normalizedAddress,
        privateKey: normalizedPrivateKey,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  return { address: normalizedAddress, privateKey: normalizedPrivateKey };
}

export async function clearCredentials() {
  try {
    await fs.unlink(CREDENTIALS_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function ensureCredentials(options = {}) {
  const existing = await loadCredentials();
  if (existing) {
    return existing;
  }

  if (options.noPrompt) {
    throw new Error("No saved credentials. Run: hotstuff auth setup");
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const privateKey = await rl.question("API private key: ");
    const saved = await saveCredentials({ privateKey });
    printCard("Credentials Saved", [
      `Address: ${saved.address}`,
      `Private Key: ${maskSecret(saved.privateKey)}`,
      `File: ${CREDENTIALS_FILE}`,
    ]);
    return saved;
  } finally {
    rl.close();
  }
}

// ------------- Auth Commands -------------
export async function runAuth(argv = []) {
  const { positionals, options } = parseArgs(argv);
  const sub = String(positionals[0] ?? "help").trim().toLowerCase();

  if (!sub || sub === "help") {
    printAuthHelp();
    return;
  }

  if (sub === "setup" || sub === "login") {
    const privateKey = options["private-key"] ?? options.privateKey;
    const address = options.address;

    if (address && !privateKey) {
      throw new Error("When using --address, you must also provide --private-key.");
    }

    if (privateKey) {
      const saved = await saveCredentials({ address, privateKey });
      printCard("Credentials Saved", [
        `Address: ${saved.address}`,
        `Private Key: ${maskSecret(saved.privateKey)}`,
        `File: ${CREDENTIALS_FILE}`,
      ]);
      return;
    }

    await ensureCredentials({ noPrompt: false });
    return;
  }

  if (sub === "status" || sub === "show") {
    const creds = await loadCredentials();
    if (!creds) {
      printCard("Credential Status", ["No saved credentials.", "Run: hotstuff auth setup"]);
      return;
    }

    printCard("Credential Status", [
      `Address: ${creds.address}`,
      `Private Key: ${maskSecret(creds.privateKey)}`,
      `File: ${CREDENTIALS_FILE}`,
    ]);
    return;
  }

  if (sub === "clear" || sub === "logout") {
    const removed = await clearCredentials();
    printCard("Credential Status", [
      removed ? "Saved credentials removed." : "No saved credentials found.",
      `File: ${CREDENTIALS_FILE}`,
    ]);
    return;
  }

  throw new Error(`Unknown auth command "${sub}". Run: hotstuff auth help`);
}
