// ─── STATE ───────────────────────────────────────────────
let currentYear = 2020, rawData = null, selectedCountry = null, compareCountry = null;
let geoData = null, projection = null, pathGenerator = null;
let mapSvg = null, mapRoot = null, zoomBehavior = null, tooltipEl = null;
let animTimer = null, isPlaying = false, appBooted = false;

const SECTORS = [
  { key: 'Agricultural Water Use (%)', label: 'Agricultural', color: '#00a3a6' },
  { key: 'Industrial Water Use (%)',   label: 'Industrial',   color: '#e07b39' },
  { key: 'Household Water Use (%)',    label: 'Household',    color: '#5b8fbd' },
];

const GEO_NAME_TO_CSV = {
  'United States of America': 'USA', 'United Kingdom': 'UK',
  'Republic of Korea': 'South Korea', 'Korea': 'South Korea',
  'Dem. Rep. Korea': 'South Korea', 'Russian Federation': 'Russia',
};

const SCARCITY_COLORS = { Low: '#c8eced', Moderate: '#6dbfc0', High: '#00636a' };

const WATER_EVENTS = {
  "Argentina":   [{ year: 2023, label: "Worst drought in decades: 52% drop in soybean production, $20bn lost. Weakening export revenues and foreign currency inflows", source: "J.P. Morgan Private Bank Latin America, Sept. 2025" }],
  "Brazil":      [{ year: 2014, label: "São Paulo reservoirs fall to 4% capacity, emergency rationing. Leading to emergency water rationing and highlighting severe water stress in the region.", source: "J.P. Morgan Private Bank Latin America, Sept. 2025" },
                  { year: 2024, label: "Worst drought since 1950s: Amazon River hits century low. Severely impacting ecosystems, transport, and local communities.", source: "WTW / CEMADEN, April 2025" }],
  "Mexico":      [{ year: 2011, label: "85% of country under drought, marking the worst nationwide drought on record at the time", source: "NOAA Climate.gov, July 2024" },
                  { year: 2024, label: "76% of the country experienced drought conditions, making it the most severe drought since 2011", source: "NOAA Climate.gov, July 2024" }],
  "Canada":      [{ year: 2001, label: "Severe Prairie drought: worst in 130 years, $3.6bn in losses", source: "Agriculture Canada / Historical record" }],
  "USA":         [{ year: 2012, label: "Worst Midwest drought since 1956, affects 80% of US farmland", source: "UNCCD Press Release, 2023" },
                  { year: 2022, label: "Lake Mead hits lowest level since 1937, first-ever shortage declared", source: "Woodwell Climate Research / NASA, 2023" }],
  "France":      [{ year: 2022, label: "Loire River crossable on foot, nuclear plants reduced output", source: "World Economic Forum, Aug. 2022" }],
  "Germany":     [{ year: 2018, label: "Rhine River near record low, shipping disrupted, 0.5% GDP impact", source: "World Economic Forum, Aug. 2022" },
                  { year: 2022, label: "Rhine near dry: cargo ships at 30-40% load capacity", source: "World Economic Forum, Aug. 2022" }],
  "Italy":       [{ year: 2022, label: "Po River worst drought in 70 years, Lake Garda near historic low", source: "Al Jazeera, Aug. 2022" }],
  "Spain":       [{ year: 2023, label: "36 consecutive months below the average rain, Sau reservoir at 9%", source: "Wikipedia, 2023 European drought" }],
  "UK":          [{ year: 2022, label: "Driest July on record, Environment Agency issues rare drought alert", source: "Euronews, Aug. 2022" }],
  "South Africa":[{ year: 2018, label: "Cape Town 'Day Zero': reservoirs at 26%, taps nearly shut off", source: "Wikipedia, Cape Town water crisis" }],
  "Saudi Arabia":[{ year: 2012, label: "Fossil aquifer depletion accelerates, wheat production abandoned", source: "FAO / World Bank Historical record" }],
  "Australia":   [{ year: 2007, label: "Millennium Drought peak: cities cut water use by 40%", source: "World Economic Forum, 2019" }],
  "China":       [{ year: 2022, label: "Yangtze River hits record low, 400M people affected, power cuts in Sichuan", source: "NBC News, Dec. 2022" }],
  "India":       [{ year: 2019, label: "Chennai 'Day Zero': all 4 reservoirs dry, 11M people without water", source: "Wikipedia, 2019 Chennai water crisis" }],
  "Indonesia":   [{ year: 2007, label: "Jakarta floods cause $800M damage, groundwater was over extraction crisis", source: "Urbanet / World Bank, 2024" }],
  "Japan":       [{ year: 2013, label: "Severe drought in western Japan, Yodo River basin restrictions", source: "Pacific Institute Water Conflict Chronology" }],
  "South Korea": [{ year: 2015, label: "Worst drought in 100 years, Han River basin water restrictions", source: "Pacific Institute Water Conflict Chronology" }],
  "Turkey":      [{ year: 2021, label: "Istanbul reservoirs drop below 25%, water rationing in major cities", source: "Pacific Institute Water Conflict Chronology" }],
  "Russia":      [{ year: 2010, label: "Worst drought in 130 years, 25% of wheat crop lost, export ban", source: "Pacific Institute Water Conflict Chronology" }]
};

