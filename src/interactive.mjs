import { confirm, input, select } from "@inquirer/prompts";
import process from "node:process";
import { executeCommand, normalizeMarketSymbol } from "./command-runner.mjs";
import {
  clearScreen,
  printAppHeader,
  printCard,
  printHelp,
  printStep,
  playStartupAnimation,
} from "./display.mjs";
import { closeMcp, connectMcp } from "./mcp-client.mjs";

const ACTIONS = [
  { name: "Price Snapshot", value: "price" },
  { name: "Ticker", value: "ticker" },
  { name: "Mid Prices", value: "mids" },
  { name: "Best Bid / Offer", value: "bbo" },
  { name: "Orderbook", value: "orderbook" },
  { name: "Recent Trades", value: "trades" },
  { name: "Instruments", value: "instruments" },
  { name: "Oracle", value: "oracle" },
  { name: "Chart (OHLCV)", value: "chart" },
  { name: "List Tools", value: "tools" },
  { name: "Talk Naturally", value: "natural" },
  { name: "Help", value: "help" },
  { name: "Exit", value: "exit" },
];

function promptCancelled(error) {
  const text = String(error?.message || "").toLowerCase();
  return text.includes("force closed") || text.includes("sigint");
}

function parseNaturalText(raw) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const numbers = words.filter((item) => /^\d+$/.test(item));

  const token = words
    .map((word) => word.replace(/[^a-zA-Z0-9/_-]/g, ""))
    .find((word) => {
      const stop = new Set([
        "show",
        "get",
        "give",
        "me",
        "the",
        "for",
        "price",
        "ticker",
        "orderbook",
        "trades",
        "recent",
        "best",
        "bid",
        "offer",
        "oracle",
        "mids",
        "mid",
        "instruments",
      ]);
      return word && !stop.has(word.toLowerCase());
    }) || "";

  if (lower.includes("price")) {
    return { command: "price", args: [normalizeMarketSymbol(token)] };
  }
  if (lower.includes("ticker")) {
    return { command: "ticker", args: [normalizeMarketSymbol(token)] };
  }
  if (lower.includes("mids")) {
    return { command: "mids", args: token ? [normalizeMarketSymbol(token)] : [] };
  }
  if (lower.includes("orderbook")) {
    return {
      command: "orderbook",
      args: [normalizeMarketSymbol(token), numbers[0]].filter(Boolean),
    };
  }
  if (lower.includes("trade")) {
    return {
      command: "trades",
      args: [normalizeMarketSymbol(token), numbers[0]].filter(Boolean),
    };
  }
  if (lower.includes("bbo") || (lower.includes("best") && lower.includes("bid"))) {
    return { command: "bbo", args: [normalizeMarketSymbol(token)] };
  }
  if (lower.includes("oracle")) {
    return { command: "oracle", args: [token.toUpperCase()] };
  }
  if (lower.includes("instrument")) {
    return { command: "instruments", args: ["all"] };
  }
  if (lower.includes("tool")) {
    return { command: "tools", args: [] };
  }
  return null;
}

async function askSymbol(message = "Enter market symbol", defaultValue = "BTC") {
  printStep(1, "Input");
  const raw = await input({
    message: `${message} (e.g. BTC or BTC-PERP)`,
    default: defaultValue,
  });
  return normalizeMarketSymbol(raw);
}

