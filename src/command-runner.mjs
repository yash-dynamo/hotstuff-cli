import { PUBLIC_MARKET_TOOLS } from "./constants.mjs";
import { printHelp, printJsonBlock, printPriceSummary } from "./display.mjs";
import { callTool } from "./mcp-client.mjs";

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function pickValue(input, keys) {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(input, key) &&
      input[key] !== undefined &&
      input[key] !== null
    ) {
      return input[key];
    }
  }

  for (const value of Object.values(input)) {
    if (value && typeof value === "object") {
      const nested = pickValue(value, keys);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
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

function getAssetFromSymbol(symbol) {
  return normalizeSymbol(symbol).split(/[-_/]/)[0];
}

function extractInstrumentRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const perps = Array.isArray(payload.perps) ? payload.perps : [];
    const spot = Array.isArray(payload.spot) ? payload.spot : [];
    if (perps.length > 0 || spot.length > 0) {
      return [...perps, ...spot];
    }
    if (Array.isArray(payload.instruments)) {
      return payload.instruments;
    }
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
  }
  return [];
}

function instrumentToSymbol(instrument) {
  const symbol = instrument?.symbol
    ?? instrument?.name
    ?? instrument?.instrumentName
    ?? instrument?.instrument_name
    ?? instrument?.ticker;

  return symbol ? normalizeMarketSymbol(symbol) : "";
}

function hasSymbol(instrument, symbol) {
  const candidates = [
    instrument?.symbol,
    instrument?.name,
    instrument?.instrumentName,
    instrument?.instrument_name,
    instrument?.ticker,
  ]
    .filter(Boolean)
    .map((item) => String(item).toUpperCase());
  return candidates.includes(symbol.toUpperCase());
}