// ─── HELPERS ─────────────────────────────────────────────
const fmt = (v, d = 1) => (v == null || isNaN(+v)) ? '—' : (+v).toFixed(d);
const getRow = (name, y) => rawData?.find(d => d.Country === name && +d.Year === y) || null;
const getSeries = name => rawData?.filter(d => d.Country === name).sort((a, b) => +a.Year - +b.Year) || [];
const geoCsvName = f => GEO_NAME_TO_CSV[f.properties.name] || f.properties.name || '';
const scarcityColor = lvl => SCARCITY_COLORS[String(lvl ?? '').trim()] || '#e8eeef';

// Damped-trend forecast with clamped slope (last 10 years window).
function buildForecast(series, key, horizon = [2025, 2026, 2027, 2028, 2029, 2030]) {
  if (!series || series.length < 3) return { years: horizon, mean: [], lower: [], upper: [] };
  const vals = series.map(d => +d[key] || 0), last = vals.at(-1);
  const W = Math.min(10, vals.length), win = vals.slice(-W);
  const xs = win.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / W;
  const my = win.reduce((a, b) => a + b, 0) / W;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (win[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  let slope = den ? num / den : 0;
  const maxStep = Math.abs(my) * 0.03;
  slope = Math.max(-maxStep, Math.min(maxStep, slope));
  const sigma = Math.sqrt(win.reduce((s, v, i) => s + (v - (my + slope * (i - mx))) ** 2, 0) / Math.max(1, W - 2));
  const phi = 0.85;
  const mean = [], lower = [], upper = [];
  let cum = 0, step = slope;
  horizon.forEach((_, i) => {
    cum += step; step *= phi;
    const m = Math.max(0, last + cum), sd = sigma * Math.sqrt(i + 1);
    mean.push(m); lower.push(Math.max(0, m - 1.2 * sd)); upper.push(m + 1.2 * sd);
  });
  return { years: horizon, mean, lower, upper };
}

// ─── STATUS BAR ──────────────────────────────────────────
function setStatus(msg, state = 'ok') {
  const dot = document.getElementById('status-dot'), text = document.getElementById('status-text');
  if (dot)  dot.className = `status-dot ${state}`;
  if (text) text.textContent = msg;
}

// ─── SLIDER + PLAY ───────────────────────────────────────
function updateSliderFill(s) {
  const pct = ((s.value - s.min) / (s.max - s.min)) * 100;
  s.style.background = `linear-gradient(90deg,rgba(255,255,255,.85) 0%,rgba(255,255,255,.85) ${pct}%,rgba(255,255,255,.28) ${pct}%)`;
}

function initSlider() {
  const slider = document.getElementById('yearSlider'), label = document.getElementById('yearLabel');
  if (!slider) return;
  updateSliderFill(slider);
  slider.addEventListener('input', function () {
    currentYear = +this.value;
    label.textContent = currentYear;
    updateSliderFill(this);
    updateDashboard(currentYear);
  });
}

function setPlayIcons(playing) {
  document.getElementById('play-icon').style.display  = playing ? 'none' : '';
  document.getElementById('pause-icon').style.display = playing ? '' : 'none';
}

function initPlayButton() {
  const btn = document.getElementById('btn-play'), slider = document.getElementById('yearSlider'), label = document.getElementById('yearLabel');
  if (!btn || !slider) return;

  const stop = () => {
    clearInterval(animTimer); animTimer = null; isPlaying = false;
    btn.classList.remove('playing'); setPlayIcons(false);
  };

  btn.addEventListener('click', () => {
    if (isPlaying) return stop();
    if (+slider.value >= +slider.max) { slider.value = slider.min; currentYear = +slider.min; }
    isPlaying = true; btn.classList.add('playing'); setPlayIcons(true);
    animTimer = setInterval(() => {
      const next = +slider.value + 1;
      if (next > +slider.max) return stop();
      slider.value = next; currentYear = next; label.textContent = next;
      updateSliderFill(slider); updateDashboard(next);
    }, 600);
  });
}

// ─── RESIZER ─────────────────────────────────────────────
const SIDE_MIN = 290, SIDE_MAX = 720, SIDE_KEY = 'aquaviz.sidebar-w';

function initResizer() {
  const resizer = document.getElementById('resizer');
  if (!resizer) return;

  const saved = +localStorage.getItem(SIDE_KEY);
  if (saved && !Number.isNaN(saved)) {
    document.documentElement.style.setProperty('--sidebar-w',
      `${Math.max(SIDE_MIN, Math.min(SIDE_MAX, saved))}px`);
  }

  const readW = () => (document.getElementById('side-panel') || document.getElementById('compare-panel'))
    ?.getBoundingClientRect().width || 310;

  let startX = 0, startW = 0, dragging = false;

  resizer.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = readW();
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.max(SIDE_MIN, Math.min(SIDE_MAX, startW + (startX - e.clientX)));
    document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = ''; document.body.style.userSelect = '';
    localStorage.setItem(SIDE_KEY, Math.round(readW()));
    rerenderAfterResize();
  });

  let rT = null;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(rerenderAfterResize, 120); });
}

function rerenderAfterResize() {
  if (compareCountry && selectedCountry) return renderComparePanel();
  d3.select('#doughnut-chart').selectAll('*').remove();
  d3.select('#bar-chart').selectAll('*').remove();
  _initDoughnut(); _initBars();
  if (selectedCountry) {
    const row = getRow(selectedCountry, Math.min(currentYear, 2024));
    renderDoughnut(row); renderBars(selectedCountry);
  }
}

