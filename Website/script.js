
//
// 1. GLOBAL STATE
//
let currentYear      = 2020;
let rawData          = null;
let selectedCountry  = null;
let geoData          = null;
let colorScale       = null;
let projection       = null;
let pathGenerator    = null;
let mapSvg           = null;
let mapRoot          = null;
let zoomBehavior     = null;
let tooltipEl        = null;
let animTimer        = null;
let isPlaying        = false;
let compareCountry   = null;

const SECTORS = [
  { key: 'Agricultural Water Use (%)', label: 'Agricultural', color: '#00a3a6' },
  { key: 'Industrial Water Use (%)',   label: 'Industrial',   color: '#e07b39' },
  { key: 'Household Water Use (%)',    label: 'Household',    color: '#5b8fbd' },
];



const GEO_NAME_TO_CSV = {
  'United States of America': 'USA',
  'United Kingdom':           'UK',
  'Republic of Korea':        'South Korea',
  'Korea':                    'South Korea',
  'Dem. Rep. Korea':          'South Korea',
  'Russian Federation':       'Russia',
};


const SCARCITY_COLORS = {
  Low: '#c8eced',
  Moderate: '#6dbfc0',
  High: '#00636a',
};

const WATER_EVENTS = {
  "Argentina": [
    { year: 2023, label: "Worst drought in decades: 52% drop in soybean production, $20bn lost", source: "J.P. Morgan Private Bank Latin America, Sept. 2025" }
  ],
  "Brazil": [
    { year: 2014, label: "São Paulo reservoirs fall to 4% capacity, emergency rationing", source: "J.P. Morgan Private Bank Latin America, Sept. 2025" },
    { year: 2024, label: "Worst drought since 1950s: Amazon River hits century low", source: "WTW / CEMADEN, April 2025" }
  ],
  "Mexico": [
    { year: 2011, label: "85% of country under drought — worst on record at the time", source: "NOAA Climate.gov, July 2024" },
    { year: 2024, label: "76% of country under drought, worst since 2011", source: "NOAA Climate.gov, July 2024" }
  ],
  "Canada": [
    { year: 2001, label: "Severe Prairie drought: worst in 130 years, $3.6bn in losses", source: "Agriculture Canada / Historical record" }
  ],
  "USA": [
    { year: 2012, label: "Worst Midwest drought since 1956, affects 80% of US farmland", source: "UNCCD Press Release, 2023" },
    { year: 2022, label: "Lake Mead hits lowest level since 1937, first-ever shortage declared", source: "Woodwell Climate Research / NASA, 2023" }
  ],
  "France": [
    { year: 2022, label: "Loire River crossable on foot; nuclear plants reduced output", source: "World Economic Forum, Aug. 2022" }
  ],
  "Germany": [
    { year: 2018, label: "Rhine River near record low, shipping disrupted, 0.5% GDP impact", source: "World Economic Forum, Aug. 2022" },
    { year: 2022, label: "Rhine near dry: cargo ships at 30–40% load capacity", source: "World Economic Forum, Aug. 2022" }
  ],
  "Italy": [
    { year: 2022, label: "Po River worst drought in 70 years; Lake Garda near historic low", source: "Al Jazeera, Aug. 2022" }
  ],
  "Spain": [
    { year: 2023, label: "36 consecutive months below-average rain; Sau reservoir at 9%", source: "Wikipedia, 2023 European drought" }
  ],
  "UK": [
    { year: 2022, label: "Driest July on record; Environment Agency issues rare drought alert", source: "Euronews, Aug. 2022" }
  ],
  "South Africa": [
    { year: 2018, label: "Cape Town 'Day Zero': reservoirs at 26%, taps nearly shut off", source: "Wikipedia, Cape Town water crisis" }
  ],
  "Saudi Arabia": [
    { year: 2012, label: "Fossil aquifer depletion accelerates; wheat production abandoned", source: "FAO / World Bank Historical record" }
  ],
  "Australia": [
    { year: 2007, label: "Millennium Drought peak: cities cut water use by 40%", source: "World Economic Forum, 2019" }
  ],
  "China": [
    { year: 2022, label: "Yangtze River hits record low; 400M people affected, power cuts in Sichuan", source: "NBC News, Dec. 2022" }
  ],
  "India": [
    { year: 2019, label: "Chennai 'Day Zero': all 4 reservoirs dry, 11M people without water", source: "Wikipedia, 2019 Chennai water crisis" }
  ],
  "Indonesia": [
    { year: 2007, label: "Jakarta floods cause $800M damage; groundwater over-extraction crisis", source: "Urbanet / World Bank, 2024" }
  ],
  "Japan": [
    { year: 2013, label: "Severe drought in western Japan; Yodo River basin restrictions", source: "Pacific Institute Water Conflict Chronology" }
  ],
  "South Korea": [
    { year: 2015, label: "Worst drought in 100 years; Han River basin water restrictions", source: "Pacific Institute Water Conflict Chronology" }
  ],
  "Turkey": [
    { year: 2021, label: "Istanbul reservoirs drop below 25%; water rationing in major cities", source: "Pacific Institute Water Conflict Chronology" }
  ],
  "Russia": [
    { year: 2010, label: "Worst drought in 130 years; 25% of wheat crop lost, export ban", source: "Pacific Institute Water Conflict Chronology" }
  ]
};

