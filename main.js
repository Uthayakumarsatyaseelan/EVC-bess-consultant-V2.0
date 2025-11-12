// Use PapaParse for CSV and SheetJS for XLSX
document.getElementById('csvFile').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: function(results) {
                    csvData = results.data;
                    processData(csvData);  // Process the data for charting
                },
                error: function(error) {
                    alert('Error parsing CSV file: ' + error.message);
                }
            });
        } else if (file.name.endsWith('.xlsx')) {
            // Parse XLSX file using SheetJS (if required)
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = e.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(sheet);
                csvData = jsonData;
                processData(csvData);
            };
            reader.readAsBinaryString(file);
        } else {
            alert('Please upload a CSV or XLSX file.');
        }
    }
});