// ─── MAP ─────────────────────────────────────────────────
function initMap() {
  const container = document.getElementById('map-viz');
  if (!container) return;
  const W = container.clientWidth || 900, H = container.clientHeight || 500;

  mapSvg = d3.select('#map-viz').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('cursor', 'grab');

  // Fit on real countries
  const fitFC = { type: 'FeatureCollection',
    features: (geoData?.features || []).filter(f => +f.id !== 10) };
  projection = d3.geoNaturalEarth1()
    .fitExtent([[6, 6], [W - 6, H - 6]], fitFC.features.length ? fitFC : { type: 'Sphere' });
  pathGenerator = d3.geoPath().projection(projection);

  mapSvg.append('rect')
    .attr('width', W).attr('height', H)
    .attr('fill', 'transparent').attr('pointer-events', 'all');

  mapRoot = mapSvg.append('g').attr('class', 'map-root');
  mapRoot.append('g').attr('class', 'countries');

  mapSvg.append('text').attr('class', 'map-loading-text')
    .attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 11)
    .attr('fill', '#7a95a0').attr('letter-spacing', '.06em')
    .text('Loading geographic data…');

  zoomBehavior = d3.zoom().scaleExtent([1, 10]).translateExtent([[0, 0], [W, H]])
    .on('zoom', e => {
      mapRoot.attr('transform', e.transform);
      mapRoot.selectAll('path.country').attr('stroke-width', 0.5 / e.transform.k);
      mapSvg.style('cursor', e.transform.k > 1 ? 'grabbing' : 'grab');
    });
  mapSvg.call(zoomBehavior).on('dblclick.zoom', null);
  mapSvg.on('dblclick', e => { if (e.target.tagName === 'rect') resetZoom(); });

  tooltipEl = d3.select('body').append('div').attr('class', 'tooltip');

  // Legend
  const legend = d3.select('#map-legend');
  legend.append('span').style('font-size', '.60rem').style('color', 'var(--ink-3)').text('Water Scarcity:');
  [['Low', '#c8eced'], ['Moderate', '#6dbfc0'], ['High', '#00636a']].forEach(([lbl, col]) => {
    const item = legend.append('span')
      .style('display', 'inline-flex').style('align-items', 'center')
      .style('gap', '3px').style('font-size', '.58rem').style('color', 'var(--ink-3)');
    item.append('span').style('display', 'inline-block')
      .style('width', '10px').style('height', '10px').style('border-radius', '2px').style('background', col);
    item.append('span').text(lbl);
  });
}

