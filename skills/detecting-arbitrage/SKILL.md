---
name: detecting-arbitrage
description: Identify cross-market and cross-instrument arbitrage opportunities using Hotstuff market data.
---

# Detecting Arbitrage

Use this skill to discover potentially profitable spreads before execution.

## Goal

- Track price differences between spot and perp markets.
- Detect temporary mispricings above a configured threshold.
- Output actionable opportunities with symbol, spread, and timestamp.

## Inputs

- Trading symbols (for example: `BTC`, `ETH`).
- Spread threshold (bps or percent).
- Optional polling interval.

## Workflow

1. Fetch latest market prices for spot and perp instruments.
2. Normalize prices and compute spread.
3. Filter opportunities where spread exceeds threshold.
4. Rank opportunities by expected edge.

## Output

- List of opportunities with:
- Symbol
- Spot price
- Perp price
- Spread percent
- Detection time

## Scripts

- Add reusable scanners under `scripts/`.
- Keep experimental logic in separate files to avoid breaking stable scanners.

## References

- Keep formulas, market-microstructure notes, and assumptions in `reference/`.
