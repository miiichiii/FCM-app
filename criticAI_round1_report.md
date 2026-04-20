# CriticAI Round 1 Report

Date: 2026-04-03
Scope: publication-oriented review for flow cytometry analysis in the current repo state before builder fixes

## Verdict
- Status: not acceptable for manuscript-facing use yet
- Reason: there are still P0/P1 issues in compensation safety, reproducibility, and result export

## Findings

### P0
1. Singular compensation matrices can corrupt interactive analysis flow
   - Evidence: [web/src/modules/compMath.js](/Users/michito/Documents/GitHub/FCM-app/web/src/modules/compMath.js) throws on singular inversion, while interactive compensation updates in [web/src/main.js](/Users/michito/Documents/GitHub/FCM-app/web/src/main.js) did not guard and rollback consistently.
   - Research impact: a user can dial an invalid pair and break compensation state during a live analysis session.
   - Required fix: transactional coefficient updates with rejection and unchanged previous valid state.

### P1
1. Reproducibility/session capture is incomplete
   - Evidence: only compensation autosave existed via [web/src/modules/compStore.js](/Users/michito/Documents/GitHub/FCM-app/web/src/modules/compStore.js); plots, gates, and single-stain assignments were not exportable as one session.
   - Research impact: figures and gate hierarchies cannot be reproduced from an audit artifact.
   - Required fix: session JSON export/import with dataset identity checks.

2. Exact gate statistics and export are missing
   - Evidence: gate creation/editing exists in [web/src/modules/gate.js](/Users/michito/Documents/GitHub/FCM-app/web/src/modules/gate.js), but no exact count/% table or CSV export path existed.
   - Research impact: manuscript tables still require another tool or manual recounting.
   - Required fix: compute exact counts from full compensated data after Apply-to-all and export CSV.

3. Scale labeling overstates what the app provides
   - Evidence: [web/src/modules/transforms.js](/Users/michito/Documents/GitHub/FCM-app/web/src/modules/transforms.js) implements a symlog-style approximation, but the UI/README exposed it as logicle.
   - Research impact: users may assume exact cross-tool equivalence where none exists.
   - Required fix: relabel clearly as approximate and steer publication-sensitive work to arcsinh unless externally validated.

## Exit Criteria For Next Round
- No remaining P0
- No remaining P1 in safety, reproducibility, or exact count/% export
- Tests updated to lock the new guarantees
