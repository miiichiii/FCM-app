# BuilderAI Round 2 Revise

Date: 2026-04-03

## Change Implemented
1. Single-stain identity now uses `sha256` when available
   - `createSingleStainRecord` stores `sha256`
   - session export/import stores and matches single-stain controls by `sha256` before falling back to file name
   - reload carryover for manual assignments also prefers `sha256`

## Verification
- Added regression test for single-stain session restore across a renamed file with the same `sha256`
- `npm test` passed after the fix
