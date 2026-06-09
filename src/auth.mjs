// ------------- Imports -------------
import { promises as fs } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { privateKeyToAccount } from "viem/accounts";
import { printAuthHelp, printCard } from "./ui.mjs";

// ------------- Storage Paths -------------
const CREDENTIALS_FILE = "credentials.json";

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

function formatSavedCredentialLines({ address, privateKey }) {
  return [
    `Account Address: ${address}`,
    `Signer Address: ${privateKeyToAccount(privateKey).address}`,
    `Private Key: ${maskSecret(privateKey)}`,
    `File: ${CREDENTIALS_FILE}`,
  ];
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

    return {
      address,
      signerAddress: privateKey ? privateKeyToAccount(privateKey).address : undefined,
      privateKey,
      source: "file",
    };
  } catch {
    return null;
  }
}

export async function saveCredentials({ address, privateKey }) {
  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  const providedAddress = normalizeAddress(address);

  validatePrivateKey(normalizedPrivateKey);

  if (!providedAddress) {
    throw new Error("Account address is required. Use --address or enter it when prompted.");
  }

  validateAddress(providedAddress);

  await fs.writeFile(
    CREDENTIALS_FILE,
    JSON.stringify(
      {
        address: providedAddress,
        privateKey: normalizedPrivateKey,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  return { address: providedAddress, privateKey: normalizedPrivateKey };
}

export async function clearCredentials() {
  try {
    await fs.unlink(CREDENTIALS_FILE);
    return true;
  } catch {
    return false;
  }
}

async function promptAndSaveCredentials() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const address = normalizeAddress(await rl.question("Main account address: "));
    const privateKey = await rl.question("Agent private key: ");
    const saved = await saveCredentials({ address, privateKey });
    printCard("Credentials Saved", formatSavedCredentialLines(saved));
    return saved;
  } finally {
    rl.close();
  }
}

export async function ensureCredentials(options = {}) {
  const existing = await loadCredentials();
  if (existing) {
    return existing;
  }

  if (options.noPrompt) {
    throw new Error(
      "No saved credentials in credentials.json. Run: node ./cli.mjs auth setup.",
    );
  }

  return promptAndSaveCredentials();
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
      if (!address) {
        throw new Error("When using --private-key, you must also provide --address.");
      }

      const saved = await saveCredentials({ address, privateKey });
      printCard("Credentials Saved", formatSavedCredentialLines(saved));
      return;
    }

    await promptAndSaveCredentials();
    return;
  }

  if (sub === "status" || sub === "show") {
    const creds = await loadCredentials();
    if (!creds) {
      printCard("Credential Status", [
        "No saved credentials in credentials.json.",
        "Run: node ./cli.mjs auth setup.",
      ]);
      return;
    }

    printCard("Credential Status", [
      `Account Address: ${creds.address}`,
      `Signer Address: ${creds.signerAddress ?? privateKeyToAccount(creds.privateKey).address}`,
      `Source: ${creds.source ?? "file"}`,
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
