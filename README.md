# Hotstuff CLI

<p align="center">
  <img src="./assets/readme/hotstuff-hero.svg" alt="Hotstuff CLI animated banner" width="100%" />
</p>

<p align="center">
  SDK-powered market + trading CLI for Hotstuff.<br/>
  Built for fast terminal workflows with minimal setup.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/hotstuff-market-cli">
    <img src="https://img.shields.io/npm/v/hotstuff-market-cli?style=for-the-badge" alt="npm version" />
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-0f172a?style=for-the-badge&logo=node.js&logoColor=83cd29" alt="node >=18" />
  <img src="https://img.shields.io/badge/sdk-@hotstuff--labs/ts--sdk-0b253a?style=for-the-badge" alt="sdk" />
</p>

## Terminal Preview

<p align="center">
  <img src="./assets/readme/terminal-preview.svg" alt="Animated terminal preview for Hotstuff CLI" width="100%" />
</p>

## Features

- One-time API key setup (`hotstuff auth setup`)
- Market data commands for price discovery and monitoring
- Trade commands for place/cancel/order tracking
- Mainnet/testnet switching via env vars
- SDK-first architecture that is easy to extend

## Install

```bash
npm install -g hotstuff-market-cli
```

Aliases available after install:

- `hotstuff`
- `hotstuff-market`
- `cli`

## Quick Start

```bash
# 1) Configure API credentials once
hotstuff auth setup --private-key 0x...

# 2) Inspect market
hotstuff market price BTC

# 3) Place an order
hotstuff trade buy BTC 0.01 70000

# 4) Check account state
hotstuff trade orders --limit 20
hotstuff trade positions
```

## Commands

### Auth

```bash
hotstuff auth setup
hotstuff auth setup --private-key 0x...
hotstuff auth setup --private-key 0x... --address 0x...
hotstuff auth status
hotstuff auth clear
```

### Market

```bash
hotstuff market list [--type all|perps|spot]
hotstuff market price <SYMBOL>
hotstuff market tickers [--market perp|spot|all] [--limit N]
hotstuff market candles <SYMBOL> [--period SECONDS] [--from UNIX] [--to UNIX] [--type mark|ltp|index]
hotstuff market orderbook <SYMBOL> [--depth N]
hotstuff market instruments [perps|spot|all]
hotstuff market ticker <SYMBOL>
hotstuff market oracle <ASSET>
hotstuff market bbo <SYMBOL>
hotstuff market mids [SYMBOL|LIMIT|all]
hotstuff market trades <SYMBOL> [LIMIT]
hotstuff market chart <SYMBOL> <RES> <TYPE> <FROM_UNIX> <TO_UNIX>
```

### Trade

```bash
hotstuff trade buy <SYMBOL> <SIZE> <PRICE> [--position LONG|SHORT|BOTH] [--tif GTC|IOC|FOK] [--reduce-only] [--post-only] [--cloid ID] [--expires UNIX]
hotstuff trade sell <SYMBOL> <SIZE> <PRICE> [--position LONG|SHORT|BOTH] [--tif GTC|IOC|FOK] [--reduce-only] [--post-only] [--cloid ID] [--expires UNIX]
hotstuff trade cancel <SYMBOL> (--oid ORDER_ID | --cloid CLIENT_ID) [--expires UNIX]
hotstuff trade cancel-all [--expires UNIX]
hotstuff trade orders [--limit N] [--page N]
hotstuff trade positions
```

## Network Selection

Use testnet with either variable:

```bash
export HOTSTUFF_TESTNET=1
# or
export DATA_ENV=testnet
```

If neither is set, mainnet is used.

## Credential Storage

- File: `~/.hotstuff-cli/credentials.json`
- Saved by `hotstuff auth setup`
- Cleared with `hotstuff auth clear`

Security reminder:

- Never share private keys
- Use a dedicated API trading key where possible

## Local Development

```bash
npm install
npm link
hotstuff help
```

Useful scripts:

```bash
npm run cli -- help
npm run pack:check
```

## Project Structure

```text
cli.mjs        # CLI entrypoint + top-level routing
src/sdk.mjs    # standard client layer: HTTP/WS + info/exchange/explorer/subscriptions
src/market.mjs # market command handlers
src/auth.mjs   # one-time API wallet/private key setup
src/trade.mjs  # buy/sell/cancel/order commands
src/ui.mjs     # help/cards/structured output rendering
```

## Extending with New SDK Methods

### RPC methods (Info/Explorer/Exchange)

`src/sdk.mjs` uses a dynamic RPC proxy, so new SDK methods are callable directly without updating a local method list.

```js
import { createInfoClient, createExplorerClient } from "./src/sdk.mjs";

const info = createInfoClient();
const explorer = createExplorerClient();

await info.someNewMethod({ ...params });
await explorer.someExplorerMethod({ ...params });
```

### Subscription methods

Add a channel alias once in `SUBSCRIPTION_METHODS`:

```js
export const SUBSCRIPTION_METHODS = {
  ...,
  myFeed: {
    channel: "my_feed",
    normalize: (params = {}) => ({ ...params }),
  },
};
```

Then use it directly:

```js
const subscriptions = createSubscriptionClient();
await subscriptions.myFeed({ ...params }, (event) => {
  console.log(event.detail);
});
```
