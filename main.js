/* ========= CONFIG ========= */
const MAX_FILE_MB = 10;
const FIELD_ALIASES = {
  date: ["date", "day", "date_time", "datetime", "dayname", "day_name"],
  time: ["time", "hour", "hr", "timestamp", "time_stamp"],
  power: ["power_kw", "power (kw)", "power", "load", "demand", "kw", "data", "value"]
};

let rawRows = [];        // raw objects from CSV/XLSX
let headers = [];        // detected header names
let map = { date:null, time:null, power:null }; // header mapping
let chart;               // Chart.js instance
let zoomed = false;
let groupedData = {};    // Grouped data per day for plotting

/* ========= DOM ========= */
const fileInput  = document.getElementById("fileInput");
const chooseBtn  = document.getElementById("chooseBtn");
const dropzone   = document.getElementById("dropzone");
const metaBox    = document.getElementById("fileMeta");
const metaName   = document.getElementById("metaName");
const metaSize   = document.getElementById("metaSize");
const metaType   = document.getElementById("metaType");
const metaRows   = document.getElementById("metaRows");
const metaSheets = document.getElementById("metaSheets");
const previewTbl = document.getElementById("previewTable");
const mapper     = document.getElementById("mapper");
const mapStatus  = document.getElementById("mapStatus");
const mapNeed    = document.getElementById("mapNeed");
const selDate    = document.getElementById("mapDate");
const selTime    = document.getElementById("mapTime");
const selPower   = document.getElementById("mapPower");
const applyMap   = document.getElementById("applyMap");
const btnBest    = document.getElementById("btnBest");
const btnWorst   = document.getElementById("btnWorst");
const btnZoom    = document.getElementById("btnZoom");
const y0         = document.getElementById("y0");

/* ========= Helpers ========= */
const fmtBytes = b => (b/1024/1024).toFixed(2) + " MB";
const toLowerTrim = s => String(s||"").trim().toLowerCase();

function withinLimit(file){
  if(!file) return false;
  const ok = file.size <= MAX_FILE_MB*1024*1024;
  if(!ok) alert(`File too large. Max ${MAX_FILE_MB} MB.`);
  return ok;
}

/* Try to map column names automatically */
function autoMap(hs){
  const norm = hs.map(h => toLowerTrim(h));
  const findAlias = (aliases) => {
    for(const a of aliases){
      const idx = norm.indexOf(a);
      if(idx !== -1) return hs[idx];
      // also partials e.g. "Power(kW)"
      for(let i=0;i<norm.length;i++){
        if(norm[i].includes(a)) return hs[i];
      }
    }
    return null;
  };
  return {
    date:  findAlias(FIELD_ALIASES.date),
    time:  findAlias(FIELD_ALIASES.time),
    power: findAlias(FIELD_ALIASES.power),
  };
}

/* Build mapping UI when needed */
function showMapper(hs){
  mapper.style.display = "grid";
  selDate.innerHTML  = `<option value="">-- choose --</option>` + hs.map(h=>`<option>${h}</option>`).join("");
  selTime.innerHTML  = `<option value="">-- choose --</option>` + hs.map(h=>`<option>${h}</option>`).join("");
  selPower.innerHTML = `<option value="">-- choose --</option>` + hs.map(h=>`<option>${h}</option>`).join("");
}

/* Preview first 15 rows */
function renderPreview(rows){
  if(!rows || !rows.length){ previewTbl.innerHTML=""; return; }
  const hs = Object.keys(rows[0]);
  const top = rows.slice(0,15);
  previewTbl.innerHTML = `
    <thead><tr>${hs.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>
      ${top.map(r=>`<tr>${hs.map(h=>`<td>${(r[h]??"")}</td>`).join("")}</tr>`).join("")}
    </tbody>`;
}

