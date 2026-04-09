---
name: executing-trades
description: Execute and manage orders safely through the Hotstuff CLI and SDK.
---

# Executing Trades

Use this skill to place, amend, and cancel orders with clear execution rules.

## Goal

- Convert trade intent into validated order parameters.
- Send orders with correct side, size, price, and safeguards.
- Track execution outcomes and handle failures cleanly.

## Inputs

- Symbol
- Side (`buy` or `sell`)
- Size
- Optional limit price
- Optional execution constraints (`tif`, `post-only`, `reduce-only`)

## Workflow

1. Validate symbol, side, and numeric values.
2. Check latest market context (ticker, spread, liquidity).
3. Build final order payload with risk flags.
4. Submit order and parse response.
5. Log success/failure with order identifiers.

## Output

- Order submission summary:
- Symbol
- Side
- Size
- Price
- Order ID or client order ID
- Status and any error message

## Scripts

- Put order execution helpers under `scripts/`.
- Keep one script per workflow (place, cancel, bulk-cancel, reconcile).