function zoomToCountry(feature) {
  if (!mapSvg || !zoomBehavior || !pathGenerator) return;
  const c = document.getElementById('map-viz');
  const W = c.clientWidth || 900, H = c.clientHeight || 500;
  const [[x0, y0], [x1, y1]] = pathGenerator.bounds(feature);
  const dx = x1 - x0, dy = y1 - y0;
  if (!dx || !dy) return;
  const scale = Math.min(8, 0.7 / Math.max(dx / W, dy / H));
  const tx = W / 2 - scale * (x0 + x1) / 2;
  const ty = H / 2 - scale * (y0 + y1) / 2;
  mapSvg.transition().duration(700).ease(d3.easeCubicInOut)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function resetZoom() {
  if (!mapSvg || !zoomBehavior) return;
  mapSvg.transition().duration(600).ease(d3.easeCubicInOut)
    .call(zoomBehavior.transform, d3.zoomIdentity);
}

function renderMapForYear(year) {
  if (!mapSvg || !geoData || !rawData) return;
  mapSvg.select('.map-loading-text').remove();
  const g = mapRoot.select('g.countries');
  const paths = g.selectAll('path.country').data(geoData.features, d => d.properties.name);

  const entered = paths.enter().append('path')
    .attr('d', pathGenerator).attr('class', 'country');
  paths.exit().remove();

  entered.merge(paths)
    .on('mouseover', (e, d) => showTooltip(e, geoCsvName(d), getRow(geoCsvName(d), currentYear)))
    .on('mousemove', moveTooltip).on('mouseleave', hideTooltip)
    .on('click', (e, d) => {
      const name = geoCsvName(d);
      if (!getRow(name, currentYear)) return;
      if (e.shiftKey && selectedCountry && name !== selectedCountry) {
        compareCountry = name; enterCompareMode();
      } else {
        exitCompareMode(); selectCountry(name, d);
      }
    })
    .transition().duration(350)
    .attr('fill', d => {
      const r = getRow(geoCsvName(d), year);
      return r ? scarcityColor(r['Water Scarcity Level']) : '#e8eeef';
    })
    .attr('class', d => {
      const n = geoCsvName(d), r = getRow(n, year);
      return `country${r ? '' : ' country--nodata'}${n === selectedCountry ? ' selected' : ''}${n === compareCountry ? ' selected2' : ''}`;
    });
}

// ─── TOOLTIPS ────────────────────────────────────────────
function showTooltip(event, name, row) {
  if (!tooltipEl) return;
  tooltipEl.html(`
    <span class="tooltip-name">${name}</span>
    <span class="tooltip-value">${row
      ? `${row['Water Scarcity Level']} scarcity &nbsp;·&nbsp; ${fmt(row['Total Water Consumption (Billion Cubic Meters)'], 1)} bn m³/yr`
      : 'No data for this year'}</span>
  `).classed('visible', true);
  moveTooltip(event);
}

function showEventTooltip(event, year, label, source) {
  if (!tooltipEl) return;
  tooltipEl.html(`
    <span class="tooltip-name" style="color:#e07b39">⚡ ${year}</span>
    <span class="tooltip-value">${label}</span>
    ${source ? `<span class="tooltip-source">${source}</span>` : ''}
  `).classed('visible', true);
  moveTooltip(event);
}

function moveTooltip(event) {
  if (!tooltipEl) return;
  const w = tooltipEl.node().offsetWidth;
  const overflow = event.clientX + 14 + w > window.innerWidth;
  tooltipEl
    .style('left', `${overflow ? event.clientX - w - 14 : event.clientX + 14}px`)
    .style('top',  `${event.clientY - 36}px`);
}

const hideTooltip = () => tooltipEl?.classed('visible', false);

// ─── DOUGHNUT ────────────────────────────────────────────
function initCharts() { _initDoughnut(); _initBars(); }

function _initDoughnut() {
  const el = document.getElementById('doughnut-chart');
  if (!el) return;
  const W = el.clientWidth || 270, H = el.clientHeight || 195;
  const cx = W / 2, cy = H * 0.5, R = Math.min(W * 0.34, H * 0.36);

  const svg = d3.select('#doughnut-chart').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');

  svg.append('circle').attr('class', 'donut-placeholder')
    .attr('cx', cx).attr('cy', cy).attr('r', R)
    .attr('fill', 'none').attr('stroke', '#dce8ea')
    .attr('stroke-width', R * 0.38).attr('stroke-dasharray', '6 4');
  svg.append('circle').attr('class', 'donut-placeholder')
    .attr('cx', cx).attr('cy', cy).attr('r', R * 0.58).attr('fill', 'var(--surface-2)');
  ['SELECT', 'COUNTRY'].forEach((t, i) =>
    svg.append('text').attr('class', 'donut-placeholder')
      .attr('x', cx).attr('y', cy + (i ? 8 : -5))
      .attr('text-anchor', 'middle').attr('font-family', 'var(--font-mono)')
      .attr('font-size', 9).attr('fill', '#b0c4cb').attr('letter-spacing', '.05em').text(t)
  );
}

function renderDoughnut(row) {
  const svg = d3.select('#doughnut-chart svg');
  if (svg.empty() || !row) return;
  svg.selectAll('.donut-arc, .donut-centre, .donut-placeholder').remove();

  const el = document.getElementById('doughnut-chart');
  const W = el.clientWidth || 270, H = el.clientHeight || 195;
  const cx = W / 2, cy = H * 0.5;
  const outerR = Math.min(W * 0.34, H * 0.36), innerR = outerR * 0.58;

  const pieData = SECTORS.map(s => ({ label: s.label, color: s.color, value: +row[s.key] || 0 }));
  const pie = d3.pie().value(d => d.value).sort(null).padAngle(.03);
  const arc = d3.arc().innerRadius(innerR).outerRadius(outerR).cornerRadius(2);
  const labelArc = d3.arc()
    .innerRadius(innerR + (outerR - innerR) * 0.55)
    .outerRadius(innerR + (outerR - innerR) * 0.55);

  const g = svg.append('g').attr('class', 'donut-arc').attr('transform', `translate(${cx},${cy})`);
  const arcs = pie(pieData);

  g.selectAll('path').data(arcs).enter().append('path')
    .attr('d', arc).attr('fill', d => d.data.color).attr('opacity', .82)
    .on('mouseover', function (e, d) {
      d3.select(this).attr('opacity', 1).attr('stroke', 'white').attr('stroke-width', 1.5);
      g.selectAll('.arc-label').filter(l => l === d).attr('font-weight', 700).attr('font-size', 10);
    })
    .on('mouseleave', function (e, d) {
      d3.select(this).attr('opacity', .82).attr('stroke', 'none');
      g.selectAll('.arc-label').filter(l => l === d).attr('font-weight', 500).attr('font-size', 9);
    });

  g.selectAll('.arc-label').data(arcs).enter().append('text').attr('class', 'arc-label')
    .attr('transform', d => `translate(${labelArc.centroid(d)})`)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 9).attr('font-weight', 500)
    .attr('fill', 'white').attr('pointer-events', 'none')
    .text(d => d.data.value >= 8 ? `${d.data.value.toFixed(0)}%` : '');

  const centre = svg.append('g').attr('class', 'donut-centre').attr('transform', `translate(${cx},${cy})`);
  centre.append('text').attr('text-anchor', 'middle').attr('dy', '-.1em')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 14).attr('font-weight', 600)
    .attr('fill', 'var(--brand)').text(fmt(row['Total Water Consumption (Billion Cubic Meters)'], 0));
  centre.append('text').attr('text-anchor', 'middle').attr('dy', '1.15em')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 7).attr('fill', 'var(--ink-3)').text('bn m³/yr');
}

