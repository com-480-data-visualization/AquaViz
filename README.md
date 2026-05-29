# 💧 AquaViz: Global Water Consumption & Scarcity

**COM-480 Data Visualization · EPFL · 2026**

| Student | SCIPER |
|---|---|
| Istepanyan Anna | 327977 |
| Mohammad Massi Rashidi | 394309 |
| Oh Yoojin | 423070 |

---

## 📖 Project Overview

AquaViz is an interactive dashboard that lets a general audience explore global water consumption patterns across 20 countries from 2000 to 2024. The central question driving the project is:

> **How does water consumption and its distribution across sectors contribute to water scarcity levels across countries over time?**

The dashboard combines a choropleth world map, sectoral doughnut charts, per-capita bar charts with forecasts, historical drought events, and a two-country comparison view, all linked to a global year slider.

---

## 📦 Dataset

**Source:** [Global Water Consumption Dataset 2000–2024](https://www.kaggle.com/datasets/atharvasoundankar/global-water-consumption-dataset-2000-2024) (Kaggle)

- **File:** `cleaned_global_water_consumption.csv`
- **Size:** 500 observations · 20 countries · 25 years (2000–2024)
- **Variables (10):** total consumption (bn m³/yr), per-capita use (L/day), share going to agriculture / industry / households, rainfall impact, groundwater depletion rate, water scarcity level (Low / Moderate / High)

The dataset was already clean with no missing values, no duplicates, correct data types. Only light preprocessing was needed (grouping by country and year).

---

## 🗂️ Repository Structure

```
AquaViz/
├── Website/
│   ├── cleaned_global_water_consumption.csv    # Dataset 
│   ├── index.html                              # Main HTML shell
│   ├── style.css                               # All styles (layout, palette, components)
│   └── script.js                               # D3 logic (map, charts, interactions)
├── Milestone/
│   ├── milestone1.md
│   ├── milestone2.md
|   ├── Milestone_2_AquaViz.pdf
│   └── Process_book.pdf                        # Process book
├── Screencast/
│   ├── Screencast.mp4
├── Plot/
│   ├── Average_global_water_usage_by_sector.png
│   └── distribution_of_water_scarcity_levels.png
└── README.md
```

---

## 🚀 Technical Setup & Usage

### Run locally

No build step, no framework, no server required. The whole site is three static files.

1. Clone the repository:
   ```bash
   git clone https://github.com/com-480-data-visualization/AquaViz.git
   cd AquaViz/Website
   ```

2. Open `index.html` directly in your browser **or**, to avoid any CORS issue when loading the CSV, serve it with a local HTTP server:
   ```bash
   # Python 3
   python -m http.server 5500
   # then open http://localhost:5500/Website/index.html
   ```

> **No npm install, no build step needed.** All dependencies (D3 v7, topojson-client) are loaded from CDN.

### External dependencies (CDN)

| Library | Version | Purpose |
|---|---|---|
| [D3.js](https://d3js.org/) | v7 | Choropleth, charts, zoom/pan |
| [topojson-client](https://github.com/topojson/topojson-client) | 3 | Decoding TopoJSON country polygons |
| [world-atlas](https://github.com/topojson/world-atlas) | 110m | Natural Earth country geometry |
| Google Fonts | — | Playfair Display · Plus Jakarta Sans · JetBrains Mono |

---

## 🗺️ Features & Intended Usage

### 1 — Choropleth World Map
- Each country is coloured by its **water scarcity level** (sequential turquoise scale: Low → Moderate → High).
- Countries not covered by the dataset are greyed out with an explicit tooltip.
- **Hover** over a country to see its name, scarcity level and total consumption.
- **Click** a country to drill down into the side panel.
- **Pan & zoom** freely; **double-click** the ocean to reset the view.

### 2 — Year Slider & Play Button
- The slider in the header (2000–2024) controls **every linked view simultaneously**.
- Click ▶ to animate the time series automatically; click ⏸ to pause.

### 3 — Side Panel (single country)
After clicking a country, the panel shows:
- **KPI strip** — total consumption, per-capita use, scarcity level.
- **Sectoral doughnut** — share of agricultural / industrial / household water use.
- **Per-capita bar chart** — litres/person/day from 2000 to 2024, with the currently selected year highlighted. Lighter bars (2025–2030) show a damped linear forecast.
- **Historical drought events** — major crises for that country (e.g. France 2003 heatwave, Cape Town Day Zero 2018). Clicking an event card **jumps the slider** to that year.

### 4 — Country Comparison
- **Shift + Click** a second country on the map to open the comparison view.
- Side-by-side KPIs with a **delta badge** (% difference).
- Two doughnut charts and a **grouped bar chart** for per-capita consumption.
- **Swap button** flips Country A ↔ B. Any further Shift + Click replaces the B side.

### 5 — Resizable Panel
- Drag the handle between the map and the side panel to redistribute space.
- Your preferred width is saved in `localStorage` and restored on reload.

---

## 🛠️ Code Organisation

`script.js` is split into numbered sections:

1. **Global state** — selected year, selected countries, animation flag
2. **Helpers** — formatting, colour scales, name lookup tables
3. **Status bar** — scarcity indicator strip
4. **Slider & play button**
5. **Map** — choropleth init + render
6. **Zoom helpers**
7. **Tooltip**
8. **Charts** — doughnut, bar chart, comparison charts
9. **Central `update()` function** — called whenever year or country changes
10. **Data loading** — CSV + TopoJSON fetch with `Promise.all`
11. **Bootstrap** — entry point

Every view follows the same pattern: an `init` function builds an empty SVG skeleton, then a `render` function binds the real data on top, so the layout does not jump while the dataset is loading.

**Geo ↔ CSV reconciliation.** The TopoJSON does not always populate `properties.name`, so country names are attached through a `NAME_BY_ID` table covering 90+ ISO numeric codes. A second table `GEO_NAME_TO_CSV` maps geographic names to CSV names (e.g. `United States of America → USA`, `Republic of Korea → South Korea`).

---

## ♿ Accessibility

- All charts have `role="img"` and descriptive `aria-label` attributes.
- The year slider has explicit `min`, `max` and `step`.
- Focus rings are visible on all interactive elements.
- Colour palette checked against WCAG AA contrast for text on background.
- CSS media queries push the side panel below the map when the viewport is narrower than 680 px.

---

## 📽️ Screencast

> The Screencast is available in the Github in the folder Screencast. 

---

## 💻 Website

**Here is the link to the website:** [AquaViz](https://massirashidi.github.io/AquaViz/)

---

## 📚 References & Inspirations

- Kaggle — [Global Water Consumption Forecasting (CNN model)](https://www.kaggle.com/code/sarazahran1/global-water-consumption-forecasting)
- Kaggle — [Global Water Consumption Analysis (EDA)](https://www.kaggle.com/code/ahmedashraf299/global-water-consumption-analysis)
- Mike Bostock — [D3 Choropleth examples](https://observablehq.com/@d3/choropleth)
