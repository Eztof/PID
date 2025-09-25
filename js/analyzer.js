/* analyzer.js – heuristische PID‑Auswertung auf Basis einer Trendkurve */


window.ReglerAnalyzer = (function(){
function stats(arr){
const n = arr.length; if(!n) return {min:NaN,max:NaN,avg:NaN};
let min=+Infinity, max=-Infinity, sum=0;
for(const v of arr){ if(v<min) min=v; if(v>max) max=v; sum+=v; }
return {min, max, avg: sum/n};
}


function movingAvg(series, w){
if(w<=1) return series;
const out = new Array(series.length);
let acc=0; const q=[];
for(let i=0;i<series.length;i++){
const y = series[i].y; acc+=y; q.push(y);
if(q.length>w) acc -= q.shift();
out[i] = { x: series[i].t, y: acc/q.length };
}
return out;
}


function derive(series){
const out=[];
for(let i=1;i<series.length;i++){
const dt = (series[i].t - series[i-1].t)/1000; // s
if(dt<=0) continue;
out.push({ x: series[i].t, y: (series[i].y - series[i-1].y)/dt });
}
return out;
}


function detectStep(pv, setpoint){
// Fallback: find strongest monotonic excursion
const y = pv.map(p=>p.y);
const {min,max} = stats(y);
const amp = max - min;
if(amp < 0.5) return { kind:'none', amp };
// crude: start is 10th percentile, end 90th
const start = pv[Math.floor(pv.length*0.1)];
const end = pv[Math.floor(pv.length*0.9)];
const dir = end.y > start.y ? 1 : -1;
return { kind:'ramp', dir, amp };
}


function performance(pv, setpoint){
// Estimate steady value by last 10% window
const tail = pv.slice(Math.floor(pv.length*0.9));
const base = pv[0]?.y ?? NaN;
const tailStats = stats(tail.map(p=>p.y));
const steady = tailStats.avg;
const peak = Math.max(...pv.map(p=>p.y));
const trough = Math.min(...pv.map(p=>p.y));
const span = peak - trough;


// Rise time ~ time to reach (10→90%) of range
const lo = trough + 0.1*span;
const hi = trough + 0.9*span;
let t10=null, t90=null;
})();