function cleanScarcityLevel(level) {
  return String(level ?? '').trim();
}

function scarcityColor(level) {
  return SCARCITY_COLORS[cleanScarcityLevel(level)] || '#e8eeef';
}

//
// 2. UTILITY HELPERS
//

const fmt = (v, d = 1) => (v == null || isNaN(+v)) ? '—' : (+v).toFixed(d);



function getRow(csvName, year) {
  if (!rawData || !csvName) return null;
  return rawData.find(d => d['Country'] === csvName && +d['Year'] === year) || null;
}



function getSeries(csvName) {
  if (!rawData || !csvName) return [];
  return rawData
    .filter(d => d['Country'] === csvName)
    .sort((a, b) => +a['Year'] - +b['Year']);
}

function linReg(series, key) {
  const n = series.length;
  const xs = series.map(d => +d['Year']);
  const ys = series.map(d => +d[key] || 0);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  return year => Math.max(0, slope * year + intercept);
}


function geoCsvName(feature) {
  const geoName = feature.properties.name || feature.properties.NAME || '';
  return GEO_NAME_TO_CSV[geoName] || geoName;
}

//
//3. STATUS BAR
//
function setStatus(msg, state = 'ok') {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (dot)  dot.className = `status-dot ${state}`;
  if (text) text.textContent = msg;
}

//
// 4. TIMELINE SLIDER
//
function initSlider() {
  const slider = document.getElementById('yearSlider');
  const label  = document.getElementById('yearLabel');
  if (!slider) return;

  updateSliderFill(slider);

  slider.addEventListener('input', function () {
    currentYear = +this.value;
    label.textContent = currentYear;
    updateSliderFill(this);
    updateDashboard(currentYear);
  });
}

function initPlayButton() {
  const btn    = document.getElementById('btn-play');
  const slider = document.getElementById('yearSlider');
  const label  = document.getElementById('yearLabel');
  if (!btn || !slider) return;

  btn.addEventListener('click', () => {
    if (isPlaying) {
      
      clearInterval(animTimer);
      animTimer = null;
      isPlaying = false;
      btn.classList.remove('playing');
      document.getElementById('play-icon').style.display  = '';
      document.getElementById('pause-icon').style.display = 'none';
    } else {

      if (+slider.value >= +slider.max) {
        slider.value = slider.min;
        currentYear = +slider.min;
      }
      isPlaying = true;
      btn.classList.add('playing');
      document.getElementById('play-icon').style.display  = 'none';
      document.getElementById('pause-icon').style.display = '';

      animTimer = setInterval(() => {
        const next = +slider.value + 1;
        if (next > +slider.max) {

          clearInterval(animTimer);
          animTimer = null;
          isPlaying = false;
          btn.classList.remove('playing');
          document.getElementById('play-icon').style.display  = '';
          document.getElementById('pause-icon').style.display = 'none';
          return;
        }
        slider.value = next;
        currentYear  = next;
        label.textContent = next;
        updateSliderFill(slider);
        updateDashboard(next);
      }, 600); 
    }
  });
}

function updateSliderFill(slider) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background = `linear-gradient(
    90deg,
    rgba(255,255,255,.85) 0%,
    rgba(255,255,255,.85) ${pct}%,
    rgba(255,255,255,.28) ${pct}%
  )`;
}



