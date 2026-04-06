import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_PATH = path.resolve(
  __dirname,
  "../node_modules/@yash-dynamo/mcp11/dist/index.js",
);

export const PUBLIC_MARKET_TOOLS = [
  "get_instruments",
  "get_supported_collateral",
  "get_oracle_price",
  "get_ticker",
  "get_orderbook",
  "get_recent_trades",
  "get_mid_prices",
  "get_best_bid_offer",
  "get_chart",
];

export const DIRECT_COMMANDS = [
  "tools",
  "price",
  "instruments",
  "ticker",
  "oracle",
  "mids",
  "bbo",
  "orderbook",
  "trades",
  "chart",
  "call",
];
