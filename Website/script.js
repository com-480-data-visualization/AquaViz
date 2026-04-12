// Constantes globales
let currentYear = 2024;
let rawData = [];

// manage year slider input
document.getElementById('yearSlider').addEventListener('input', function(e) {
    currentYear = e.target.value;
    document.getElementById('yearLabel').textContent = currentYear;
    
    // Update the map and charts based on the new year
    updateMap(currentYear);
    updateCharts(currentYear);
});

// Init Functions

function initMap() { 
    // Initializing the map visualization
}

function initCharts() {
    // Initializing the doughnut and bar charts
}

// Update Functions
function updateMap(year) {
    // Update the map visualization based on the selected year
}

function updateCharts(year, country = null) {
    // Update the doughnut and bar charts based on the selected year and optionally a country
}

