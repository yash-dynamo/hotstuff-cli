#!/usr/bin/env node

import process from "node:process";
import chalk from "chalk";
import { executeCommand } from "./src/command-runner.mjs";
import { printHelp } from "./src/display.mjs";
import { runInteractiveMode } from "./src/interactive.mjs";
import { closeMcp, connectMcp } from "./src/mcp-client.mjs";

function normalizeEntryCommand(rawCommand) {
  const command = String(rawCommand ?? "").trim().toLowerCase();
  if (!command) {
    return "start";
  }
  if (["go", "cli", "hotstuff"].includes(command)) {
    return "start";
  }
  return command;
}

async function run() {
  const [commandRaw, ...args] = process.argv.slice(2);
  const command = normalizeEntryCommand(commandRaw);

  if (command === "start") {
    await runInteractiveMode();
    return;
  }

  if (command === "help") {
    printHelp();
    return;
  }

  let client;
  let transport;
  try {
    ({ client, transport } = await connectMcp());
    await executeCommand(client, command, args);
  } finally {
    await closeMcp(client, transport);
  }
}

run().catch((error) => {
  console.error(chalk.red(`\nError: ${error.message}`));
  process.exitCode = 1;
});
