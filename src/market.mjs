// ------------- Imports -------------
import { printJsonBlock, printMarketHelp, printPriceSummary } from "./ui.mjs";

// ------------- Constants -------------
const LIST_TYPES = new Set(["all", "perps", "spot"]);
const TICKER_MARKETS = new Set(["all", "perp", "spot"]);
const CHART_TYPES = new Set(["mark", "ltp", "index"]);
const CHART_RESOLUTIONS = new Set(["1", "5", "15", "60", "240", "1D", "1W"]);
const PERIOD_TO_RESOLUTION = new Map([
  [60, "1"],
  [300, "5"],
  [900, "15"],
  [3600, "60"],
  [14400, "240"],
  [86400, "1D"],
  [604800, "1W"],
]);

const USAGE = {
  list: "market list [--type all|perps|spot]",
  price: "market price <SYMBOL>",
  tickers: "market tickers [--market perp|spot|all] [--limit N]",
  candles:
    "market candles <SYMBOL> [--period SECONDS] [--from UNIX] [--to UNIX] [--type mark|ltp|index]",
  orderbook: "market orderbook <SYMBOL> [--depth N]",
  instruments: "market instruments [perps|spot|all]",
  ticker: "market ticker <SYMBOL>",
  oracle: "market oracle <ASSET>",
  bbo: "market bbo <SYMBOL>",
  mids: "market mids [SYMBOL|LIMIT|all]",
  trades: "market trades <SYMBOL> [LIMIT]",
  chart: "market chart <SYMBOL> <RES> <TYPE> <FROM_UNIX> <TO_UNIX>",
};

// ------------- Argument Parsing -------------
function parseArgs(argv = []) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] ?? "");

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("--") || token.length === 2) {
      positionals.push(token);
      continue;
    }

    const equalsIndex = token.indexOf("=");
    if (equalsIndex !== -1) {
      options[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith("--")) {
      options[key] = next;
      index += 1;
      continue;
    }

    options[key] = true;
  }

  return { positionals, options };
}

// ------------- Normalization -------------
function normalizeSymbol(symbol) {
  return String(symbol ?? "").trim().toUpperCase();
}

export function normalizeMarketSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    return normalized;
  }
  if (normalized.includes("-") || normalized.includes("/") || normalized.includes("_")) {
    return normalized;
  }
  return `${normalized}-PERP`;
}

// ------------- Validation Helpers -------------
function requireValue(raw, usage, normalize = (value) => String(value ?? "").trim()) {
  const value = normalize(raw);
  if (!value) {
    throw new Error(`Usage: ${usage}`);
  }
  return value;
}

function toPositiveInteger(input, fieldName) {
  if (input === undefined) {
    return undefined;
  }
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return value;
}

