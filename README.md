# Hotstuff Market CLI

Simple CLI on top of your local MCP server (`@yash-dynamo/mcp11`) for public market data.

## Run

```bash
npm i -g hotstuff-market-cli
hotstuff
```

## Local Dev

```bash
npm install
npm link
hotstuff
```

No `npm run cli --` required. Once linked, you can launch with:
- `hotstuff` (starts interactive mode)
- `go` (starts interactive mode)
- `start` (starts interactive mode)
- `cli` (starts interactive mode)

## Project structure

```text
cli.mjs                  # thin entrypoint
src/constants.mjs        # server path + command/tool constants
src/mcp-client.mjs       # MCP connect/call/close helpers
src/command-runner.mjs   # all command implementations
src/display.mjs          # help/menu/animation/output formatting
src/interactive.mjs      # start mode, menu, natural text parsing
```

## Interactive mode

```bash
hotstuff
# or:
go
# or:
start
# or:
cli
```

Interactive mode is now guided step-by-step:
- select a function from a visual list
- fill each required input in sequence
- view formatted output cards
- choose whether to run another function

You can also pick **Talk Naturally** and type:
- `show price btc`
- `recent trades eth 5`
- `orderbook btc 10`

## Common commands

```bash
cli tools
cli price BTC-PERP
cli ticker ETH-PERP
cli mids
cli orderbook BTC-PERP 20
cli trades BTC-PERP 50
```

## Advanced

Call any tool directly:

```bash
cli call get_ticker '{"symbol":"ETH-PERP"}'
```
