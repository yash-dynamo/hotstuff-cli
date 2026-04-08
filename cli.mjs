#!/usr/bin/env node

// ------------- Imports -------------
import process from "node:process";
import { printHelp } from "./src/ui.mjs";
import { runMarket } from "./src/market.mjs";
import { createInfoClient } from "./src/sdk.mjs";
import { runTrade } from "./src/trade.mjs";
import { runAuth } from "./src/auth.mjs";

// ------------- Helpers -------------
function isHelpArg(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "help" || text === "--help" || text === "-h";
}

// ------------- Entrypoint -------------
async function run() {
  const argv = process.argv.slice(2);
  const [commandRaw, ...rest] = argv;
  const command = String(commandRaw ?? "").trim().toLowerCase();

  if (!command || isHelpArg(command)) {
    printHelp();
    return;
  }

  if (command === "market") {
    const info = createInfoClient();
    await runMarket(info, rest);
    return;
  }

  if (command === "trade") {
    await runTrade(rest);
    return;
  }

  if (command === "auth") {
    await runAuth(rest);
    return;
  }

  throw new Error(`Unknown command "${command}". Try: hotstuff help`);
}

// ------------- Execute -------------
run().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