// ─── BAR CHART ──────────────────
function _initBars() {
  const el = document.getElementById('bar-chart');
  if (!el) return;
  const W = el.clientWidth || 270, H = el.clientHeight || 175;
  const m = { top: 14, right: 10, bottom: 26, left: 38 };
  el.dataset.m = JSON.stringify(m);
  const iW = W - m.left - m.right, iH = H - m.top - m.bottom;

  const svg = d3.select('#bar-chart').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('class', 'bar-g').attr('transform', `translate(${m.left},${m.top})`);

  const x = d3.scaleBand().domain(d3.range(2000, 2031).map(String)).range([0, iW]).padding(.25);
  const y = d3.scaleLinear().domain([0, 500]).range([iH, 0]);

  g.append('g').attr('class', 'axis axis--x').attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(x).tickValues(['2000','2005','2010','2015','2020','2025','2030']).tickSize(3));
  g.append('g').attr('class', 'axis axis--y').call(d3.axisLeft(y).ticks(4).tickSize(3));
  g.append('text').attr('transform', 'rotate(-90)').attr('x', -iH / 2).attr('y', -30)
    .attr('text-anchor', 'middle').attr('font-family', 'var(--font-mono)').attr('font-size', 7)
    .attr('fill', '#b0c4cb').text('Litres / person / day');
  g.append('text').attr('class', 'bar-placeholder')
    .attr('x', iW / 2).attr('y', iH / 2).attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 9)
    .attr('fill', '#b0c4cb').attr('letter-spacing', '.04em').text('No country selected');
}

function renderBars(name) {
  const el = document.getElementById('bar-chart'), svg = d3.select('#bar-chart svg');
  if (!el || svg.empty()) return;
  const m = JSON.parse(el.dataset.m);
  const W = el.clientWidth || 270, H = el.clientHeight || 175;
  const iW = W - m.left - m.right, iH = H - m.top - m.bottom;
  const g = svg.select('g.bar-g'); if (g.empty()) return;

  g.selectAll('.bar, .bar.predicted, .bar-placeholder, .year-line, .events-g').remove();

  const series = getSeries(name); if (!series.length) return;
  const KEY = 'Per Capita Water Use (Liters per Day)';
  const fc = buildForecast(series, KEY);

  // forecast as plain rows so we can draw uniform bars
  const fcRows = fc.years.map((yr, i) => ({ Year: yr, [KEY]: fc.mean[i], _predicted: true }));
  const all = [...series, ...fcRows];

  const yMax = (d3.max(all, d => +d[KEY] || 0) || 100) * 1.15;
  const x = d3.scaleBand().domain(all.map(d => String(+d.Year))).range([0, iW]).padding(.2);
  const y = d3.scaleLinear().domain([0, yMax]).range([iH, 0]);

  g.select('.axis--x').transition().duration(350)
    .call(d3.axisBottom(x)
      .tickValues(['2000','2005','2010','2015','2020','2025','2030'].filter(t => x(t) != null))
      .tickSize(3));
  g.select('.axis--y').transition().duration(350).call(d3.axisLeft(y).ticks(4).tickSize(3));

  // forecast separator
  const sepX = x('2025');
  if (sepX != null) {
    g.append('line').attr('class', 'year-line')
      .attr('x1', sepX).attr('x2', sepX).attr('y1', 0).attr('y2', iH)
      .attr('stroke', 'var(--ink-4)').attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3').attr('opacity', .55);
    g.append('text').attr('class', 'year-line')
      .attr('x', sepX + 3).attr('y', 10)
      .attr('font-family', 'var(--font-mono)').attr('font-size', 7)
      .attr('fill', 'var(--ink-4)').text('forecast →');
  }

  // bars (historical + forecast — same shape, different style)
  g.selectAll('rect.bar').data(all).enter().append('rect')
    .attr('class', d => d._predicted
      ? 'bar predicted'
      : `bar${+d.Year === currentYear ? ' current-year' : ''}`)
    .attr('x', d => x(String(+d.Year)))
    .attr('y', d => y(+d[KEY] || 0))
    .attr('width', x.bandwidth())
    .attr('height', d => iH - y(+d[KEY] || 0))
    .attr('rx', 2)
    .on('mouseover', function (e, d) {
      d3.select(this).attr('opacity', 1);
      const label = d._predicted ? `${name} · ${+d.Year} (forecast)` : `${name} · ${+d.Year}`;
      const i = d._predicted ? fc.years.indexOf(+d.Year) : -1;
      if (i >= 0) {
        tooltipEl.html(`
          <span class="tooltip-name">${label}</span>
          <span class="tooltip-value">${fmt(fc.mean[i], 0)} L/day</span>
          <span class="tooltip-source">range ${fmt(fc.lower[i], 0)} – ${fmt(fc.upper[i], 0)} L/day</span>
        `).classed('visible', true);
        moveTooltip(e);
      } else {
        showTooltip(e, label, d);
      }
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave', function (e, d) {
      d3.select(this).attr('opacity', d._predicted ? .35 : (+d.Year === currentYear ? 1 : .65));
      hideTooltip();
    });

  // current-year marker (only on historical bars)
  if (currentYear <= 2024) {
    const cx = x(String(currentYear));
    if (cx != null) {
      g.append('line').attr('class', 'year-line')
        .attr('x1', cx + x.bandwidth() / 2).attr('x2', cx + x.bandwidth() / 2)
        .attr('y1', 0).attr('y2', iH)
        .attr('stroke', 'var(--brand)').attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 3').attr('opacity', .5);
    }
  }

  // historical event pins
  const events = WATER_EVENTS[name] || [];
  if (events.length) {
    const ev = g.append('g').attr('class', 'events-g');
    events.forEach(evt => {
      const ex = x(String(evt.year)); if (ex == null) return;
      const cx = ex + x.bandwidth() / 2;
      ev.append('line').attr('class', 'event-pin-line')
        .attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', iH);
      ev.append('circle').attr('class', 'event-pin-dot')
        .attr('cx', cx).attr('cy', 6).attr('r', 5)
        .on('mouseover', e => showEventTooltip(e, evt.year, evt.label, evt.source))
        .on('mousemove', moveTooltip).on('mouseleave', hideTooltip);
    });
  }
}

