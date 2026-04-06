import process from "node:process";
import chalk from "chalk";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hh >= 0 && hh < 1) {
    r = c;
    g = x;
  } else if (hh >= 1 && hh < 2) {
    r = x;
    g = c;
  } else if (hh >= 2 && hh < 3) {
    g = c;
    b = x;
  } else if (hh >= 3 && hh < 4) {
    g = x;
    b = c;
  } else if (hh >= 4 && hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const m = v - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rainbowText(text, startHue = 0) {
  return String(text)
    .split("")
    .map((char, index) => {
      const hue = (startHue + index * 16) % 360;
      const { r, g, b } = hsvToRgb(hue, 0.9, 1);
      return chalk.rgb(r, g, b)(char);
    })
    .join("");
}

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
  const borderColor = options.borderColor ?? ((text) => chalk.cyan(text));
  const titleStyle = options.titleStyle ?? ((text) => chalk.bold.cyan(text));

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

export function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1Bc");
  }
}

export function printCard(title, value, options = {}) {
  console.log(buildBox(title, toLines(value), options));
}

export function printAppHeader() {
  printCard(rainbowText("HOTSTUFF MARKET APP"), [
    chalk.magentaBright("Step-by-step market toolkit over MCP"),
    chalk.cyanBright("Pick function -> Fill inputs -> Get clean results"),
    chalk.gray("Neon CLI mode enabled"),
  ], {
    borderColor: (text) => rainbowText(text, 120),
    titleStyle: (text) => chalk.bold.white(text),
  });
}

export function printStep(step, label) {
  console.log(
    chalk.bold(
      `\n${rainbowText("●")} ${chalk.magentaBright("Step")} ${chalk.cyanBright(step)} ${chalk.gray("→")} ${chalk.yellowBright(label)}`,
    ),
  );
}

export function printHelp() {
  console.log(chalk.bold(rainbowText("HOTSTUFF MARKET CLI")));
  console.log(chalk.gray("Public market prices over your local MCP server\n"));
  printCard("Usage", [
    chalk.cyan("hotstuff <command> [args]"),
    chalk.cyan("hotstuff-market <command> [args]"),
    chalk.cyan("cli <command> [args]"),
  ], {
    borderColor: (text) => chalk.magentaBright(text),
    titleStyle: (text) => chalk.magentaBright.bold(text),
  });

  printCard("Commands", [
    "start                             Interactive mode (rainbow UI)",
    "tools                             List available public market tools",
    "price <SYMBOL>                    Price flow (ticker + BBO + oracle)",
    "instruments [perps|spot|all]      List instruments",
    "ticker <SYMBOL>                   Get ticker",
    "oracle <ASSET>                    Get oracle/index price",
    "mids                              Get all mid prices",
    "bbo <SYMBOL>                      Get best bid/offer",
    "orderbook <SYMBOL> [DEPTH]        Get orderbook",
    "trades <SYMBOL> [LIMIT]           Get recent trades",
    "chart <SYMBOL> <RES> <TYPE> <FROM> <TO>  Get OHLCV chart",
    "call <TOOL_NAME> [JSON_ARGS]      Call any MCP tool (advanced)",
    "help                              Show help",
  ], {
    borderColor: (text) => chalk.cyanBright(text),
    titleStyle: (text) => chalk.cyanBright.bold(text),
  });

  printCard("Examples", [
    "hotstuff",
    "cli price BTC-PERP",
    "cli mids",
    "cli call get_ticker '{\"symbol\":\"ETH-PERP\"}'",
  ], {
    borderColor: (text) => chalk.greenBright(text),
    titleStyle: (text) => chalk.greenBright.bold(text),
  });
}

export function printJsonBlock(title, value) {
  console.log();
  printCard(title, value);
}

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
    `${chalk.gray("Symbol")}      ${chalk.white(symbol)}`,
    `${chalk.gray("Mark")}        ${mark !== undefined ? chalk.white(mark) : chalk.yellow("n/a")}`,
    `${chalk.gray("Best Bid")}    ${bid !== undefined ? chalk.white(bid) : chalk.yellow("n/a")}`,
    `${chalk.gray("Best Ask")}    ${ask !== undefined ? chalk.white(ask) : chalk.yellow("n/a")}`,
    `${chalk.gray("Oracle")}      ${oraclePrice !== undefined ? chalk.white(oraclePrice) : chalk.yellow("n/a")}`,
    `${chalk.gray("Spread")}      ${spread !== undefined && Number.isFinite(spread) ? chalk.white(spread) : chalk.yellow("n/a")}`,
  ]);
}

export async function playStartupAnimation() {
  const total = 24;

  if (!process.stdout.isTTY) {
    console.log(chalk.bold(rainbowText("Starting Hotstuff Market CLI...")));
    return;
  }

  for (let i = 0; i <= total; i += 1) {
    const filled = "■".repeat(i);
    const empty = "·".repeat(total - i);
    const label = chalk.bold(rainbowText("Launching"));
    process.stdout.write(
      `\r${label} ${rainbowText(filled, i * 8)}${chalk.gray(empty)} ${chalk.magentaBright(`${Math.round((i / total) * 100)}%`)}`,
    );
    await sleep(40);
  }
  process.stdout.write("\n");
}

export function printStartMenu() {
  printCard("Interactive Options", [
    "1) Price snapshot",
    "2) Ticker",
    "3) Mid prices",
    "4) Best bid / offer",
    "5) Orderbook",
    "6) Recent trades",
    "7) Instruments",
    "8) List tools",
    "9) Help",
    "0) Exit",
  ], {
    borderColor: (text) => chalk.yellowBright(text),
    titleStyle: (text) => chalk.yellowBright.bold(text),
  });
}