//
// 5. MAP — init skeleton then render with real data
//
function initMap() {
  const container = document.getElementById('map-viz');
  if (!container) return;

  const W = container.clientWidth  || 900;
  const H = container.clientHeight || 500;

  mapSvg = d3.select('#map-viz')
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('cursor', 'grab');

  projection = d3.geoNaturalEarth1()
    .fitExtent([[12, 12], [W - 12, H - 12]], { type: 'Sphere' });

  pathGenerator = d3.geoPath().projection(projection);

  
  mapSvg.append('rect')
    .attr('width', W).attr('height', H)
    .attr('fill', '#dff0f0');

  mapRoot = mapSvg.append('g').attr('class', 'map-root');


  mapRoot.append('path')
    .attr('class', 'graticule')
    .datum(d3.geoGraticule().step([20, 20])())
    .attr('d', pathGenerator)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(0,163,166,.14)')
    .attr('stroke-width', .4);


    mapRoot.append('path')
    .attr('class', 'sphere-outline')
    .datum({ type: 'Sphere' })
    .attr('d', pathGenerator)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(0,163,166,.35)')
    .attr('stroke-width', .8);

  // Country paths group (populated by renderMapForYear)
  mapRoot.append('g').attr('class', 'countries');

  // Loading text (outside map-root so it's never zoomed)
  mapSvg.append('text')
    .attr('class', 'map-loading-text')
    .attr('x', W / 2).attr('y', H / 2)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)')
    .attr('font-size', 11)
    .attr('fill', '#7a95a0')
    .attr('letter-spacing', '.06em')
    .text('Loading geographic data…');


    zoomBehavior = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [W, H]])
    .on('zoom', (event) => {
      mapRoot.attr('transform', event.transform);

      mapRoot.selectAll('path.country')
        .attr('stroke-width', 0.5 / event.transform.k);
      mapSvg.style('cursor', event.transform.k > 1 ? 'grabbing' : 'grab');
    });

  mapSvg
    .call(zoomBehavior)
    // Prevent double-click from zooming (we use it to reset)
    .on('dblclick.zoom', null);


  mapSvg.on('dblclick', (event) => {
    if (event.target.tagName === 'rect') {   // only on the ocean bg
      resetZoom();
    }
  });


  tooltipEl = d3.select('body').append('div').attr('class', 'tooltip');


  d3.select('#map-legend')
    .append('span')
    .style('font-size', '.60rem')
    .style('color', 'var(--ink-3)')
    .text('Water Scarcity:');

  const levels = [
    { label: 'Low',      color: '#c8eced' },
    { label: 'Moderate', color: '#6dbfc0' },
    { label: 'High',     color: '#00636a' },
  ];

  levels.forEach(l => {
    const item = d3.select('#map-legend').append('span')
      .style('display', 'inline-flex')
      .style('align-items', 'center')
      .style('gap', '3px')
      .style('font-size', '.58rem')
      .style('color', 'var(--ink-3)');
    item.append('span')
      .style('display', 'inline-block')
      .style('width', '10px').style('height', '10px')
      .style('border-radius', '2px')
      .style('background', l.color);
    item.append('span').text(l.label);
  });

  console.log('[AquaViz] initMap() — SVG + zoom ready.');
}

//
//5b. ZOOM HELPERS
//

function zoomToCountry(feature) {
  if (!mapSvg || !zoomBehavior || !pathGenerator) return;

  const container = document.getElementById('map-viz');
  const W = container.clientWidth  || 900;
  const H = container.clientHeight || 500;

  const [[x0, y0], [x1, y1]] = pathGenerator.bounds(feature);
  const dx = x1 - x0;
  const dy = y1 - y0;

  if (dx === 0 || dy === 0) return;


  const scale = Math.min(8, 0.7 / Math.max(dx / W, dy / H));
  const tx    = W / 2 - scale * (x0 + x1) / 2;
  const ty    = H / 2 - scale * (y0 + y1) / 2;

  mapSvg.transition().duration(700).ease(d3.easeCubicInOut)
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
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

  const paths = g.selectAll('path.country')
    .data(geoData.features, d => d.properties.name);

  const entered = paths.enter()
    .append('path')
    .attr('d', pathGenerator)
    .attr('class', 'country');

  paths.exit().remove();

  const allPaths = entered.merge(paths);

  allPaths
    .on('mouseover', (event, d) => {
      const csvName = geoCsvName(d);

      
      const row = getRow(csvName, currentYear);

      showTooltip(event, csvName, row);
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave', hideTooltip)
    .on('click', (event, d) => {
      const csvName = geoCsvName(d);
      const row = getRow(csvName, currentYear);
      if (!row) return;

      if (event.shiftKey && selectedCountry && csvName !== selectedCountry) {
        
        compareCountry = csvName;
        enterCompareMode();
      } else {
        
        exitCompareMode();
        selectCountry(csvName, d);
      }
    });

  allPaths
    .transition()
    .duration(350)
    .attr('fill', d => {
      const row = getRow(geoCsvName(d), year);
      if (!row) return '#e8eeef';

      return scarcityColor(row['Water Scarcity Level']);
    })
    .attr('class', d => {
      const csvName = geoCsvName(d);
      const row = getRow(csvName, year);
      const sel = csvName === selectedCountry ? ' selected' : '';

      return `country${row ? '' : ' country--nodata'}${sel}`;
    });
}


   
//
// 6. TOOLTIP
//

function showTooltip(event, csvName, row) {
  if (!tooltipEl) return;
  tooltipEl
    .html(`
      <span class="tooltip-name">${csvName}</span>
      <span class="tooltip-value">
        ${row
          ? `${row['Water Scarcity Level']} scarcity
             &nbsp;·&nbsp;
             ${fmt(row['Total Water Consumption (Billion Cubic Meters)'], 1)} bn m³/yr`
          : 'No data for this year'}
      </span>
    `)
    .classed('visible', true);
  moveTooltip(event);
}

function showEventTooltip(event, year, label, source) {
  if (!tooltipEl) return;
  tooltipEl
    .html(`
      <span class="tooltip-name" style="color:#e07b39">⚡ ${year}</span>
      <span class="tooltip-value">${label}</span>
      ${source ? `<span class="tooltip-source">${source}</span>` : ''}
    `)
    .classed('visible', true);
  moveTooltip(event);
}


function moveTooltip(event) {
  if (!tooltipEl) return;
  const tooltipW = tooltipEl.node().offsetWidth;
  const overflowsRight = event.clientX + 14 + tooltipW > window.innerWidth;
  tooltipEl
    .style('left', overflowsRight
      ? `${event.clientX - tooltipW - 14}px`
      : `${event.clientX + 14}px`)
    .style('top', `${event.clientY - 36}px`);
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.classed('visible', false);
}

//
// 7. CHARTS
//

function initCharts() {
  _initDoughnut();
  _initBars();
  console.log('[AquaViz] initCharts() — skeletons ready.');
}


function _initDoughnut() {
  const el = document.getElementById('doughnut-chart');
  if (!el) return;

  const W = el.clientWidth || 270;
  const H = el.clientHeight || 185;

  const cx = W / 2;
  const cy = H * 0.43;
  const R = Math.min(W * 0.34, H * 0.33);

  const svg = d3.select('#doughnut-chart')
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  svg.append('circle')
    .attr('class', 'donut-placeholder')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', R)
    .attr('fill', 'none')
    .attr('stroke', '#dce8ea')
    .attr('stroke-width', R * 0.38)
    .attr('stroke-dasharray', '6 4');

  svg.append('circle')
    .attr('class', 'donut-placeholder')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', R * 0.58)
    .attr('fill', 'var(--surface-2)');

  svg.append('text')
    .attr('class', 'donut-placeholder')
    .attr('x', cx)
    .attr('y', cy - 5)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)')
    .attr('font-size', 9)
    .attr('fill', '#b0c4cb')
    .attr('letter-spacing', '.05em')
    .text('SELECT');

  svg.append('text')
    .attr('class', 'donut-placeholder')
    .attr('x', cx)
    .attr('y', cy + 8)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)')
    .attr('font-size', 9)
    .attr('fill', '#b0c4cb')
    .attr('letter-spacing', '.05em')
    .text('COUNTRY');

}