function toUnixSeconds(input, fieldName) {
  const value = Number(input);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a unix timestamp in seconds.`);
  }
  return value;
}

function parseEnum(raw, values, usage, fallback) {
  const value = String(raw ?? fallback).trim().toLowerCase();
  if (!values.has(value)) {
    throw new Error(`Usage: ${usage}`);
  }
  return value;
}

function parseChartType(raw, fallback = "mark") {
  const value = String(raw ?? fallback).trim().toLowerCase();
  if (!CHART_TYPES.has(value)) {
    throw new Error("Chart type must be one of: mark, ltp, index.");
  }
  return value;
}

// ------------- Data Helpers -------------
function unwrapFirstRow(rows) {
  return Array.isArray(rows) ? rows[0] : rows;
}

function getAssetFromSymbol(symbol) {
  return normalizeSymbol(symbol).split(/[-_/]/)[0];
}

function periodToResolution(periodSeconds) {
  const resolution = PERIOD_TO_RESOLUTION.get(periodSeconds);
  if (!resolution) {
    throw new Error(
      "period must be one of: 60, 300, 900, 3600, 14400, 86400, 604800.",
    );
  }
  return resolution;
}

function flattenInstruments(instruments, type = "all") {
  const rows = [];
  if (type === "all" || type === "perps") {
    for (const item of instruments.perps ?? []) {
      rows.push({
        market: "perp",
        symbol: normalizeMarketSymbol(item?.name ?? item?.symbol ?? ""),
      });
    }
  }
  if (type === "all" || type === "spot") {
    for (const item of instruments.spot ?? []) {
      rows.push({
        market: "spot",
        symbol: normalizeMarketSymbol(item?.name ?? item?.symbol ?? ""),
      });
    }
  }
  return rows;
}

// ------------- Generic Command Builders -------------
function createMethodCommand(config) {
  return async (info, args, options) => {
    const raw = config.valueFrom?.(args, options) ?? args[0];
    const value = requireValue(raw, config.usage, config.normalize);
    const params = config.params(value, args, options);
    const result = await info[config.method](params);
    printJsonBlock(
      config.title,
      config.unwrap ? (unwrapFirstRow(result) ?? result) : result,
    );
  };
}

// ------------- Command Handlers -------------
async function runList(info, args, options) {
  const type = parseEnum(options.type ?? args[0], LIST_TYPES, USAGE.list, "all");
  const instruments = await info.instruments({ type });
  printJsonBlock("Markets", flattenInstruments(instruments, type));
}

async function runPrice(info, args) {
  const symbol = requireValue(args[0], USAGE.price, normalizeMarketSymbol);
  const asset = getAssetFromSymbol(symbol);
  const [tickerRows, bboRows] = await Promise.all([
    info.ticker({ symbol }),
    info.bbo({ symbol }),
  ]);

  let oracle;
  try {
    oracle = await info.oracle({ symbol: asset });
  } catch (error) {
    oracle = { error: error?.message ?? "oracle lookup failed" };
  }

  const ticker = unwrapFirstRow(tickerRows);
  const bbo = unwrapFirstRow(bboRows);
  printPriceSummary(symbol, ticker, bbo, oracle);
  printJsonBlock("Ticker", ticker ?? tickerRows);
  printJsonBlock("Best Bid / Offer", bbo ?? bboRows);
  printJsonBlock("Oracle", oracle);
}

async function runTickers(info, _args, options) {
  const market = parseEnum(options.market, TICKER_MARKETS, USAGE.tickers, "all");
  const limit = toPositiveInteger(options.limit, "limit");
  const instruments = await info.instruments({ type: "all" });
  const type = market === "perp" ? "perps" : market;
  const symbols = flattenInstruments(instruments, type).map((row) => row.symbol);
  const selected = limit ? symbols.slice(0, limit) : symbols;

  const rows = await Promise.all(
    selected.map(async (symbol) => {
      const tickerRows = await info.ticker({ symbol });
      return unwrapFirstRow(tickerRows) ?? { symbol };
    }),
  );
  printJsonBlock("Tickers", rows);
}

async function runCandles(info, args, options) {
  const symbol = requireValue(args[0], USAGE.candles, normalizeMarketSymbol);
  const period = toPositiveInteger(options.period ?? 3600, "period");
  const now = Math.floor(Date.now() / 1000);
  const from = options.from === undefined ? now - 86400 : toUnixSeconds(options.from, "from");
  const to = options.to === undefined ? now : toUnixSeconds(options.to, "to");

  if (from >= to) {
    throw new Error("from must be less than to.");
  }

  const rows = await info.chart({
    symbol,
    resolution: periodToResolution(period),
    chart_type: parseChartType(options.type, "mark"),
    from,
    to,
  });
  printJsonBlock("Candles", rows);
}

async function runInstruments(info, args) {
  const type = parseEnum(args[0], LIST_TYPES, USAGE.instruments, "all");
  const data = await info.instruments({ type });
  printJsonBlock("Instruments", data);
}

async function runMids(info, args) {
  const firstArg = String(args[0] ?? "").trim();
  const lowerArg = firstArg.toLowerCase();

  if (firstArg && !/^\d+$/.test(firstArg) && lowerArg !== "all") {
    const symbol = normalizeMarketSymbol(firstArg);
    const tickerRows = await info.ticker({ symbol });
    const ticker = unwrapFirstRow(tickerRows);
    printJsonBlock("Mid Prices", [{ symbol, mid_price: ticker?.mid_price ?? "n/a" }]);
    return;
  }

  const rows = await info.mids({});
  if (firstArg && /^\d+$/.test(firstArg)) {
    printJsonBlock("Mid Prices", rows.slice(0, toPositiveInteger(firstArg, "limit")));
    return;
  }
  printJsonBlock("Mid Prices", rows);
}

async function runChart(info, args) {
  if (args.length < 5) {
    throw new Error(`Usage: ${USAGE.chart}`);
  }

  const symbol = requireValue(args[0], USAGE.chart, normalizeMarketSymbol);
  const resolution = String(args[1] ?? "").trim();
  const chartType = parseChartType(args[2], "");
  const from = toUnixSeconds(args[3], "from");
  const to = toUnixSeconds(args[4], "to");

  if (!CHART_RESOLUTIONS.has(resolution)) {
    throw new Error("RES must be one of: 1, 5, 15, 60, 240, 1D, 1W.");
  }
  if (from >= to) {
    throw new Error("FROM_UNIX must be less than TO_UNIX.");
  }

  const rows = await info.chart({
    symbol,
    resolution,
    chart_type: chartType,
    from,
    to,
  });
  printJsonBlock("Chart", rows);
}

// ------------- Command Registry -------------
const MARKET_COMMANDS = {
  list: runList,
  price: runPrice,
  tickers: runTickers,
  candles: runCandles,
  instruments: runInstruments,
  mids: runMids,
  chart: runChart,
  ticker: createMethodCommand({
    usage: USAGE.ticker,
    method: "ticker",
    title: "Ticker",
    normalize: normalizeMarketSymbol,
    params: (symbol) => ({ symbol }),
    unwrap: true,
  }),
  oracle: createMethodCommand({
    usage: USAGE.oracle,
    method: "oracle",
    title: "Oracle Price",
    normalize: normalizeSymbol,
    params: (symbol) => ({ symbol }),
    unwrap: false,
  }),
  bbo: createMethodCommand({
    usage: USAGE.bbo,
    method: "bbo",
    title: "Best Bid / Offer",
    normalize: normalizeMarketSymbol,
    params: (symbol) => ({ symbol }),
    unwrap: true,
  }),
  orderbook: createMethodCommand({
    usage: USAGE.orderbook,
    method: "orderbook",
    title: "Orderbook",
    normalize: normalizeMarketSymbol,
    params: (symbol, _args, options) => {
      const depth = toPositiveInteger(options.depth, "depth");
      return { symbol, ...(depth ? { depth } : {}) };
    },
    unwrap: false,
  }),
  trades: createMethodCommand({
    usage: USAGE.trades,
    method: "trades",
    title: "Recent Trades",
    normalize: normalizeMarketSymbol,
    params: (symbol, args) => {
      const limit = toPositiveInteger(args[1], "limit");
      return { symbol, ...(limit ? { limit } : {}) };
    },
    unwrap: false,
  }),
};

// ------------- Public Runner -------------
export async function runMarket(info, argv = []) {
  const { positionals, options } = parseArgs(argv);
  const [subcommandRaw, ...args] = positionals;
  const subcommand = String(subcommandRaw ?? "").trim().toLowerCase();

  if (!subcommand || subcommand === "help") {
    printMarketHelp();
    return;
  }

  const handler = MARKET_COMMANDS[subcommand];
  if (!handler) {
    throw new Error(`Unknown market command "${subcommand}". Run: hotstuff market help`);
  }

  await handler(info, args, options);
}