// ─── EVENTS PANEL ────────────────────────────────────────
function renderEvents(name) {
  const list = document.getElementById('events-list'), sub = document.getElementById('events-sub');
  if (!list) return;
  const events = (WATER_EVENTS[name] || []).slice().sort((a, b) => a.year - b.year);

  if (sub) sub.textContent = name
    ? (events.length ? `${events.length}  major event${events.length > 1 ? 's' : ''} recorded for ${name}` : `No major event recorded for ${name}`)
    : 'Select a country to see its drought history';

  if (!name) {
    list.innerHTML = `<div class="events-empty">Select a country on the map to see its drought history.</div>`;
    return;
  }
  if (!events.length) {
    list.innerHTML = `<div class="events-empty">No major water crisis recorded for this country in our database.</div>`;
    return;
  }

  list.innerHTML = '';
  events.forEach(evt => {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.title = 'Click to jump the slider to this year';
    card.innerHTML = `
      <span class="event-year">${evt.year}</span>
      <div class="event-body">
        <p class="event-label">${evt.label}</p>
        <span class="event-source">${evt.source}</span>
      </div>`;
    card.addEventListener('click', () => {
      const s = document.getElementById('yearSlider');
      const y = Math.min(evt.year, +s.max);
      s.value = y; currentYear = y;
      document.getElementById('yearLabel').textContent = y;
      updateSliderFill(s); updateDashboard(y);
    });
    list.appendChild(card);
  });
}

// ─── SELECTION ───────────────────────────────────────────
function selectCountry(name, feature = null) {
  selectedCountry = name;
  document.getElementById('selected-country').textContent = name;
  if (mapSvg) mapSvg.selectAll('path.country').classed('selected', d => geoCsvName(d) === name);
  if (feature) zoomToCountry(feature);

  const row = getRow(name, Math.min(currentYear, 2024));
  document.getElementById('kpi-total').textContent  = fmt(row?.['Total Water Consumption (Billion Cubic Meters)']);
  document.getElementById('kpi-pop').textContent    = fmt(row?.['Per Capita Water Use (Liters per Day)'], 0);
  document.getElementById('kpi-stress').textContent = row?.['Water Scarcity Level'] ?? '—';

  renderDoughnut(row); renderBars(name); renderEvents(name);
}

function clearSelection() {
  exitCompareMode();
  selectedCountry = null;
  document.getElementById('selected-country').textContent = 'Select a country';
  ['kpi-total','kpi-stress','kpi-pop'].forEach(id => document.getElementById(id).textContent = '—');
  if (mapSvg) mapSvg.selectAll('path.country').classed('selected', false);
  resetZoom();
  d3.select('#doughnut-chart').selectAll('*').remove();
  d3.select('#bar-chart').selectAll('*').remove();
  _initDoughnut(); _initBars(); renderEvents(null);
}

// ─── CENTRAL UPDATE ──────────────────────────────────────
function updateDashboard(year) {
  currentYear = year;
  renderMapForYear(Math.min(year, 2024));
  if (compareCountry && selectedCountry)      renderComparePanel();
  else if (selectedCountry)                   selectCountry(selectedCountry);
  const label = document.getElementById('yearLabel');
  const future = year > 2024;
  label.style.color     = future ? 'rgba(255,255,255,0.5)' : '';
  label.style.fontStyle = future ? 'italic' : '';
}

// ─── COMPARE ─────────────────────────────────────────────
function enterCompareMode() {
  if (mapSvg) mapSvg.selectAll('path.country')
    .classed('selected',  d => geoCsvName(d) === selectedCountry)
    .classed('selected2', d => geoCsvName(d) === compareCountry);
  document.getElementById('side-panel').style.display    = 'none';
  document.getElementById('compare-panel').style.display = 'flex';
  renderComparePanel();
}

function exitCompareMode() {
  compareCountry = null;
  document.getElementById('side-panel').style.display    = '';
  document.getElementById('compare-panel').style.display = 'none';
  if (mapSvg) mapSvg.selectAll('path.country').classed('selected2', false);
}

function swapCompareCountries() {
  if (!selectedCountry || !compareCountry) return;
  [selectedCountry, compareCountry] = [compareCountry, selectedCountry];
  if (mapSvg) mapSvg.selectAll('path.country')
    .classed('selected',  d => geoCsvName(d) === selectedCountry)
    .classed('selected2', d => geoCsvName(d) === compareCountry);
  renderComparePanel();
}

function deltaString(a, b) {
  if (a == null || b == null || isNaN(+a) || isNaN(+b) || +a === 0) return { txt: '—', dir: 'neutral' };
  const pct = ((+b - +a) / Math.abs(+a)) * 100;
  if (!isFinite(pct)) return { txt: '—', dir: 'neutral' };
  const dir = Math.abs(pct) < 0.5 ? 'neutral' : (pct > 0 ? 'up' : 'down');
  return { txt: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, dir };
}

