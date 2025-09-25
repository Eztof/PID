/* display.js – Trend laden, Kurvenliste, Plot */


window.TrendApp = (function(){
const state = {
trends: [], // {id, name, address, points:[{t:Date, y:Number}]}
paramsByName: new Map(), // from CSV
chart: null,
};


const els = {
xmlInput: document.getElementById('xmlInput'),
csvInput: document.getElementById('csvInput'),
parseBtn: document.getElementById('parseBtn'),
parseStatus: document.getElementById('parseStatus'),
searchInput: document.getElementById('searchInput'),
curveList: document.getElementById('curveList'),
curveCount: document.getElementById('curveCount'),
selectAllBtn: document.getElementById('selectAllBtn'),
clearAllBtn: document.getElementById('clearAllBtn'),
plotBtn: document.getElementById('plotBtn'),
chartCanvas: document.getElementById('trendChart'),
resetZoomBtn: document.getElementById('resetZoomBtn'),
downsampleToggle: document.getElementById('downsampleToggle'),
pvSelect: document.getElementById('pvSelect'),
// Tuner inputs for potential prefill from CSV
xp: document.getElementById('xpInput'),
tn: document.getElementById('tnInput'),
d: document.getElementById('dInput'),
xwh: document.getElementById('xwhInput'),
tvmin: document.getElementById('tvminInput'),
tvmax: document.getElementById('tvmaxInput'),
ef: document.getElementById('efInput'),
kh: document.getElementById('khInput'),
analyzeBtn: document.getElementById('analyzeBtn'),
applySuggestionsBtn: document.getElementById('applySuggestionsBtn'),
exportCsvBtn: document.getElementById('exportCsvBtn'),
})();
