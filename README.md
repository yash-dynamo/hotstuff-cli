# Hotstuff Market CLI

Simple SDK-powered CLI for Hotstuff market data and order execution.

## Run

```bash
npm i -g hotstuff-market-cli
hotstuff help
hotstuff market list
```

## Local Dev

```bash
npm install
npm link
hotstuff help
```

## Project Structure

```text
cli.mjs        # CLI entrypoint + top-level routing
src/sdk.mjs    # Standard client layer: HTTP/WS transport + info/exchange/explorer/subscriptions
src/market.mjs # market command handlers + argument parsing
src/auth.mjs   # one-time API wallet/private key setup
src/trade.mjs  # buy/sell/cancel/order commands
src/ui.mjs     # help/cards/structured output rendering
```

## Commands

```bash
# trading
hotstuff auth setup
hotstuff auth setup --private-key 0x...
hotstuff trade buy BTC 0.01 70000
hotstuff trade sell BTC 0.01 71000
hotstuff trade cancel BTC --oid 123456
hotstuff trade cancel-all
hotstuff trade orders --limit 20

# market data
hotstuff market list --type perps
hotstuff market price BTC
hotstuff market tickers --market perp --limit 10
hotstuff market candles BTC --period 3600 --type mark
hotstuff market orderbook BTC --depth 20
hotstuff market chart BTC-PERP 60 mark 1710000000 1710086400
```

## Extending RPC Methods

`src/sdk.mjs` uses a dynamic RPC proxy. New methods are auto-available on all RPC clients:

```js
const info = createInfoClient();
const explorer = createExplorerClient();

await info.someNewMethod({ ...params });
await explorer.someExplorerMethod({ ...params });
```

No method list update is required.

## Extending Subscription Methods

`createSubscriptionClient()` uses `SUBSCRIPTION_METHODS` as a registry.
To add a new alias/channel, append one map entry in `src/sdk.mjs`:

```js
export const SUBSCRIPTION_METHODS = {
  ...,
  myNewFeed: {
    channel: "my_new_feed",
    normalize: (params = {}) => ({ ...params }),
  },
};
```

Then call it directly:

```js
const subscriptions = createSubscriptionClient();
await subscriptions.myNewFeed({ ...params }, (event) => {
  console.log(event.detail);
});
```
