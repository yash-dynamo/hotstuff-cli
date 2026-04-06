import { existsSync } from "node:fs";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SERVER_PATH } from "./constants.mjs";

function envToStringRecord(rawEnv = process.env) {
  const out = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractToolPayload(result) {
  if (result && typeof result === "object" && "toolResult" in result) {
    return result.toolResult;
  }

  if (result && typeof result === "object" && "structuredContent" in result) {
    if (result.structuredContent !== undefined) {
      return result.structuredContent;
    }
  }

  if (result && typeof result === "object" && Array.isArray(result.content)) {
    const textParts = result.content
      .filter((item) => item && item.type === "text")
      .map((item) => item.text)
      .filter(Boolean);

    if (textParts.length === 1) {
      return parseMaybeJson(textParts[0]) ?? textParts[0];
    }
    if (textParts.length > 1) {
      return textParts.map((text) => parseMaybeJson(text) ?? text);
    }
  }

  return result;
}

function extractErrorMessage(result) {
  const payload = extractToolPayload(result);
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload, null, 2);
}

export async function connectMcp() {
  if (!existsSync(SERVER_PATH)) {
    throw new Error(
      `MCP server entry not found at ${SERVER_PATH}. Run npm install first.`,
    );
  }

  const client = new Client({
    name: "hotstuff-market-cli",
    version: "1.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    env: envToStringRecord(),
    stderr: process.env.DEBUG_MCP_CLI ? "inherit" : "pipe",
  });

  await client.connect(transport);
  return { client, transport };
}

export async function closeMcp(client, transport) {
  await Promise.allSettled([client?.close?.(), transport?.close?.()]);
}

export async function callTool(client, name, args = {}) {
  const result = await client.callTool({
    name,
    arguments: args,
  });

  if (result && typeof result === "object" && result.isError) {
    throw new Error(extractErrorMessage(result));
  }

  return extractToolPayload(result);
}
