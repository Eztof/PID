/* analyzer.js – heuristische PID-Auswertung (ES5-kompatibel) */
(function () {
  function stats(arr) {
    var n = arr.length;
    if (!n) return { min: NaN, max: NaN, avg: NaN };
    var min = Infinity, max = -Infinity, sum = 0;
    for (var i = 0; i < n; i++) {
      var v = arr[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { min: min, max: max, avg: sum / n };
  }

  function movingAvg(series, w) {
    if (w <= 1) return series.slice();
    var out = new Array(series.length);
    var acc = 0, q = [];
    for (var i = 0; i < series.length; i++) {
      var y = series[i].y;
      acc += y; q.push(y);
      if (q.length > w) acc -= q.shift();
      out[i] = { t: series[i].t, y: acc / q.length };
    }
    return out;
  }

  function derive(series) {
    var out = [];
    for (var i = 1; i < series.length; i++) {
      var dt = (series[i].t - series[i - 1].t) / 1000; // s
      if (dt <= 0) continue;
      out.push({ t: series[i].t, y: (series[i].y - series[i - 1].y) / dt });
    }
    return out;
  }

  function performance(pv, setpoint) {
    var n = pv.length;
    if (!n) return { steady: NaN, peak: NaN, trough: NaN, rise: NaN, settle: NaN };

    var tailStart = Math.floor(n * 0.9);
    var tail = pv.slice(tailStart);
    var base = n > 0 ? pv[0].y : NaN;

    var ts = stats(tail.map(function (p) { return p.y; }));
    var steady = ts.avg;

    var peak = -Infinity, trough = Infinity;
    for (var i = 0; i < n; i++) {
      if (pv[i].y > peak) peak = pv[i].y;
      if (pv[i].y < trough) trough = pv[i].y;
    }
    var span = peak - trough;

    var lo = trough + 0.1 * span;
    var hi = trough + 0.9 * span;
    var t10 = null, t90 = null;
    for (var j = 0; j < n; j++) {
      if (t10 === null && pv[j].y >= lo) t10 = pv[j].t;
      if (t90 === null && pv[j].y >= hi) { t90 = pv[j].t; break; }
    }
    var rise = (t10 && t90) ? (t90 - t10) / 1000 : NaN;

    var band = 0.02 * span;
    var settle = null;
    var half = Math.floor(n * 0.5);
    for (var k = half; k < n; k++) {
      var ok = true;
      for (var m = k; m < n; m++) {
        if (Math.abs(pv[m].y - steady) > band) { ok = false; break; }
      }
      if (ok) { settle = (pv[k].t - pv[0].t) / 1000; break; }
    }

    return { steady: steady, peak: peak, trough: trough, rise: rise, settle: settle };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function suggest(pv, params) {
    if (!pv || !pv.length) {
      return {
        suggest: { XPY1: params.XPY1, tN: params.tN, Vorhalt: params.Vorhalt, xwh: params.xwh, TVmin: params.TVmin, TVmax: params.TVmax, EF: params.EF, KH: params.KH },
        summary: ['Keine Datenpunkte gefunden.']
      };
    }

    var sm = movingAvg(pv, 5);
    var perf = performance(sm, params.setpoint);

    var y = sm.map(function (p) { return p.y; });
    var st = stats(y);
    var span = (st.max - st.min) || 1;

    var steadyValid = !(isNaN(perf.steady));
    var overshoot = steadyValid ? (perf.peak - perf.steady) / Math.max(1, Math.abs(perf.steady - st.min)) : 0;

    var XP = params.XPY1;
    var TN = params.tN;
    var VD = params.Vorhalt;
    var XWH = params.xwh;

    if (overshoot > 0.2) {
      XP = XP * 1.25;
      TN = TN * 1.2;
      VD = Math.round(VD * 1.2 + 1);
    }

    var duration = (sm[sm.length - 1].t - sm[0].t) / 1000; // s
    if (!isNaN(perf.rise) && perf.rise > 0.4 * duration) {
      XP = XP * 0.8;
      TN = TN * 0.9;
    }

    if (params.setpoint != null) {
      var err = params.setpoint - (steadyValid ? perf.steady : params.setpoint);
      if (Math.abs(err) > 0.03 * span) {
        TN = TN * 0.85;
      }
    }

    var dv = derive(sm).map(function (p) { return Math.abs(p.y); });
    var dStats = stats(dv);
    if (dStats.avg < 0.001 && span < 1) {
      XWH = Math.max(XWH, 0.2);
    }

    XP = clamp(XP, 0.5, 999.9);
    TN = clamp(TN, 0.5, 99);
    VD = clamp(VD, 0, 299);
    XWH = clamp(XWH, 0, 50);

    return {
      suggest: {
        XPY1: Number(XP.toFixed(2)),
        tN: Number(TN.toFixed(2)),
        Vorhalt: Math.round(VD),
        xwh: Number(XWH.toFixed(2)),
        TVmin: params.TVmin, TVmax: params.TVmax, EF: params.EF, KH: params.KH
      },
      summary: [
        'Steady ≈ ' + (steadyValid ? perf.steady.toFixed(2) : '—') + ' ' + (params.unit || ''),
        'Peak: ' + (isFinite(perf.peak) ? perf.peak.toFixed(2) : '—') + ' / Min: ' + (isFinite(perf.trough) ? perf.trough.toFixed(2) : '—'),
        'Rise time: ' + (isNaN(perf.rise) ? '—' : (perf.rise.toFixed(0) + ' s')) + ', Settle: ' + (isNaN(perf.settle) ? '—' : (perf.settle.toFixed(0) + ' s')),
        (params.setpoint != null ? ('Soll ' + params.setpoint.toFixed(2) + ' ' + (params.unit || '') + ' (Bleibefehler ' + ((params.setpoint - (steadyValid ? perf.steady : params.setpoint)).toFixed(2)) + ')') : 'Kein Sollwert angegeben.')
      ]
    };
  }

  function analyze(points, params) {
    return suggest(points, params);
  }

  window.ReglerAnalyzer = { analyze: analyze };
})();
