
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


const SCARCITY_TO_NUM = {
  'Low':      20,
  'Moderate': 55,
  'High':     100,
};

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


  colorScale = d3.scaleSequential()
    .domain([0, 100])
    .interpolator(d3.interpolate('#c8eced', '#00636a'));

  const g = mapRoot.select('g.countries');

  const paths = g.selectAll('path.country')
    .data(geoData.features, d => d.properties.name);


    const entered = paths.enter()
    .append('path')
    .attr('d', pathGenerator)
    .attr('class', d => {
      const csvName = geoCsvName(d);
      const row = getRow(csvName, year);
      const sel = csvName === selectedCountry ? ' selected' : '';
      return `country${row ? '' : ' country--nodata'}${sel}`;
    })
    .attr('fill', d => {
      const row = getRow(geoCsvName(d), year);
      if (!row) return '#e8eeef';
      const num = SCARCITY_TO_NUM[row['Water Scarcity Level']] ?? 40;
      return colorScale(num);
    })
    .on('mouseover', (event, d) => {
      const csvName = geoCsvName(d);
      const row = getRow(csvName, year);
      showTooltip(event, csvName, row);
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave', hideTooltip)
    .on('click', (event, d) => {
      const csvName = geoCsvName(d);
      const row = getRow(csvName, year);
      if (row) selectCountry(csvName, d);
    });

    
  paths.merge(entered)
    .transition().duration(350)
    .attr('fill', d => {
      const row = getRow(geoCsvName(d), year);
      if (!row) return '#e8eeef';
      const num = SCARCITY_TO_NUM[row['Water Scarcity Level']] ?? 40;
      return colorScale(num);
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

function moveTooltip(event) {
  if (!tooltipEl) return;
  tooltipEl
    .style('left', `${event.clientX + 14}px`)
    .style('top',  `${event.clientY - 36}px`);
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

  const W = el.clientWidth || 270, H = el.clientHeight || 185;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 20;

  const svg = d3.select('#doughnut-chart')
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  svg.append('circle')
    .attr('class', 'donut-placeholder')
    .attr('cx', cx).attr('cy', cy).attr('r', R)
    .attr('fill', 'none')
    .attr('stroke', '#dce8ea')
    .attr('stroke-width', R * 0.38)
    .attr('stroke-dasharray', '6 4');

  svg.append('circle')
    .attr('class', 'donut-placeholder')
    .attr('cx', cx).attr('cy', cy).attr('r', R * 0.58)
    .attr('fill', 'var(--surface-2)');

  svg.append('text')
    .attr('class', 'donut-placeholder')
    .attr('x', cx).attr('y', cy - 5).attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 9)
    .attr('fill', '#b0c4cb').attr('letter-spacing', '.05em')
    .text('SELECT');

  svg.append('text')
    .attr('class', 'donut-placeholder')
    .attr('x', cx).attr('y', cy + 8).attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-mono)').attr('font-size', 9)
    .attr('fill', '#b0c4cb').attr('letter-spacing', '.05em')
    .text('COUNTRY');

  const legendX = W - 82, startY = cy - 18;
  SECTORS.forEach((s, i) => {
    const g = svg.append('g').attr('transform', `translate(${legendX},${startY + i * 16})`);
    g.append('rect').attr('width', 8).attr('height', 8).attr('rx', 2)
      .attr('fill', s.color).attr('opacity', .75);
    g.append('text').attr('x', 12).attr('y', 7)
      .attr('font-family', 'var(--font-mono)').attr('font-size', 7.5)
      .attr('fill', '#7a95a0')
      .text(s.label);
  });
}


function renderDoughnut(row) {
  const svg = d3.select('#doughnut-chart svg');
  if (svg.empty() || !row) return;


  svg.selectAll('.donut-arc, .donut-centre, .donut-placeholder').remove();

  const el  = document.getElementById('doughnut-chart');
  const W   = el.clientWidth || 270, H = el.clientHeight || 185;
  const cx  = W / 2, cy = H / 2;
  const outerR = Math.min(W, H) / 2 - 20;
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

  g.selectAll('.bar, .bar-placeholder, .year-line').remove();

  const series = getSeries(csvName);
  if (!series.length) return;

  const xScale = d3.scaleBand()
    .domain(series.map(d => String(+d['Year'])))
    .range([0, iW]).padding(.2);

  // Per Capita Water Use (Liters per Day)
  const yMax = d3.max(series, d => +d['Per Capita Water Use (Liters per Day)'] || 0) * 1.15 || 500;
  const yScale = d3.scaleLinear().domain([0, yMax]).range([iH, 0]);

  g.select('.axis--x').transition().duration(350)
    .call(d3.axisBottom(xScale)
      .tickValues(series.filter(d => +d['Year'] % 5 === 0).map(d => String(+d['Year'])))
      .tickSize(3));

  g.select('.axis--y').transition().duration(350)
    .call(d3.axisLeft(yScale).ticks(4).tickSize(3));

  // Draw bars
  g.selectAll('.bar')
    .data(series)
    .enter().append('rect')
    .attr('class', d => `bar${+d['Year'] === currentYear ? ' current-year' : ''}`)
    .attr('x',      d => xScale(String(+d['Year'])))
    .attr('y',      d => yScale(+d['Per Capita Water Use (Liters per Day)'] || 0))
    .attr('width',  xScale.bandwidth())
    .attr('height', d => iH - yScale(+d['Per Capita Water Use (Liters per Day)'] || 0))
    .attr('rx', 2)
    .on('mouseover', function (event, d) {
      d3.select(this).attr('opacity', 1);
      showTooltip(event, `${csvName} · ${+d['Year']}`, d);
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave', function (event, d) {
      d3.select(this).attr('opacity', +d['Year'] === currentYear ? 1 : .65);
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
  renderMapForYear(year);

  if (selectedCountry) {
    selectCountry(selectedCountry);
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
//  11. BOOTSTRAP
//
document.addEventListener('DOMContentLoaded', () => {
  initSlider();
  document.getElementById('btn-clear')?.addEventListener('click', clearSelection);

  loadData();

  console.log('[AquaViz] Dashboard initialised.');
});
