// ------------- Imports -------------
import { createInfoClient, createExchangeClient } from "./sdk.mjs";
import { normalizeMarketSymbol } from "./market.mjs";
import { ensureCredentials } from "./auth.mjs";
import { printJsonBlock, printTradeHelp } from "./ui.mjs";

// ------------- Constants -------------
const SIDES = new Set(["buy", "sell"]);
const POSITION_SIDES = new Set(["LONG", "SHORT", "BOTH"]);
const TIFS = new Set(["GTC", "IOC", "FOK"]);

const USAGE = {
  buy: "trade buy <SYMBOL> <SIZE> <PRICE> [--position LONG|SHORT|BOTH] [--tif GTC|IOC|FOK] [--reduce-only] [--post-only] [--cloid ID] [--expires UNIX]",
  sell: "trade sell <SYMBOL> <SIZE> <PRICE> [--position LONG|SHORT|BOTH] [--tif GTC|IOC|FOK] [--reduce-only] [--post-only] [--cloid ID] [--expires UNIX]",
  cancel: "trade cancel <SYMBOL> (--oid ORDER_ID | --cloid CLIENT_ID) [--expires UNIX]",
  cancelAll: "trade cancel-all [--expires UNIX]",
  orders: "trade orders [--limit N] [--page N]",
  positions: "trade positions",
};

// ------------- Parsing -------------
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

// ------------- Validation -------------
function requireValue(value, usage, normalize = (x) => String(x ?? "").trim()) {
  const parsed = normalize(value);
  if (!parsed) {
    throw new Error(`Usage: ${usage}`);
  }
  return parsed;
}

function toPositiveNumber(input, fieldName) {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
  return value;
}

function toPositiveInteger(input, fieldName) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return value;
}

function toUnixSecondsOrDefault(input, defaultValue) {
  if (input === undefined) {
    return defaultValue;
  }
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("expires must be a unix timestamp in seconds.");
  }
  return value;
}

function parseEnum(value, accepted, fieldName, fallback) {
  const parsed = String(value ?? fallback).trim().toUpperCase();
  if (!accepted.has(parsed)) {
    throw new Error(`${fieldName} must be one of: ${Array.from(accepted).join(", ")}.`);
  }
  return parsed;
}

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  if (value === true || value === false) {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(text)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(text)) {
    return false;
  }
  return Boolean(value);
}

async function requireSavedCredentials() {
  return ensureCredentials({ noPrompt: true });
}

// ------------- Instrument Lookup -------------
async function resolveInstrument(info, symbolInput) {
  const symbol = requireValue(symbolInput, USAGE.buy, normalizeMarketSymbol);
  const data = await info.instruments({ type: "all" });

  const all = [
    ...(Array.isArray(data?.perps) ? data.perps : []),
    ...(Array.isArray(data?.spot) ? data.spot : []),
  ];

  const target = symbol.toUpperCase();
  const match = all.find((item) => String(item?.name ?? item?.symbol ?? "").toUpperCase() === target);
  if (!match) {
    throw new Error(`Instrument "${symbol}" not found.`);
  }

  return {
    id: Number(match.id),
    symbol: String(match.name ?? match.symbol ?? symbol),
  };
}

// ------------- Command Handlers -------------
async function runPlaceOrder(sideName, args, options) {
  const symbolArg = args[0];
  const sizeArg = options.size ?? args[1];
  const priceArg = options.price ?? args[2];

  const side = sideName === "buy" ? "b" : "s";
  const size = String(toPositiveNumber(requireValue(sizeArg, USAGE[sideName]), "size"));
  const price = String(toPositiveNumber(requireValue(priceArg, USAGE[sideName]), "price"));
  const positionSide = parseEnum(options.position, POSITION_SIDES, "position", "BOTH");
  const tif = parseEnum(options.tif, TIFS, "tif", "GTC");
  const expiresAfter = toUnixSecondsOrDefault(
    options.expires,
    Math.floor(Date.now() / 1000) + 3600,
  );

  const credentials = await requireSavedCredentials();
  const info = createInfoClient();
  const exchange = createExchangeClient({ privateKey: credentials.privateKey });
  const instrument = await resolveInstrument(info, symbolArg);

  const cloid = String(options.cloid ?? `cli-${Date.now()}`);
  const ro = parseBooleanFlag(options["reduce-only"] ?? options.ro, false);
  const po = parseBooleanFlag(options["post-only"] ?? options.po, false);
  const response = await exchange.placeOrder({
    orders: [
      {
        instrumentId: instrument.id,
        side,
        positionSide,
        price,
        size,
        tif,
        ro,
        po,
        cloid,
      },
    ],
    expiresAfter,
  });

  printJsonBlock(`${sideName.toUpperCase()} Order`, {
    symbol: instrument.symbol,
    side: sideName,
    size,
    price,
    response,
  });
}

