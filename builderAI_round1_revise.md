# BuilderAI Round 1 Revise

Date: 2026-04-03

## Changes Implemented
1. Compensation updates are now transactional
   - Invalid singular matrices are rejected without mutating the previous valid state.
   - Added regression coverage for rejected singular updates.

2. Compensation math is unified across preview, full apply, and single-stain review
   - Shared matrix-transform helpers now drive all three paths.

3. Session export/import was added
   - Export/import now captures dataset identity, compensation, plots, gates, and single-stain assignments.
   - Dataset signatures include `sha256` when available.

4. Exact gate statistics were added
   - After `Apply-to-all`, exact gate count, `%parent`, and `%total` can be refreshed and exported as CSV.

5. Scale labeling was corrected
   - UI/README now describe the non-arcsinh nonlinear option as `Symlog (approx)` instead of claiming full logicle fidelity.

## Verification
- `npm test` passed after the changes
- New tests cover:
  - singular compensation rejection
  - session export/import round-trip
  - gate stats hierarchy/count/% behavior

## Known Residual Limits
- No polygon gate
- No per-gate fluorescence summary table yet
- Approximate symlog remains available, but it is now labeled honestly
