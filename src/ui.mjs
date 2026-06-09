// ------------- Imports -------------
import chalk from "chalk";

// ------------- Value Helpers -------------
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

// ------------- Render Helpers -------------
function fitLine(line, width) {
  const plain = stripAnsi(line);
  if (plain.length <= width) {
    return `${line}${" ".repeat(width - plain.length)}`;
  }
  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

function toLines(value) {
  if (
    Array.isArray(value) &&
    value.every((item) => ["string", "number", "boolean"].includes(typeof item))
  ) {
    return value.map((item) => String(item));
  }
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return String(text).split("\n");
}

function stripAnsi(text) {
  return String(text).replace(/\x1B\[[0-9;]*m/g, "");
}

function buildBox(title, lines, options = {}) {
  const safeLines = lines.length > 0 ? lines : [""];
  const borderColor = options.borderColor ?? ((text) => chalk.dim(text));
  const titleStyle = options.titleStyle ?? ((text) => chalk.bold(text));

  const contentWidth = Math.min(
    Math.max(
      stripAnsi(title).length + 2,
      ...safeLines.map((line) => stripAnsi(line).length),
    ),
    120,
  );

  const horizontal = "─".repeat(contentWidth + 2);
  const top = borderColor(`╭${horizontal}╮`);
  const bottom = borderColor(`╰${horizontal}╯`);
  const titleLine = `${borderColor("│")} ${titleStyle(title.padEnd(contentWidth))} ${borderColor("│")}`;
  const separator = borderColor(`├${horizontal}┤`);
  const body = safeLines.map((line) => {
    const content = fitLine(line, contentWidth);
    return `${borderColor("│")} ${content} ${borderColor("│")}`;
  });

  return [top, titleLine, separator, ...body, bottom].join("\n");
}

// ------------- Public Print Helpers -------------
export function printCard(title, value, options = {}) {
  console.log(buildBox(title, toLines(value), options));
}

export function printHelp() {
  console.log("HOTSTUFF MARKET CLI");
  console.log("SDK-powered market + trading CLI for Hotstuff.\n");

  printCard("Usage", [
    "hotstuff <command> [args]",
    "hotstuff-market <command> [args]",
    "cli <command> [args]",
    "hotstuff help",
  ]);

  printCard("Top-level Commands", [
    "help                              Show help",
    "market <command>                  Run market commands",
    "trade <command>                   Place/cancel orders",
    "auth <command>                    Setup API wallet + private key",
  ]);

  printMarketHelp();
  printTradeHelp();
  printAuthHelp();
}

export function printMarketHelp() {
  printCard("Market Commands", [
    "market list [--type all|perps|spot]",
    "market price <SYMBOL>",
    "market tickers [--market perp|spot|all] [--limit N]",
    "market candles <SYMBOL> [--period SECONDS] [--from UNIX] [--to UNIX] [--type mark|ltp|index]",
    "market orderbook <SYMBOL> [--depth N]",
    "market instruments [perps|spot|all]",
    "market ticker <SYMBOL>",
    "market oracle <ASSET>",
    "market supported-collateral <ASSET>",
    "market bbo <SYMBOL>",
    "market mids <SYMBOL>",
    "market trades <SYMBOL> [LIMIT]",
    "market chart <SYMBOL> <RES> <TYPE> <FROM_UNIX> <TO_UNIX>",
    "market help",
  ]);

  printCard("Examples", [
    "hotstuff market list --type perps",
    "hotstuff market price BTC",
    "hotstuff market tickers --market perp --limit 10",
    "hotstuff market candles BTC --period 3600 --type mark",
    "hotstuff market orderbook BTC --depth 20",
    "hotstuff market chart BTC-PERP 60 mark 1710000000 1710086400",
  ]);
}

export function printTradeHelp() {
  printCard("Trade Setup", [
    "Trading requires saved credentials first.",
    "Run: node ./cli.mjs auth setup",
    "Check: node ./cli.mjs auth status",
  ]);

  printCard("Trade Commands", [
    "trade buy <SYMBOL> <SIZE> <PRICE> [...order opts]",
    "trade sell <SYMBOL> <SIZE> <PRICE> [...order opts]",
    "trade cancel <SYMBOL> (--oid ORDER_ID | --cloid CLIENT_ID)",
    "trade cancel-instrument <SYMBOL>",
    "trade cancel-all",
    "trade orders [--limit N] [--page N]",
    "trade positions",
    "trade help",
  ]);

  printCard("Trade Examples", [
    "node ./cli.mjs auth setup",
    "node ./cli.mjs auth status",
    "node ./cli.mjs trade buy BTC 0.01 70000",
    "node ./cli.mjs trade sell BTC 0.01 71000",
    "node ./cli.mjs trade cancel BTC --oid 123456",
    "node ./cli.mjs trade cancel BTC --cloid cli-12345",
    "node ./cli.mjs trade cancel-instrument BTC",
    "node ./cli.mjs trade cancel-all",
    "node ./cli.mjs trade orders --limit 20",
  ]);
}

export function printAuthHelp() {
  printCard("Auth Commands", [
    "auth setup                        Prompt for account address + agent key and overwrite the file",
    "auth setup --private-key 0x... --address 0x...",
    "auth status                       Show saved credential status",
    "auth clear                        Remove saved credentials",
    "auth help",
  ]);

  printCard("Auth Examples", [
    "node ./cli.mjs auth setup",
    "node ./cli.mjs auth setup --private-key 0x... --address 0x...",
    "node ./cli.mjs auth status",
    "node ./cli.mjs auth clear",
  ]);
}

// ------------- Structured Output Blocks -------------
export function printJsonBlock(title, value) {
  console.log();
  printCard(title, value);
}

// ------------- Market Summary Block -------------
export function printPriceSummary(symbol, ticker, bbo, oracle) {
  const mark = pickValue(ticker, [
    "markPrice",
    "mark_price",
    "mark",
    "lastPrice",
    "last_price",
    "price",
  ]);
  const bid = pickValue(bbo, [
    "bestBid",
    "best_bid",
    "best_bid_price",
    "bid",
    "bidPrice",
  ]);
  const ask = pickValue(bbo, [
    "bestAsk",
    "best_ask",
    "best_ask_price",
    "ask",
    "askPrice",
  ]);
  const oraclePrice = pickValue(oracle, [
    "price",
    "oraclePrice",
    "oracle_price",
    "indexPrice",
    "index_price",
  ]);
  const bidNumber = Number(bid);
  const askNumber = Number(ask);
  const spread =
    Number.isFinite(bidNumber) &&
    Number.isFinite(askNumber) &&
    bidNumber > 0 &&
    askNumber > 0
      ? askNumber - bidNumber
      : undefined;

  printCard("Price Snapshot", [
    `${chalk.dim("Symbol")}      ${symbol}`,
    `${chalk.dim("Mark")}        ${mark !== undefined ? String(mark) : chalk.yellow("n/a")}`,
    `${chalk.dim("Best Bid")}    ${bid !== undefined ? String(bid) : chalk.yellow("n/a")}`,
    `${chalk.dim("Best Ask")}    ${ask !== undefined ? String(ask) : chalk.yellow("n/a")}`,
    `${chalk.dim("Oracle")}      ${oraclePrice !== undefined ? String(oraclePrice) : chalk.yellow("n/a")}`,
    `${chalk.dim("Spread")}      ${spread !== undefined && Number.isFinite(spread) ? String(spread) : chalk.yellow("n/a")}`,
  ]);
}
