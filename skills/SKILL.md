---
name: hotstuff
description: Trade and monitor Hotstuff spot/perp markets from the terminal using the official TypeScript SDK-backed CLI.

requires:
  bins:
    - hotstuff
  env:
    - HOTSTUFF_TESTNET
    - DATA_ENV

install:
  - npm install -g hotstuff-market-cli

config:
  stateDirs:
    - ~/.hotstuff-cli
---

# Hotstuff CLI Skill

Trade and monitor Hotstuff markets from the terminal with a simple auth flow:

1. Set API private key once
2. Run trading and market commands directly

This CLI uses the official `@hotstuff-labs/ts-sdk` under the hood.

## What This Skill Does

- Place and cancel orders (`buy`, `sell`, `cancel`, `cancel-all`)
- Track open orders and positions
- Read market data (price, tickers, candles, orderbook, trades, chart, oracle, bbo, mids)
- Keep setup minimal: one-time credential save via `hotstuff auth setup`
- Stay extensible: SDK client layer supports adding new methods with minimal CLI changes

## Setup Instructions

### 1. Check if CLI is installed

```bash
which hotstuff
```

If not found:

```bash
npm install -g hotstuff-market-cli
```

### 2. Verify installation

```bash
hotstuff help
```

### 3. Configure trading credentials (one time)

Interactive:

```bash
hotstuff auth setup
```

Non-interactive:

```bash
hotstuff auth setup --private-key 0x...
```

Optional explicit address (validated against key):

```bash
hotstuff auth setup --private-key 0x... --address 0x...
```

Credentials are stored at:

```bash
~/.hotstuff-cli/credentials.json
```

## Network Selection

Use testnet with either environment variable:

```bash
export HOTSTUFF_TESTNET=1
# or
export DATA_ENV=testnet
```

If neither is set, mainnet is used.

## Quick Command Reference

### Auth

```bash
hotstuff auth setup
hotstuff auth setup --private-key 0x...
hotstuff auth status
hotstuff auth clear
```

### Market Data

```bash
hotstuff market list --type perps
hotstuff market price BTC
hotstuff market tickers --market perp --limit 10
hotstuff market candles BTC --period 3600 --type mark
hotstuff market orderbook BTC --depth 20
hotstuff market instruments all
hotstuff market ticker BTC
hotstuff market oracle BTC
hotstuff market bbo BTC
hotstuff market mids
hotstuff market trades BTC 20
hotstuff market chart BTC-PERP 60 mark 1710000000 1710086400
```

### Trading

```bash
hotstuff trade buy BTC 0.01 70000
hotstuff trade sell BTC 0.01 71000
hotstuff trade buy BTC 0.01 70000 --position BOTH --tif GTC --cloid cli-1
hotstuff trade sell BTC 0.01 71000 --reduce-only --post-only
hotstuff trade cancel BTC --oid 123456
hotstuff trade cancel BTC --cloid cli-1
hotstuff trade cancel-all
hotstuff trade orders --limit 20 --page 1
hotstuff trade positions
```

## Common Workflows

### One-time setup, then trade

```bash
hotstuff auth setup --private-key 0x...
hotstuff trade buy BTC 0.01 70000
```

### Check open risk

```bash
hotstuff trade positions
hotstuff trade orders --limit 50
```

### Cancel stale orders

```bash
hotstuff trade cancel BTC --oid 123456
hotstuff trade cancel-all
```

## Extending with New SDK Methods

This CLI is designed so SDK growth does not require rewriting large parts of the CLI.

### RPC methods (Info/Explorer/Exchange)

`src/sdk.mjs` uses a dynamic RPC proxy. If the SDK adds a new method, call it directly:

```js
import { createInfoClient } from "../src/sdk.mjs";

const info = createInfoClient();
const result = await info.newMethod({ ...params });
```

No static method list is required in the client layer.

### Subscription methods

To add a new subscription alias/channel, append one entry in `SUBSCRIPTION_METHODS` in `src/sdk.mjs`:

```js
myFeed: {
  channel: "my_feed",
  normalize: (params = {}) => ({ ...params }),
}
```

Then call it directly from the subscription client:

```js
const subscriptions = createSubscriptionClient();
await subscriptions.myFeed({ ...params }, (event) => {
  console.log(event.detail);
});
```

## Security Notes

- Do not share private keys.
- Prefer one dedicated API trading key over a primary wallet key.
- Clear saved credentials when rotating keys:

```bash
hotstuff auth clear
```