async function runAction(client, action) {
  if (action === "price") {
    const symbol = await askSymbol("Which market do you want price for?");
    printStep(2, "Output");
    await executeCommand(client, "price", [symbol]);
    return;
  }

  if (action === "ticker") {
    const symbol = await askSymbol("Which market do you want ticker for?");
    printStep(2, "Output");
    await executeCommand(client, "ticker", [symbol]);
    return;
  }

  if (action === "mids") {
    printStep(1, "Input");
    const mode = await select({
      message: "How do you want mid prices?",
      choices: [
        { name: "Single market", value: "single" },
        { name: "Top N markets", value: "top" },
      ],
    });

    if (mode === "single") {
      const symbol = await askSymbol("Market for mid price", "BTC");
      printStep(2, "Output");
      await executeCommand(client, "mids", [symbol]);
      return;
    }

    const count = await input({
      message: "How many markets?",
      default: "10",
      validate(value) {
        const num = Number(value);
        if (!Number.isInteger(num) || num <= 0) {
          return "Enter a positive integer.";
        }
        return true;
      },
    });
    printStep(2, "Output");
    await executeCommand(client, "mids", [count]);
    return;
  }

  if (action === "bbo") {
    const symbol = await askSymbol("Which market do you want best bid/offer for?");
    printStep(2, "Output");
    await executeCommand(client, "bbo", [symbol]);
    return;
  }

  if (action === "orderbook") {
    const symbol = await askSymbol("Which market do you want orderbook for?");
    printStep(2, "Input");
    const depth = await input({
      message: "Depth (optional, press Enter to skip)",
      default: "",
      validate(value) {
        if (!value.trim()) {
          return true;
        }
        const num = Number(value);
        if (!Number.isInteger(num) || num <= 0) {
          return "Depth must be a positive integer.";
        }
        return true;
      },
    });

    printStep(3, "Output");
    await executeCommand(client, "orderbook", [symbol, depth.trim()].filter(Boolean));
    return;
  }

  if (action === "trades") {
    const symbol = await askSymbol("Which market do you want recent trades for?");
    printStep(2, "Input");
    const limit = await input({
      message: "Limit (optional, press Enter to skip)",
      default: "",
      validate(value) {
        if (!value.trim()) {
          return true;
        }
        const num = Number(value);
        if (!Number.isInteger(num) || num <= 0) {
          return "Limit must be a positive integer.";
        }
        return true;
      },
    });
    printStep(3, "Output");
    await executeCommand(client, "trades", [symbol, limit.trim()].filter(Boolean));
    return;
  }

  if (action === "instruments") {
    printStep(1, "Input");
    const type = await select({
      message: "Which instruments do you want?",
      choices: [
        { name: "All", value: "all" },
        { name: "Perps", value: "perps" },
        { name: "Spot", value: "spot" },
      ],
    });
    printStep(2, "Output");
    await executeCommand(client, "instruments", [type]);
    return;
  }

  if (action === "oracle") {
    printStep(1, "Input");
    const asset = await input({
      message: "Enter asset symbol (e.g. BTC, ETH)",
      default: "BTC",
    });
    printStep(2, "Output");
    await executeCommand(client, "oracle", [asset.toUpperCase()]);
    return;
  }

  if (action === "chart") {
    printStep(1, "Input");
    const symbol = await askSymbol("Which market for chart?", "BTC");
    const resolution = await select({
      message: "Resolution",
      choices: ["1", "5", "15", "60", "240", "1D", "1W"].map((item) => ({
        name: item,
        value: item,
      })),
    });
    const chartType = await select({
      message: "Chart type",
      choices: ["mark", "ltp", "index"].map((item) => ({
        name: item,
        value: item,
      })),
    });

    const now = Math.floor(Date.now() / 1000);
    const fromDefault = String(now - 86400);
    const toDefault = String(now);
    const from = await input({
      message: "From (unix seconds)",
      default: fromDefault,
    });
    const to = await input({
      message: "To (unix seconds)",
      default: toDefault,
    });

    printStep(2, "Output");
    await executeCommand(client, "chart", [symbol, resolution, chartType, from, to]);
    return;
  }

  if (action === "tools") {
    printStep(1, "Output");
    await executeCommand(client, "tools", []);
    return;
  }

  if (action === "help") {
    printStep(1, "Output");
    printHelp();
    return;
  }

  if (action === "natural") {
    printStep(1, "Input");
    const text = await input({
      message: "Tell me what you want (e.g. 'show price btc' or 'recent trades eth 5')",
    });
    const parsed = parseNaturalText(text);
    if (!parsed) {
      printCard("Could not parse", "Try: price btc, ticker eth, orderbook btc 10");
      return;
    }
    printStep(2, "Output");
    await executeCommand(client, parsed.command, parsed.args);
  }
}

export async function runInteractiveMode() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printCard(
      "Interactive Mode",
      "Interactive UI needs a TTY terminal. Run this directly in your terminal.",
    );
    return;
  }

  await playStartupAnimation();

  let client;
  let transport;

  try {
    ({ client, transport } = await connectMcp());

    let running = true;
    while (running) {
      clearScreen();
      printAppHeader();

      const action = await select({
        message: "Choose a function",
        choices: ACTIONS,
      });

      if (action === "exit") {
        break;
      }

      clearScreen();
      printAppHeader();
      try {
        await runAction(client, action);
      } catch (error) {
        printCard("Error", error?.message || String(error));
      }

      running = await confirm({
        message: "Do you want to run another function?",
        default: true,
      });
    }

    printCard("Session Ended", "Thanks. You can run `npm run cli -- start` again.");
  } catch (error) {
    if (promptCancelled(error)) {
      printCard("Session Ended", "Prompt cancelled.");
      return;
    }
    throw error;
  } finally {
    await closeMcp(client, transport);
  }
}