function renderDoughnut(row) {
  const svg = d3.select('#doughnut-chart svg');
  if (svg.empty() || !row) return;


  svg.selectAll('.donut-arc, .donut-centre, .donut-placeholder').remove();

  const el  = document.getElementById('doughnut-chart');
  const W   = el.clientWidth || 270, H = el.clientHeight || 185;
  const cx = W / 2;
  const cy = H * 0.43;
  const outerR = Math.min(W * 0.34, H * 0.33);
  const innerR = outerR * 0.58;

  const pieData = SECTORS.map(s => ({
    label: s.label,
    color: s.color,
    value: +row[s.key] || 0,
  }));

  const pie = d3.pie().value(d => d.value).sort(null).padAngle(.03);
  const arc = d3.arc().innerRadius(innerR).outerRadius(outerR).cornerRadius(2);

  const labelArc = d3.arc().innerRadius(innerR + (outerR - innerR) * 0.55).outerRadius(innerR + (outerR - innerR) * 0.55);

  const g = svg.append('g')
    .attr('class', 'donut-arc')
    .attr('transform', `translate(${cx},${cy})`);

  const arcs = pie(pieData);


  g.selectAll('path')
    .data(arcs)
    .enter().append('path')
    .attr('d', arc)
    .attr('fill', d => d.data.color)
    .attr('opacity', .82)
    .on('mouseover', function (event, d) {
      d3.select(this).attr('opacity', 1).attr('stroke', 'white').attr('stroke-width', 1.5);

      g.selectAll('.arc-label').filter(l => l === d)
        .attr('font-weight', 700).attr('font-size', 10);
    })
    .on('mouseleave', function (event, d) {
      d3.select(this).attr('opacity', .82).attr('stroke', 'none');
      g.selectAll('.arc-label').filter(l => l === d)
        .attr('font-weight', 500).attr('font-size', 9);
    });


    g.selectAll('.arc-label')
    .data(arcs)
    .enter().append('text')
    .attr('class', 'arc-label')
    .attr('transform', d => `translate(${labelArc.centroid(d)})`)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', 'var(--font-mono)')
    .attr('font-size', 9)
    .attr('font-weight', 500)
    .attr('fill', 'white')
    .attr('pointer-events', 'none') 
    

    .text(d => d.data.value >= 8 ? `${d.data.value.toFixed(0)}%` : '');


  const total = row['Total Water Consumption (Billion Cubic Meters)'];
  const centre = svg.append('g').attr('class', 'donut-centre')
    .attr('transform', `translate(${cx},${cy})`);

  centre.append('text')
    .attr('text-anchor', 'middle').attr('dy', '-.1em')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 14).attr('font-weight', 600)
    .attr('fill', 'var(--brand)')
    .text(fmt(total, 0));

  centre.append('text')
    .attr('text-anchor', 'middle').attr('dy', '1.15em')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 7)
    .attr('fill', 'var(--ink-3)')
    .text('bn m³/yr');

}

