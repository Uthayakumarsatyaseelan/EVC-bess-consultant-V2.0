let csvData = [];
let chart = null;

document.getElementById('csvFile').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function(results) {
                csvData = results.data;
                processData(csvData);
            },
            error: function(error) {
                alert('Error parsing file: ' + error.message);
            }
        });
    }
});

// Process CSV data and prepare chart
function processData(data) {
    const days = getUniqueDays(data);
    const datasets = [];

    days.forEach((day, idx) => {
        const dayData = data.filter(row => row.Day === day);
        const timeSeries = dayData.map(row => ({ x: convertTimeToMinutes(row.Time), y: row.Data }));
        
        datasets.push({
            label: day,
            data: timeSeries,
            borderColor: getColor(idx),
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
        });
    });

    renderChart(datasets);
}

// Render the chart using Chart.js
function renderChart(datasets) {
    const ctx = document.getElementById('chart').getContext('2d');
    
    if (chart) {
        chart.destroy(); // Destroy the old chart if it exists
    }

    chart = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Time (minutes)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Data (kW)'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: function(tooltipItem) {
                            return convertMinutesToTime(tooltipItem[0].raw.x);
                        }
                    }
                }
            }
        });
}

// Convert time in HH:MM to minutes
function convertTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Convert minutes to HH:MM format
function convertMinutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// Get unique days from data
function getUniqueDays(data) {
    return [...new Set(data.map(row => row.Day))];
}

// Get color for each dataset
function getColor(index) {
    const colors = ['#1e40af', '#dc2626', '#059669', '#d97706', '#7c2d12'];
    return colors[index % colors.length];
}

// Apply peak capping function
function applyPeakCapping() {
    // Implement the peak capping logic
    const capValue = prompt('Enter the peak cap value (kW):');
    if (capValue) {
        csvData.forEach(row => {
            if (row.Data > capValue) {
                row.Data = capValue;
            }
        });
        processData(csvData); // Re-render chart with capped data
    }
}

// Show best day based on peak values
function showBestDay() {
    // Calculate the best day based on the highest peak
    let bestDay = '';
    let highestPeak = -Infinity;
    csvData.forEach(row => {
        const dayPeak = getPeakForDay(row.Day);
        if (dayPeak > highestPeak) {
            highestPeak = dayPeak;
            bestDay = row.Day;
        }
    });

    alert('The best day is: ' + bestDay);
}

// Show worst day based on peak values
function showWorstDay() {
    // Calculate the worst day based on the lowest peak
    let worstDay = '';
    let lowestPeak = Infinity;
    csvData.forEach(row => {
        const dayPeak = getPeakForDay(row.Day);
        if (dayPeak < lowestPeak) {
            lowestPeak = dayPeak;
            worstDay = row.Day;
        }
    });

    alert('The worst day is: ' + worstDay);
}

// Helper function to calculate peak for a day
function getPeakForDay(day) {
    const dayData = csvData.filter(row => row.Day === day);
    return Math.max(...dayData.map(row => row.Data));
}