/* Time parsing -> minutes from midnight */
function timeToMinutes(val){
  if(val==null) return null;
  const s = String(val).trim();
  // decimal hours
  if(/^\d+(\.\d+)?$/.test(s)){
    const dec = parseFloat(s); if(dec<0 || dec>=24) return null;
    return Math.round(dec*60);
  }
  // HH:mm or h:mm AM/PM
  const m = s.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if(!m) return null;
  let h = parseInt(m[1]), min = parseInt(m[2]); if(min>59) return null;
  const ampm = m[3];
  if(ampm){
    if(ampm.toUpperCase()==="PM" && h!==12) h+=12;
    if(ampm.toUpperCase()==="AM" && h===12) h=0;
  }
  if(h>23) return null;
  return h*60 + min;
}
function minutesToHHMM(min){
  const h=Math.floor(min/60), m=min%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

/* Group to days (keys) and build series */
function rowsToSeries(rows, map){
  const dayKey = (d)=> {
    // if looks like a date, keep the date; else keep label
    return (d==null || d==="") ? "Unknown" : d;
  };
  const grouped = {};
  let bad = 0, neg = 0;
  rows.forEach(r=>{
    const d = r[map.date];
    const t = r[map.time];
    const p = Number(r[map.power]);
    const mm = timeToMinutes(t);
    if(Number.isNaN(p) || mm===null){ bad++; return; }
    if(p<0) neg++;
    const key = dayKey(d);
    (grouped[key] ||= []).push({x:mm, y:p});
  });
  Object.values(grouped).forEach(a=>a.sort((a,b)=>a.x-b.x));
  return {grouped, bad, neg};
}

/* Render chart */
function renderChart(grouped){
  const ctx = document.getElementById("chart").getContext("2d");

  const palette = ["#1e40af", "#dc2626", "#059669", "#d97706", "#7c2d12"];
  const datasets = Object.keys(grouped).map((k, i) => ({
    label: k,
    data: grouped[k],
    borderColor: palette[i % palette.length],
    pointRadius: 0,
    borderWidth: 2,
    cubicInterpolationMode: "monotone",
    fill: false,
  }));

  // Add the dotted red line at peak threshold
  const peakValue = Math.max(...Object.values(grouped).flat().map(p => p.y)); // Get the peak power value
  datasets.push({
    label: "Peak Threshold",
    data: [
      { x: 0, y: peakValue },
      { x: 24 * 60, y: peakValue }, // Full day (24:00)
    ],
    borderColor: "red",
    borderWidth: 1,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false,
  });

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: { callbacks: { title: (items) => minutesToHHMM(items[0].parsed.x) } },
      },
      scales: {
        x: {
          type: "linear",
          min: zoomed ? 14 * 60 : 0,
          max: zoomed ? 22 * 60 : 24 * 60,
          ticks: { stepSize: zoomed ? 60 : 120, callback: (v) => minutesToHHMM(v) },
          title: { display: true, text: "Time" },
        },
        y: {
          beginAtZero: y0.checked,
          title: { display: true, text: "Power (kW)" },
        },
      },
    },
  });
}

/* Best / worst day buttons (14–22 only) */
function bestWorst(grouped, want = "best") {
  const start = 14 * 60, end = 22 * 60; // 14:00 to 22:00
  let chosen = null, stat = want === "best" ? Infinity : -Infinity;

  for (const [day, pts] of Object.entries(grouped)) {
    const window = pts.filter(p => p.x >= start && p.x <= end).map(p => p.y);
    if (!window.length) continue;

    const peak = Math.max(...window);
    if ((want === "best" && peak < stat) || (want === "worst" && peak > stat)) {
      stat = peak;
      chosen = day;
    }
  }

  if (!chosen) return;
  renderChart({ [chosen]: grouped[chosen] }); // Only show the chosen day
}

// Event listeners for the buttons
btnBest.onclick = () => bestWorst(groupedData, "best");
btnWorst.onclick = () => bestWorst(groupedData, "worst");

