# FCM-app User Guide

A lightweight, browser-based Flow Cytometry analysis tool focused on **manual compensation**, **multiple 2D plots**, and **hierarchical gating**.

👉 **Launch App:** [https://miiichiii.github.io/FCM-app/](https://miiichiii.github.io/FCM-app/)

## Key Features

### 1. 📂 Drag & Drop Import
- Simply drop your `.fcs` file into the left **Data** panel.
- No server upload required (data stays in your browser).
- Supports standard FCS 3.0/3.1 files.

### 2. 📊 Multi-Plot Analysis
- Click **"Add plot"** to create as many 2D plots as you need.
- Customizable for each plot:
  - **X / Y Parameters**: Select any channel.
  - **Scale**: `Linear`, `Logicle` (best for fluorescence), or `Arcsinh`.
  - **Axis Range**: Auto-scales by default; enter numbers to fix min/max.
  - **Type**: Automatically switches to **Density** (heatmap) for large datasets (>500k events).

### 3. 🛡️ Hierarchical Gating
- **Create Gate**: Select a population in the **Gate Hierarchy** tree (left panel), click **"New rectangle gate"**, then drag a box on the active plot.
- **Parent/Child**: Gates are nested. A child gate only shows events that passed the parent gate.
- **Edit**: Drag the gate corners (future) or type exact values in the sidebar.

### 4. 🎛️ Manual Compensation
- Classic `i -> j` spillover subtraction.
- **Sliders**: Adjust coefficients in real-time.
- **Worst Pairs**: Automatically identifies channel pairs with the highest potential overlap to help you focus.
- **Save/Load**: Export your compensation matrix as JSON to reuse later.

### 5. 🚀 High Performance
- **Preview Mode**: Fast interaction using a subset of data.
- **Apply-to-all**: Click to process millions of events in the background using a Web Worker.

## Known Limitations
- Gates are currently **Rectangle only**.
- Logicle scale is a high-speed approximation.
- Works best on Chrome/Edge/Firefox/Safari (desktop recommended).

---
*Built with Vanilla JS + Vite. No backend server.*
