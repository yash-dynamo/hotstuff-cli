---
name: analyzing-trades
description: Analyze fills, PnL, win-rate, and execution quality to improve strategy performance.
---

# Analyzing Trades

Use this skill to measure trading performance and identify strategy improvements.

## Goal

- Aggregate trade history and compute key performance metrics.
- Evaluate quality of entries, exits, and execution timing.
- Surface repeatable strengths and failure patterns.

## Inputs

- Filled orders/trade history
- Position snapshots
- Fees and funding data
- Time window for analysis

## Workflow

1. Load historical trades and normalize fields.
2. Compute core metrics (PnL, win rate, average R, drawdown).
3. Segment by symbol, side, session, or strategy tag.
4. Highlight outliers and recurring patterns.
5. Produce recommendations for next iteration.

## Output

- Analysis report containing:
- Net and gross PnL
- Win/loss statistics
- Cost breakdown
- Segment-level insights
- Actionable recommendations

## Scripts

- Place analytics pipelines and report generators under `scripts/`.