/* ========= File flows ========= */
chooseBtn.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.style.borderColor = "#94a3b8"; });
dropzone.addEventListener("dragleave", () => dropzone.style.borderColor = "#e2e8f0");
dropzone.addEventListener("drop", (e) => {
  e.preventDefault(); dropzone.style.borderColor = "#e2e8f0";
  const f = e.dataTransfer.files?.[0]; if (f) { fileInput.files = e.dataTransfer.files; parseFile(f); }
});

fileInput.addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) parseFile(f); });

function parseFile(file) {
  if (!withinLimit(file)) return; // Ensure file size is within limits

  metaBox.style.display = "none"; mapper.style.display = "none"; mapStatus.style.display = "none"; mapNeed.style.display = "none";
  rawRows = []; headers = [];

  if (file.name.toLowerCase().endsWith(".csv")) {
    Papa.parse(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (res) => {
        rawRows = res.data;
        headers = Object.keys(rawRows[0] || {});
        afterLoad(file, { sheets: 1 });
      },
      error: (err) => alert("CSV parse error: " + err.message)
    });
  } else if (file.name.toLowerCase().endsWith(".xlsx")) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "binary" });
      const sheetName = wb.SheetNames[0]; // Read the first sheet
      const sheet = wb.Sheets[sheetName];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      headers = Object.keys(rawRows[0] || {});
      afterLoad(file, { sheets: wb.SheetNames.length, firstSheet: sheetName });
    };
    reader.readAsBinaryString(file);
  } else {
    alert("Unsupported file type. Please upload CSV or XLSX.");
  }
}

function afterLoad(file, meta) {
  metaBox.style.display = "block";
  metaName.textContent = "📄 " + file.name;
  metaSize.textContent = "💾 " + fmtBytes(file.size);
  metaType.textContent = "🧩 " + (file.type || (file.name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv"));
  metaRows.textContent = "🔢 Rows: " + rawRows.length;
  if (meta.sheets > 1) {
    metaSheets.style.display = "inline-block"; metaSheets.textContent = "📚 Sheets: " + meta.sheets + " (reading first)";
  } else metaSheets.style.display = "none";

  renderPreview(rawRows);

  const guess = autoMap(headers);
  map = guess;
  const need = !(map.date && map.time && map.power);

  if (need) {
    mapNeed.style.display = "inline-block";
    showMapper(headers);
  } else {
    mapStatus.style.display = "inline-block";
    processMapped();
  }
}

applyMap.addEventListener("click", () => {
  const d = selDate.value, t = selTime.value, p = selPower.value;
  if (!d || !t || !p) { alert("Please choose all mappings."); return; }
  map = { date: d, time: t, power: p };
  mapNeed.style.display = "none"; mapStatus.style.display = "inline-block";
  processMapped();
});

function processMapped() {
  if (!rawRows.length) return;
  const { grouped, bad, neg } = rowsToSeries(rawRows, map);
  if (bad > 0) console.warn(`Skipped ${bad} rows due to invalid time/power.`);
  if (neg > 0) console.warn(`Found ${neg} negative power values.`);
  groupedData = grouped;  // Store grouped data for Best/Worst day logic
  renderChart(grouped);

  // Best / worst handlers remain bound to current data
  btnBest.onclick = () => bestWorst(grouped, "best");
  btnWorst.onclick = () => bestWorst(grouped, "worst");
}

/* Controls */
btnZoom.addEventListener("click", () => {
  zoomed = !zoomed;
  btnZoom.textContent = zoomed ? "🔎 Zoom Out (Full day)" : "🔍 Zoom 14:00–22:00";
  if (chart) {
    chart.options.scales.x.min = zoomed ? 14 * 60 : 0;
    chart.options.scales.x.max = zoomed ? 22 * 60 : 24 * 60;
    chart.options.scales.x.ticks.stepSize = zoomed ? 60 : 120;
    chart.update();
  }
});
y0.addEventListener("change", () => {
  if (chart) { chart.options.scales.y.beginAtZero = y0.checked; chart.update(); }
});