// Bar chart skeleton
function _initBars() {
  const el = document.getElementById('bar-chart');
  if (!el) return;

  const W = el.clientWidth || 270, H = el.clientHeight || 185;
  const m = { top: 14, right: 10, bottom: 26, left: 38 };
  const iW = W - m.left - m.right, iH = H - m.top - m.bottom;

  el.dataset.m = JSON.stringify(m);

  const svg = d3.select('#bar-chart')
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const g = svg.append('g').attr('class', 'bar-g')
    .attr('transform', `translate(${m.left},${m.top})`);

  const xScale = d3.scaleBand()
    .domain(d3.range(2000, 2025).map(String))
    .range([0, iW]).padding(.25);

  const yScale = d3.scaleLinear().domain([0, 500]).range([iH, 0]);

  g.append('g').attr('class', 'axis axis--x')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(xScale)
      .tickValues(['2000','2005','2010','2015','2020','2024'])
      .tickSize(3));

  g.append('g').attr('class', 'axis axis--y')
    .call(d3.axisLeft(yScale).ticks(4).tickSize(3));

  g.append('text')
    .attr('transform', 'rotate(-90)').attr('x', -iH / 2).attr('y', -30)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 7)
    .attr('fill', '#b0c4cb')
    .text('Litres / person / day');

  g.append('text').attr('class', 'bar-placeholder')
    .attr('x', iW / 2).attr('y', iH / 2)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 9)
    .attr('fill', '#b0c4cb').attr('letter-spacing', '.04em')
    .text('No country selected');
}

// Bar chart render with real data
function renderBars(csvName) {
  const el  = document.getElementById('bar-chart');
  const svg = d3.select('#bar-chart svg');
  if (!el || svg.empty()) return;

  const m  = JSON.parse(el.dataset.m || '{"top":14,"right":10,"bottom":26,"left":38}');
  const W  = el.clientWidth || 270, H = el.clientHeight || 185;
  const iW = W - m.left - m.right, iH = H - m.top - m.bottom;
  const g  = svg.select('g.bar-g');
  if (g.empty()) return;

  g.selectAll('.bar, .bar-placeholder, .year-line, .events-g, .pred-bar').remove();

  const series = getSeries(csvName);
  if (!series.length) return;

  
  const predYears = [2025, 2026, 2027, 2028, 2029, 2030];
  const recentSeries = series.filter(d => +d['Year'] >= 2020);
  const predictFn = linReg(recentSeries.length >= 3 ? recentSeries : series, 'Per Capita Water Use (Liters per Day)');
  const predSeries = predYears.map(y => ({
    Year: String(y),
    'Per Capita Water Use (Liters per Day)': predictFn(y),
    _predicted: true
  }));

  const allSeries = [...series, ...predSeries];

  const xScale = d3.scaleBand()
    .domain(allSeries.map(d => String(+d['Year'])))
    .range([0, iW]).padding(.2);

  const yMax = d3.max(allSeries, d => +d['Per Capita Water Use (Liters per Day)'] || 0) * 1.15 || 500;
  const yScale = d3.scaleLinear().domain([0, yMax]).range([iH, 0]);

  g.select('.axis--x').transition().duration(350)
    .call(d3.axisBottom(xScale)
      .tickValues(['2000','2005','2010','2015','2020','2024','2030'])
      .tickSize(3));

  g.select('.axis--y').transition().duration(350)
    .call(d3.axisLeft(yScale).ticks(4).tickSize(3));

  
  const sepX = xScale('2025');
  if (sepX != null) {
    g.append('line').attr('class', 'year-line')
      .attr('x1', sepX).attr('x2', sepX)
      .attr('y1', 0).attr('y2', iH)
      .attr('stroke', 'var(--ink-4)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')
      .attr('opacity', .5);
    g.append('text')
      .attr('class', 'year-line')
      .attr('x', sepX + 3).attr('y', 10)
      .attr('font-family', 'var(--font-mono)').attr('font-size', 7)
      .attr('fill', 'var(--ink-4)')
      .text('forecast →');
  }

  
  g.selectAll('.bar')
    .data(allSeries)
    .enter().append('rect')
    .attr('class', d => {
      const y = +d['Year'];
      if (d._predicted) return 'bar predicted';
      return `bar${y === currentYear ? ' current-year' : ''}`;
    })
    .attr('x',      d => xScale(String(+d['Year'])))
    .attr('y',      d => yScale(+d['Per Capita Water Use (Liters per Day)'] || 0))
    .attr('width',  xScale.bandwidth())
    .attr('height', d => iH - yScale(+d['Per Capita Water Use (Liters per Day)'] || 0))
    .attr('rx', 2)
    .on('mouseover', function (event, d) {
      d3.select(this).attr('opacity', 1);
      const label = d._predicted ? `${csvName} · ${+d['Year']} (forecast)` : `${csvName} · ${+d['Year']}`;
      showTooltip(event, label, d._predicted ? null : d);
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave', function (event, d) {
      const isPred = d._predicted;
      const isCurrent = +d['Year'] === currentYear;
      d3.select(this).attr('opacity', isPred ? .35 : isCurrent ? 1 : .65);
      hideTooltip();
    });

  // Dashed line for current year
  const cx = xScale(String(currentYear));
  if (cx != null) {
    g.append('line').attr('class', 'year-line')
      .attr('x1', cx + xScale.bandwidth() / 2)
      .attr('x2', cx + xScale.bandwidth() / 2)
      .attr('y1', 0).attr('y2', iH)
      .attr('stroke', 'var(--brand)').attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3').attr('opacity', .5);
  }
  // Historical events 
  const events = WATER_EVENTS[csvName] || [];

  if (events.length) {
    const evtGroup = g.append('g').attr('class', 'events-g');

    events.forEach((evt) => {
      const ex = xScale(String(evt.year));  
      if (ex == null) return;              
      const ecx = ex + xScale.bandwidth() / 2;  

      evtGroup.append('line')
        .attr('x1', ecx).attr('x2', ecx)   
        .attr('y1', 0).attr('y2', iH)
        .attr('stroke', '#e07b39')
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '4 3')
        .attr('opacity', 0.85);

      evtGroup.append('circle')
        .attr('cx', ecx).attr('cy', 6)
        .attr('r', 5)
        .attr('fill', '#e07b39')
        .attr('cursor', 'pointer')
        .on('mouseover', (event) => {
          showEventTooltip(event, evt.year, evt.label, evt.source);
        })
        .on('mousemove', moveTooltip)
        .on('mouseleave', hideTooltip);
    });
  }
}