export async function executeCommand(client, command, args = []) {
  if (command === "help") {
    printHelp();
    return;
  }

  if (command === "tools") {
    const list = await client.listTools();
    const rows = list.tools.filter((tool) =>
      PUBLIC_MARKET_TOOLS.includes(tool.name),
    );
    printJsonBlock(
      "Public Market Tools",
      rows.map((tool) => ({
        name: tool.name,
        title: tool.title ?? tool.description ?? "no description",
      })),
    );
    return;
  }

  if (command === "price") {
    const symbol = normalizeMarketSymbol(args[0]);
    if (!symbol) {
      throw new Error("Usage: price <SYMBOL>");
    }

    const instrumentsPayload = await callTool(client, "get_instruments", {
      type: "all",
    });
    const rows = extractInstrumentRows(instrumentsPayload);
    const known = rows.some((item) => hasSymbol(item, symbol));

    if (!known && rows.length > 0) {
      console.log(
        `Warning: ${symbol} not found in instrument list. Trying anyway.`,
      );
    }

    const asset = getAssetFromSymbol(symbol);
    const [ticker, bbo, oracle] = await Promise.all([
      callTool(client, "get_ticker", { symbol }),
      callTool(client, "get_best_bid_offer", { symbol }),
      callTool(client, "get_oracle_price", { symbol: asset }),
    ]);

    printPriceSummary(symbol, ticker, bbo, oracle);
    printJsonBlock("Ticker", ticker);
    printJsonBlock("Best Bid / Offer", bbo);
    printJsonBlock("Oracle", oracle);
    return;
  }

  if (command === "instruments") {
    const type = args[0] ?? "all";
    if (!["perps", "spot", "all"].includes(type)) {
      throw new Error("Usage: instruments [perps|spot|all]");
    }
    const data = await callTool(client, "get_instruments", { type });
    printJsonBlock("Instruments", data);
    return;
  }

  if (command === "ticker") {
    const symbol = normalizeMarketSymbol(args[0]);
    if (!symbol) {
      throw new Error("Usage: ticker <SYMBOL>");
    }
    const data = await callTool(client, "get_ticker", { symbol });
    printJsonBlock("Ticker", data);
    return;
  }

  if (command === "oracle") {
    const asset = normalizeSymbol(args[0]);
    if (!asset) {
      throw new Error("Usage: oracle <ASSET>");
    }
    const data = await callTool(client, "get_oracle_price", { symbol: asset });
    printJsonBlock("Oracle Price", data);
    return;
  }

  if (command === "mids") {
    const firstArg = String(args[0] ?? "").trim();

    if (firstArg && !/^\d+$/.test(firstArg) && firstArg.toLowerCase() !== "all") {
      const symbol = normalizeMarketSymbol(firstArg);
      const ticker = await callTool(client, "get_ticker", { symbol });
      const mid = pickValue(ticker, ["mid_price", "midPrice", "mark_price", "markPrice"]);
      printJsonBlock("Mid Prices", [{ symbol, mid_price: mid ?? "n/a" }]);
      return;
    }

    let rawMidData;
    let shouldFallback = false;

    try {
      rawMidData = await callTool(client, "get_mid_prices", {});
    } catch {
      shouldFallback = true;
    }

    const midErrorText = typeof rawMidData === "string" ? rawMidData.toLowerCase() : "";
    if (
      !shouldFallback &&
      !midErrorText.includes("symbol is required") &&
      !midErrorText.includes("cannot read properties")
    ) {
      printJsonBlock("Mid Prices", rawMidData);
      return;
    }

    const instrumentsPayload = await callTool(client, "get_instruments", { type: "all" });
    const rows = extractInstrumentRows(instrumentsPayload);
    const limit = firstArg && /^\d+$/.test(firstArg) ? Number(firstArg) : 20;
    const targetCount = Math.max(1, limit);
    const selected = rows.slice(0, targetCount);

    const mids = [];
    for (const instrument of selected) {
      const symbol = instrumentToSymbol(instrument);
      if (!symbol) {
        continue;
      }
      const ticker = await callTool(client, "get_ticker", { symbol });
      const mid = pickValue(ticker, ["mid_price", "midPrice", "mark_price", "markPrice"]);
      mids.push({ symbol, mid_price: mid ?? "n/a" });
    }

    printJsonBlock("Mid Prices", mids);
    return;
  }

  if (command === "bbo") {
    const symbol = normalizeMarketSymbol(args[0]);
    if (!symbol) {
      throw new Error("Usage: bbo <SYMBOL>");
    }
    const data = await callTool(client, "get_best_bid_offer", { symbol });
    printJsonBlock("Best Bid / Offer", data);
    return;
  }

  if (command === "orderbook") {
    const symbol = normalizeMarketSymbol(args[0]);
    if (!symbol) {
      throw new Error("Usage: orderbook <SYMBOL> [DEPTH]");
    }
    const depth = toPositiveInteger(args[1], "depth");
    const data = await callTool(client, "get_orderbook", {
      symbol,
      ...(depth ? { depth } : {}),
    });
    printJsonBlock("Orderbook", data);
    return;
  }

  if (command === "trades") {
    const symbol = normalizeMarketSymbol(args[0]);
    if (!symbol) {
      throw new Error("Usage: trades <SYMBOL> [LIMIT]");
    }
    const limit = toPositiveInteger(args[1], "limit");
    const data = await callTool(client, "get_recent_trades", {
      symbol,
      ...(limit ? { limit } : {}),
    });
    printJsonBlock("Recent Trades", data);
    return;
  }

  if (command === "chart") {
    if (args.length < 5) {
      throw new Error(
        "Usage: chart <SYMBOL> <RES> <TYPE> <FROM_UNIX> <TO_UNIX>",
      );
    }

    const [symbolRaw, resolution, chartType, fromRaw, toRaw] = args;
    const symbol = normalizeMarketSymbol(symbolRaw);
    const from = Number(fromRaw);
    const to = Number(toRaw);

    if (!Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to < 0) {
      throw new Error("FROM_UNIX and TO_UNIX must be positive unix seconds.");
    }

    const data = await callTool(client, "get_chart", {
      symbol,
      resolution,
      chart_type: chartType,
      from,
      to,
    });
    printJsonBlock("Chart", data);
    return;
  }

  if (command === "call") {
    const toolName = args[0];
    if (!toolName) {
      throw new Error("Usage: call <TOOL_NAME> [JSON_ARGS]");
    }

    const rawJson = args.slice(1).join(" ").trim();
    const parsedArgs = rawJson ? parseMaybeJson(rawJson) : {};
    if (rawJson && parsedArgs === null) {
      throw new Error("JSON_ARGS must be valid JSON.");
    }

    const data = await callTool(client, toolName, parsedArgs ?? {});
    printJsonBlock(`Tool Result: ${toolName}`, data);
    return;
  }

  throw new Error(`Unknown command "${command}". Run: help`);
}
