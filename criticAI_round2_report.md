# CriticAI Round 2 Report

Date: 2026-04-03
Scope: re-review after builder fixes in round 1

## Verdict
- Status: not yet satisfied
- Standard used for satisfaction: no remaining P0/P1 issues for the current manuscript-oriented workflow

## Re-check Summary
1. Compensation safety
   - Fixed: singular matrix attempts are rejected without corrupting prior valid state.

2. Reproducibility
   - Fixed: session JSON now preserves compensation, plots, gates, and single-stain assignments with dataset signature checks.

3. Exact gate statistics
   - Fixed: exact gate count/% now come from full compensated data after `Apply-to-all`, with CSV export.

4. Scale truthfulness
   - Fixed enough for current scope: the approximate nonlinear option is labeled as `Symlog (approx)` instead of being presented as exact logicle.

## Remaining P1
1. Single-stain session restore still keys off `fileName` only.
   - Impact: same-name files or renamed controls can be restored onto the wrong single-stain sample.
   - Required fix: store and match single-stain `sha256` during session export/import and reload carryover.

## Conclusion
- P0 is closed, but one reproducibility P1 remains.
- Another builder pass is required before final acceptance.
