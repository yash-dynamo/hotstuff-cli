---
name: managing-risk
description: Enforce position sizing, exposure limits, and drawdown controls for Hotstuff trading.
---

# Managing Risk

Use this skill to define and enforce guardrails before and during trading.

## Goal

- Control maximum position and account exposure.
- Cap per-trade and daily losses.
- Trigger de-risking rules when thresholds are breached.

## Inputs

- Account equity
- Max risk per trade (percent or absolute)
- Max portfolio exposure
- Drawdown limits

## Workflow

1. Compute allowed position size from risk model.
2. Check exposure against current open positions/orders.
3. Approve, reduce, or reject proposed trade size.
4. Monitor running PnL and drawdown.
5. Trigger mitigation actions when limits are exceeded.

## Output

- Risk decision report:
- Proposed size
- Allowed size
- Exposure utilization
- Triggered rules (if any)

## References

- Keep policy documents, risk formulas, and threshold tables in `reference/`.