async function runCancel(args, options) {
  const symbol = requireValue(args[0], USAGE.cancel, normalizeMarketSymbol);
  const oidRaw = options.oid;
  const cloidRaw = options.cloid;

  if (!oidRaw && !cloidRaw) {
    throw new Error(`Usage: ${USAGE.cancel}`);
  }

  const expiresAfter = toUnixSecondsOrDefault(
    options.expires,
    Math.floor(Date.now() / 1000) + 3600,
  );

  const credentials = await requireSavedCredentials();
  const info = createInfoClient();
  const exchange = createExchangeClient({ privateKey: credentials.privateKey });
  const instrument = await resolveInstrument(info, symbol);

  if (oidRaw) {
    const oid = toPositiveInteger(oidRaw, "oid");
    const response = await exchange.cancelByOid({
      cancels: [{ oid, instrumentId: instrument.id }],
      expiresAfter,
    });
    printJsonBlock("Cancel By OID", { symbol: instrument.symbol, oid, response });
    return;
  }

  const cloid = requireValue(cloidRaw, USAGE.cancel);
  const response = await exchange.cancelByCloid({
    cancels: [{ cloid, instrumentId: instrument.id }],
    expiresAfter,
  });
  printJsonBlock("Cancel By CLOID", { symbol: instrument.symbol, cloid, response });
}

async function runCancelAll(options) {
  const expiresAfter = toUnixSecondsOrDefault(
    options.expires,
    Math.floor(Date.now() / 1000) + 3600,
  );
  const credentials = await requireSavedCredentials();
  const exchange = createExchangeClient({ privateKey: credentials.privateKey });
  const response = await exchange.cancelAll({ expiresAfter });
  printJsonBlock("Cancel All", response);
}

async function runOrders(options) {
  const credentials = await requireSavedCredentials();
  const info = createInfoClient();

  const page = options.page === undefined ? undefined : toPositiveInteger(options.page, "page");
  const limit = options.limit === undefined ? undefined : toPositiveInteger(options.limit, "limit");
  const response = await info.openOrders({
    user: credentials.address,
    ...(page ? { page } : {}),
    ...(limit ? { limit } : {}),
  });
  printJsonBlock("Open Orders", response);
}

async function runPositions(options) {
  const credentials = await requireSavedCredentials();
  const info = createInfoClient();
  const response = await info.positions({ user: credentials.address });
  printJsonBlock("Positions", response);
}

// ------------- Public Runner -------------
export async function runTrade(argv = []) {
  const { positionals, options } = parseArgs(argv);
  const command = String(positionals[0] ?? "help").trim().toLowerCase();
  const args = positionals.slice(1);

  if (!command || command === "help") {
    printTradeHelp();
    return;
  }

  if (SIDES.has(command)) {
    await runPlaceOrder(command, args, options);
    return;
  }

  if (command === "cancel") {
    await runCancel(args, options);
    return;
  }

  if (command === "cancel-all") {
    await runCancelAll(options);
    return;
  }

  if (command === "orders") {
    await runOrders(options);
    return;
  }

  if (command === "positions") {
    await runPositions(options);
    return;
  }

  throw new Error(`Unknown trade command "${command}". Run: hotstuff trade help`);
}