// COUNTRY SELECTION
function selectCountry(csvName, geoFeature = null) {
  selectedCountry = csvName;

  document.getElementById('selected-country').textContent = csvName;

  // Highlight on map
  if (mapSvg) {
    mapSvg.selectAll('path.country')
      .classed('selected', d => geoCsvName(d) === csvName);
  }

  // Zoom to the country if feature provided
  if (geoFeature) zoomToCountry(geoFeature);

  const row = getRow(csvName, currentYear);
  document.getElementById('kpi-total').textContent =
    fmt(row?.['Total Water Consumption (Billion Cubic Meters)']);
  document.getElementById('kpi-pop').textContent =
    fmt(row?.['Per Capita Water Use (Liters per Day)'], 0);
  document.getElementById('kpi-stress').textContent =
    row?.['Water Scarcity Level'] ?? '—';


  renderDoughnut(row);
  renderBars(csvName);
}

function clearSelection() {
  exitCompareMode();
  selectedCountry = null;
  document.getElementById('selected-country').textContent = 'Select a country';
  ['kpi-total', 'kpi-stress', 'kpi-pop'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  if (mapSvg) mapSvg.selectAll('path.country').classed('selected', false);


  resetZoom();

  d3.select('#doughnut-chart').selectAll('*').remove();
  d3.select('#bar-chart').selectAll('*').remove();
  _initDoughnut();
  _initBars();
}

//
// 9. CENTRAL UPDATE
//

function updateDashboard(year) {
  currentYear = year;
  const mapYear = Math.min(year, 2024);
  renderMapForYear(mapYear);
  if (compareCountry && selectedCountry) {
    renderComparePanel();
  } else if (selectedCountry) {
    selectCountry(selectedCountry);
  }
  const label = document.getElementById('yearLabel');
  if (year > 2024) {
    label.style.color = 'rgba(255,255,255,0.5)';
    label.style.fontStyle = 'italic';
  } else {
    label.style.color = '';
    label.style.fontStyle = '';
  }
}

//
// 10. DATA LOADING
//
   
   
function loadData() {
  setStatus('Loading data…', 'loading');

  const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
  const CSV_URL = 'cleaned_global_water_consumption.csv';

  Promise.all([
    d3.json(GEO_URL),                             
    d3.csv(CSV_URL),                              
    
  ])
  .then(([world, data]) => {


    geoData = topojson.feature(world, world.objects.countries);

    
    return d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(w => {
        
        attachCountryNames(geoData);
        rawData = data;
        setStatus(`${data.length} records loaded · ${geoData.features.length} countries`, 'ok');
        console.log('[AquaViz] Data ready.', { csvRows: data.length, geoFeatures: geoData.features.length });
        initMap();
        initCharts();
        initPlayButton();
        updateDashboard(currentYear);
      });
  })
  .catch(err => {
    console.error('[AquaViz] Load error:', err);
    setStatus('Error loading data — check console', 'error');
    initMap();
    initCharts();
  });
}



function attachCountryNames(featureCollection) {
  
  const NAME_BY_ID = {
     4:'Afghanistan',8:'Albania',12:'Algeria',24:'Angola',32:'Argentina',
    36:'Australia',40:'Austria',50:'Bangladesh',56:'Belgium',68:'Bolivia',
    76:'Brazil',100:'Bulgaria',116:'Cambodia',120:'Cameroon',124:'Canada',
    152:'Chile',156:'China',170:'Colombia',180:'Congo (Kinshasa)',188:'Costa Rica',
    191:'Croatia',192:'Cuba',203:'Czech Republic',208:'Denmark',218:'Ecuador',
    818:'Egypt',222:'El Salvador',231:'Ethiopia',246:'Finland',250:'France',
    266:'Gabon',276:'Germany',288:'Ghana',300:'Greece',320:'Guatemala',
    332:'Haiti',340:'Honduras',348:'Hungary',356:'India',360:'Indonesia',
    364:'Iran',368:'Iraq',372:'Ireland',376:'Israel',380:'Italy',
    388:'Jamaica',392:'Japan',400:'Jordan',398:'Kazakhstan',404:'Kenya',
    408:'North Korea',410:'South Korea',414:'Kuwait',418:'Laos',422:'Lebanon',
    434:'Libya',504:'Morocco',484:'Mexico',516:'Namibia',524:'Nepal',
    528:'Netherlands',554:'New Zealand',566:'Nigeria',578:'Norway',
    586:'Pakistan',591:'Panama',604:'Peru',608:'Philippines',616:'Poland',
    620:'Portugal',630:'Puerto Rico',642:'Romania',643:'Russia',
    682:'Saudi Arabia',686:'Senegal',694:'Sierra Leone',705:'Slovenia',
    706:'Somalia',710:'South Africa',728:'South Sudan',724:'Spain',
    729:'Sudan',752:'Sweden',756:'Switzerland',760:'Syria',762:'Tajikistan',
    764:'Thailand',768:'Togo',780:'Trinidad and Tobago',788:'Tunisia',
    792:'Turkey',800:'Uganda',804:'Ukraine',784:'United Arab Emirates',
    826:'United Kingdom',840:'United States of America',858:'Uruguay',
    860:'Uzbekistan',862:'Venezuela',704:'Vietnam',887:'Yemen',
    894:'Zambia',716:'Zimbabwe',
  };

  featureCollection.features.forEach(f => {
    const id = +f.id;
    if (!f.properties) f.properties = {};
    if (!f.properties.name) {
      f.properties.name = NAME_BY_ID[id] || `Country_${id}`;
    }
  });
}

//
// COMPARE MODE
//
function enterCompareMode() {

  if (mapSvg) {
    mapSvg.selectAll('path.country')
      .classed('selected',  d => geoCsvName(d) === selectedCountry)
      .classed('selected2', d => geoCsvName(d) === compareCountry);
  }

  document.getElementById('side-panel').style.display    = 'none';
  document.getElementById('compare-panel').style.display = 'flex';
  renderComparePanel();
}

function exitCompareMode() {
  compareCountry = null;
  document.getElementById('side-panel').style.display    = '';
  document.getElementById('compare-panel').style.display = 'none';
  if (mapSvg) {
    mapSvg.selectAll('path.country').classed('selected2', false);
  }
}

function renderComparePanel() {
  if (!selectedCountry || !compareCountry) return;
  const A = selectedCountry;
  const B = compareCountry;
  const rowA = getRow(A, Math.min(currentYear, 2024));
  const rowB = getRow(B, Math.min(currentYear, 2024));

  document.getElementById('cmp-name-a').textContent = A;
  document.getElementById('cmp-name-b').textContent = B;

  document.getElementById('cmp-total-a').textContent = fmt(rowA?.['Total Water Consumption (Billion Cubic Meters)']);
  document.getElementById('cmp-total-b').textContent = fmt(rowB?.['Total Water Consumption (Billion Cubic Meters)']);
  document.getElementById('cmp-pop-a').textContent   = fmt(rowA?.['Per Capita Water Use (Liters per Day)'], 0);
  document.getElementById('cmp-pop-b').textContent   = fmt(rowB?.['Per Capita Water Use (Liters per Day)'], 0);
  document.getElementById('cmp-stress-a').textContent = rowA?.['Water Scarcity Level'] ?? '—';
  document.getElementById('cmp-stress-b').textContent = rowB?.['Water Scarcity Level'] ?? '—';
  document.getElementById('cmp-leg-a').textContent = A;
  document.getElementById('cmp-leg-b').textContent = B;

  renderCompareDonut('cmp-donut-a', rowA);
  renderCompareDonut('cmp-donut-b', rowB);

  renderCompareBars(A, B);
}

function renderCompareDonut(containerId, row) {
  const el = document.getElementById(containerId);
  if (!el) return;
  d3.select(`#${containerId}`).selectAll('*').remove();

  const W = el.clientWidth || 130, H = el.clientHeight || 130;
  const R = Math.min(W, H) / 2 - 8;
  const svg = d3.select(`#${containerId}`).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  if (!row) {
    svg.append('text').attr('x', W/2).attr('y', H/2)
      .attr('text-anchor', 'middle').attr('font-size', 9)
      .attr('fill', '#b0c4cb').text('No data');
    return;
  }

  const data = SECTORS.map(s => ({ label: s.label, value: +row[s.key] || 0, color: s.color }));
  const pie  = d3.pie().value(d => d.value).sort(null);
  const arc  = d3.arc().innerRadius(R * 0.55).outerRadius(R);
  const g    = svg.append('g').attr('transform', `translate(${W/2},${H/2})`);

  g.selectAll('path').data(pie(data)).enter().append('path')
    .attr('d', arc)
    .attr('fill', d => d.data.color)
    .attr('stroke', 'white').attr('stroke-width', 1.5);

  const total = +row['Total Water Consumption (Billion Cubic Meters)'] || 0;
  g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 11).attr('font-weight', 600)
    .attr('fill', 'var(--ink)').text(fmt(total, 0));
  g.append('text').attr('text-anchor', 'middle').attr('dy', '1em')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 7)
    .attr('fill', 'var(--ink-3)').text('bn m³/yr');
}