function setDelta(id, d) {
  const el = document.getElementById(id); if (!el) return;
  el.textContent = d.txt;
  el.classList.remove('cmp-delta--up','cmp-delta--down','cmp-delta--neutral');
  el.classList.add(`cmp-delta--${d.dir}`);
}

function renderComparePanel() {
  if (!selectedCountry || !compareCountry) return;
  const A = selectedCountry, B = compareCountry, yr = Math.min(currentYear, 2024);
  const rA = getRow(A, yr), rB = getRow(B, yr);
  const tA = rA?.['Total Water Consumption (Billion Cubic Meters)'];
  const tB = rB?.['Total Water Consumption (Billion Cubic Meters)'];
  const pA = rA?.['Per Capita Water Use (Liters per Day)'];
  const pB = rB?.['Per Capita Water Use (Liters per Day)'];

  const set = (id, v) => document.getElementById(id).textContent = v;
  set('cmp-name-a', A); set('cmp-name-b', B);
  set('cmp-donut-label-a', A); set('cmp-donut-label-b', B);
  set('cmp-total-a', fmt(tA)); set('cmp-total-b', fmt(tB));
  set('cmp-pop-a', fmt(pA, 0)); set('cmp-pop-b', fmt(pB, 0));
  set('cmp-stress-a', rA?.['Water Scarcity Level'] ?? '—');
  set('cmp-stress-b', rB?.['Water Scarcity Level'] ?? '—');
  set('cmp-leg-a', A); set('cmp-leg-b', B);

  setDelta('cmp-total-delta', deltaString(tA, tB));
  setDelta('cmp-pop-delta',   deltaString(pA, pB));

  renderCompareDonut('cmp-donut-a', rA);
  renderCompareDonut('cmp-donut-b', rB);
  renderCompareBars(A, B);
}

function renderCompareDonut(id, row) {
  const el = document.getElementById(id); if (!el) return;
  d3.select(`#${id}`).selectAll('*').remove();
  const W = el.clientWidth || 130, H = el.clientHeight || 130;
  const R = Math.min(W, H) / 2 - 8;
  const svg = d3.select(`#${id}`).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');

  if (!row) return void svg.append('text').attr('x', W / 2).attr('y', H / 2)
    .attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#b0c4cb').text('No data');

  const data = SECTORS.map(s => ({ label: s.label, value: +row[s.key] || 0, color: s.color }));
  const pie = d3.pie().value(d => d.value).sort(null).padAngle(.02);
  const arc = d3.arc().innerRadius(R * 0.55).outerRadius(R).cornerRadius(2);
  const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);

  g.selectAll('path').data(pie(data)).enter().append('path')
    .attr('d', arc).attr('fill', d => d.data.color).attr('opacity', .85)
    .attr('stroke', 'white').attr('stroke-width', 1.2)
    .on('mouseover', function (e, d) {
      d3.select(this).attr('opacity', 1);
      tooltipEl.html(`
        <span class="tooltip-name">${d.data.label}</span>
        <span class="tooltip-value">${d.data.value.toFixed(0)}% of total use</span>
      `).classed('visible', true);
      moveTooltip(e);
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave', function () { d3.select(this).attr('opacity', .85); hideTooltip(); });

  const total = +row['Total Water Consumption (Billion Cubic Meters)'] || 0;
  g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 11).attr('font-weight', 600)
    .attr('fill', 'var(--ink)').text(fmt(total, 0));
  g.append('text').attr('text-anchor', 'middle').attr('dy', '1em')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 7).attr('fill', 'var(--ink-3)').text('bn m³/yr');
}

