# ACCEPTANCE_CHECKLIST

> Local verification done: `npm install`, `npm test`, `npm run dev` succeeded in host environment.

## A. Core
- [x] Browser app runs locally (`npm install && npm run dev`)
- [x] FCS drag & drop works
- [x] Event count + parameter list visible

## B. Plotting
- [x] 2+ 2D plots shown simultaneously
- [x] Per-plot X/Y selection works
- [x] Per-plot axis min/max works
- [x] Per-plot scale switch works (linear / logicle / arcsinh)

## C. Gating
- [x] Rectangle gate create/edit/delete
- [x] Gate reflects to other plots
- [x] Parent-child gate behavior is understandable (minimum 1-level)

## D. Compensation
- [x] NxN compensation matrix model exists
- [x] i→j coefficient slider updates preview immediately
- [x] Reset to original matrix works
- [x] Save/Load compensation JSON works

## E. Performance
- [x] 10k preview is responsive
- [x] Apply-to-all runs async (Worker) with progress UI
- [x] 1M handling avoids freeze (density mode + warning for scatter)

## F. UX / Safety
- [x] “Worst pairs” panel available
- [x] Manual compensation is primary (no forced auto-flatten)
- [x] UI flow is clear: drop → plots → gate → compensation → apply

## G. Docs / Delivery
- [x] README has setup + usage + limitations
- [x] Minimal tests exist (matrix apply + transforms + FCS header parse)
- [ ] No P0/P1 issues left after critic review