function renderCompareBars(nameA, nameB) {
  const el = document.getElementById('cmp-bars');
  if (!el) return;
  d3.select('#cmp-bars').selectAll('*').remove();

  const W = el.clientWidth || 560, H = el.clientHeight || 160;
  const m = { top: 16, right: 12, bottom: 28, left: 42 };
  const iW = W - m.left - m.right, iH = H - m.top - m.bottom;

  const seriesA = getSeries(nameA);
  const seriesB = getSeries(nameB);
  if (!seriesA.length || !seriesB.length) return;

  const years = seriesA.map(d => String(+d['Year']));
  const key   = 'Per Capita Water Use (Liters per Day)';

  const xScale = d3.scaleBand().domain(years).range([0, iW]).padding(.15);
  const inner  = d3.scaleBand().domain(['A','B']).range([0, xScale.bandwidth()]).padding(.08);
  const yMax   = d3.max([...seriesA, ...seriesB], d => +d[key] || 0) * 1.15 || 500;
  const yScale = d3.scaleLinear().domain([0, yMax]).range([iH, 0]);

  const svg = d3.select('#cmp-bars').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  g.append('g').attr('class', 'axis axis--x')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(xScale)
      .tickValues(years.filter(y => +y % 5 === 0))
      .tickSize(3));

  g.append('g').attr('class', 'axis axis--y')
    .call(d3.axisLeft(yScale).ticks(4).tickSize(3));


  g.selectAll('.bar-a').data(seriesA).enter().append('rect')
    .attr('class', 'bar-a')
    .attr('x', d => xScale(String(+d['Year'])) + inner('A'))
    .attr('y', d => yScale(+d[key] || 0))
    .attr('width', inner.bandwidth())
    .attr('height', d => iH - yScale(+d[key] || 0))
    .attr('fill', 'var(--brand)').attr('opacity', .75).attr('rx', 1);

  
  g.selectAll('.bar-b').data(seriesB).enter().append('rect')
    .attr('class', 'bar-b')
    .attr('x', d => xScale(String(+d['Year'])) + inner('B'))
    .attr('y', d => yScale(+d[key] || 0))
    .attr('width', inner.bandwidth())
    .attr('height', d => iH - yScale(+d[key] || 0))
    .attr('fill', '#e07b39').attr('opacity', .75).attr('rx', 1);

  
  const cx = xScale(String(Math.min(currentYear, 2024)));
  if (cx != null) {
    g.append('line').attr('x1', cx).attr('x2', cx)
      .attr('y1', 0).attr('y2', iH)
      .attr('stroke', 'var(--brand)').attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3').attr('opacity', .5);
  }
}


//
//  11. BOOTSTRAP
//
document.addEventListener('DOMContentLoaded', () => {
  initSlider();
  document.getElementById('btn-clear')?.addEventListener('click', clearSelection);
  document.getElementById('btn-exit-compare')?.addEventListener('click', () => {
    exitCompareMode();
    clearSelection();
  }); 
  loadData();

  console.log('[AquaViz] Dashboard initialised.');
});