function renderCompareBars(A, B) {
  const el = document.getElementById('cmp-bars'); if (!el) return;
  d3.select('#cmp-bars').selectAll('*').remove();
  const W = el.clientWidth || 560, H = el.clientHeight || 175;
  const m = { top: 16, right: 12, bottom: 28, left: 42 };
  const iW = W - m.left - m.right, iH = H - m.top - m.bottom;

  const sA = getSeries(A), sB = getSeries(B);
  if (!sA.length || !sB.length) return;
  const years = sA.map(d => String(+d.Year));
  const KEY = 'Per Capita Water Use (Liters per Day)';

  const x = d3.scaleBand().domain(years).range([0, iW]).padding(.15);
  const inner = d3.scaleBand().domain(['A','B']).range([0, x.bandwidth()]).padding(.08);
  const yMax = d3.max([...sA, ...sB], d => +d[KEY] || 0) * 1.15 || 500;
  const y = d3.scaleLinear().domain([0, yMax]).range([iH, 0]);

  const svg = d3.select('#cmp-bars').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  g.append('g').attr('class', 'axis axis--x').attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(x).tickValues(years.filter(yr => +yr % 5 === 0)).tickSize(3));
  g.append('g').attr('class', 'axis axis--y').call(d3.axisLeft(y).ticks(4).tickSize(3));
  g.append('text').attr('transform', 'rotate(-90)').attr('x', -iH / 2).attr('y', -32)
    .attr('text-anchor', 'middle').attr('font-family', 'var(--font-mono)').attr('font-size', 7)
    .attr('fill', '#b0c4cb').text('Litres / person / day');

  const draw = (series, side, name, color) =>
    g.selectAll(`.bar-${side}`).data(series).enter().append('rect')
      .attr('class', `bar-${side}`)
      .attr('x', d => x(String(+d.Year)) + inner(side))
      .attr('y', d => y(+d[KEY] || 0))
      .attr('width', inner.bandwidth())
      .attr('height', d => iH - y(+d[KEY] || 0))
      .attr('fill', color).attr('opacity', .82).attr('rx', 1)
      .on('mouseover', function (e, d) {
        d3.select(this).attr('opacity', 1);
        tooltipEl.html(`
          <span class="tooltip-name">${name} · ${+d.Year}</span>
          <span class="tooltip-value">${fmt(+d[KEY], 0)} L/day</span>
        `).classed('visible', true);
        moveTooltip(e);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', function () { d3.select(this).attr('opacity', .82); hideTooltip(); });

  draw(sA, 'A', A, 'var(--brand)');
  draw(sB, 'B', B, '#e07b39');

  const cx = x(String(Math.min(currentYear, 2024)));
  if (cx != null) g.append('line')
    .attr('x1', cx + x.bandwidth() / 2).attr('x2', cx + x.bandwidth() / 2)
    .attr('y1', 0).attr('y2', iH)
    .attr('stroke', 'var(--brand-dark)').attr('stroke-width', 1)
    .attr('stroke-dasharray', '3 3').attr('opacity', .5);
}

// ─── DATA LOADING ────────────────────────────────────────
function loadData() {
  setStatus('Loading data…', 'loading');
  const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

  Promise.all([d3.json(GEO_URL), d3.csv('cleaned_global_water_consumption.csv')])
    .then(([world, data]) => {
      geoData = topojson.feature(world, world.objects.countries);
      attachCountryNames(geoData);
      rawData = data;
      setStatus(`${data.length} records loaded · ${geoData.features.length} countries`, 'ok');
      initMap(); initCharts(); initPlayButton(); renderEvents(null);
      updateDashboard(currentYear);
    })
    .catch(err => {
      console.error('[AquaViz] Load error:', err);
      setStatus('Error loading data — check console', 'error');
      initMap(); initCharts();
    });
}

function attachCountryNames(fc) {
  const N = {
    4:'Afghanistan',8:'Albania',12:'Algeria',24:'Angola',32:'Argentina',36:'Australia',40:'Austria',
    50:'Bangladesh',56:'Belgium',68:'Bolivia',76:'Brazil',100:'Bulgaria',116:'Cambodia',120:'Cameroon',
    124:'Canada',152:'Chile',156:'China',170:'Colombia',180:'Congo (Kinshasa)',188:'Costa Rica',
    191:'Croatia',192:'Cuba',203:'Czech Republic',208:'Denmark',218:'Ecuador',818:'Egypt',
    222:'El Salvador',231:'Ethiopia',246:'Finland',250:'France',266:'Gabon',276:'Germany',288:'Ghana',
    300:'Greece',320:'Guatemala',332:'Haiti',340:'Honduras',348:'Hungary',356:'India',360:'Indonesia',
    364:'Iran',368:'Iraq',372:'Ireland',376:'Israel',380:'Italy',388:'Jamaica',392:'Japan',400:'Jordan',
    398:'Kazakhstan',404:'Kenya',408:'North Korea',410:'South Korea',414:'Kuwait',418:'Laos',422:'Lebanon',
    434:'Libya',504:'Morocco',484:'Mexico',516:'Namibia',524:'Nepal',528:'Netherlands',554:'New Zealand',
    566:'Nigeria',578:'Norway',586:'Pakistan',591:'Panama',604:'Peru',608:'Philippines',616:'Poland',
    620:'Portugal',630:'Puerto Rico',642:'Romania',643:'Russia',682:'Saudi Arabia',686:'Senegal',
    694:'Sierra Leone',705:'Slovenia',706:'Somalia',710:'South Africa',728:'South Sudan',724:'Spain',
    729:'Sudan',752:'Sweden',756:'Switzerland',760:'Syria',762:'Tajikistan',764:'Thailand',768:'Togo',
    780:'Trinidad and Tobago',788:'Tunisia',792:'Turkey',800:'Uganda',804:'Ukraine',
    784:'United Arab Emirates',826:'United Kingdom',840:'United States of America',858:'Uruguay',
    860:'Uzbekistan',862:'Venezuela',704:'Vietnam',887:'Yemen',894:'Zambia',716:'Zimbabwe',
  };
  fc.features.forEach(f => {
    f.properties ??= {};
    if (!f.properties.name) f.properties.name = N[+f.id] || `Country_${+f.id}`;
  });
}

// ─── LANDING + BOOT ──────────────────────────────────────
function bootApp() { if (appBooted) return; appBooted = true; loadData(); }

function initLanding() {
  const landing = document.getElementById('landing'), enter = document.getElementById('landing-enter');
  if (!landing || !enter) return bootApp();
  const dismiss = () => {
    landing.classList.add('hidden');
    setTimeout(bootApp, 350);
    setTimeout(() => landing.remove(), 800);
  };
  enter.addEventListener('click', dismiss);
  enter.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dismiss(); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSlider(); initResizer();
  document.getElementById('btn-clear')?.addEventListener('click', clearSelection);
  document.getElementById('btn-exit-compare')?.addEventListener('click', () => {
    exitCompareMode();
    if (selectedCountry) selectCountry(selectedCountry);
  });
  document.getElementById('btn-swap')?.addEventListener('click', swapCompareCountries);
  initLanding();
});
