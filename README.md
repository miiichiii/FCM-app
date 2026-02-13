# FCM-app

CellQuest-like browser MVP focused on:

- Manual compensation (i→j spillover subtract)
- Multiple simultaneous 2D plots
- Rectangle gating (propagates to all plots)
- Per-plot axis range + scale (linear / logicle-like / arcsinh)

This is intentionally **not** a FlowJo replacement.

## Setup

Requires Node.js (tested with Node v25).

```sh
npm install
npm run dev
```

Then open the URL printed by the dev server (default `http://127.0.0.1:5173`).

If you need a different port:

```sh
PORT=5174 npm run dev
```

## Usage

1.  **Drop an `.fcs` file** into the left “Data” panel (or click “Load demo dataset”).
2.  Use each plot’s **X/Y** selectors to change axes.
3.  Use **Scale** per plot:
    -   `linear`
    -   `logicle` (currently a safe symlog10 approximation)
    -   `arcsinh`
4.  Adjust **axis min/max** (leave blank for auto-range).
5.  **Gate Hierarchy**
    -   A tree of gated populations is shown in the left panel. Click a population to select it.
    -   To create a child gate, select a parent in the tree, click “New rectangle gate”, then **drag on the active plot**.
    -   Edit bounds numerically in the Gate panel for the selected gate.
    -   Click “Clear all” to remove all gates.
6.  **Manual compensation**
    -   Choose “From (i)” and “To (j)”, then move the slider to subtract `i → j`.
    -   The **Worst Pairs** panel shows a sorted list of the largest spillover values.
    -   “Reset pair” / “Reset all”
    -   “Save JSON” / “Load JSON” to persist coefficients
7.  **Full Data Processing**
    -   For large files, plots default to a high-performance **density** mode. Scatter plots will show a preview sample.
    -   Compensation and gating changes are applied to the preview in real-time.
    -   Click **Apply-to-all (Worker)** to process the entire dataset in the background. This updates density plots to reflect the full data.

## Tests

```sh
npm test
```

Includes minimal unit tests for:
- FCS header + preview read
- transforms (linear/arcsinh/logicle-like)
- compensation application math

## Known limitations

- `logicle` is currently implemented as a **symlog10 approximation** (monotone, negative-safe), not full Parks logicle.
- FCS parsing is **minimal** (common list-mode, `$DATATYPE` I/F/D); vendor edge cases may fail.
- Gates are **rectangle only** (no polygon gates).
