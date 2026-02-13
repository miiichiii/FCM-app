# RISK_REGISTER

## High
1. FCS parser compatibility variance (FCS 2.0/3.0/3.1 vendor differences)
   - Mitigation: start with common FCS 3.x path, robust error messages, fallback parser strategy.
2. 1M point rendering freeze risk
   - Mitigation: density mode default for large N, Worker compute, progressive rendering.
3. logicle transform instability near zero/negative
   - Mitigation: tested implementation with guard rails; fallback to arcsinh when unstable.

## Medium
1. Gate propagation confusion across plots
   - Mitigation: clear active-gate indicator + parent chain display.
2. Compensation UX mistakes (wrong i→j)
   - Mitigation: pair highlighting + reset/undo checkpoints.

## Low
1. Over-scoping beyond CellQuest-like MVP
   - Mitigation: strict DoD + no scope expansion in loop.
