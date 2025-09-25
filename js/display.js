/* display.js – Trend laden, Kurvenliste, Plot (ES5-kompatibel) */
(function () {
  var state = {
    trends: [],            // {id, name, address, plain, points:[{t:Date, y:Number}]}
    paramsByName: new Map(),
    chart: null
  };

  var els = {
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
    analysisSummary: document.getElementById('analysisSummary'),
    suggestionsBox: document.getElementById('suggestionsBox'),
    suggXP: document.getElementById('suggXP'),
    suggTN: document.getElementById('suggTN'),
    suggD: document.getElementById('suggD'),
    suggXWH: document.getElementById('suggXWH'),
    setpointInput: document.getElementById('setpointInput')
  };

  function fmt(n, digits) {
    if (digits === void 0) digits = 2;
    return (n === null || n === undefined || isNaN(Number(n))) ? '—' : Number(n).toFixed(digits);
  }

  // Parse trend.xml
  function parseXMLFile(file) {
    return file.text().then(function (text) {
      var xml = new DOMParser().parseFromString(text, 'text/xml');
      var trendObjects = Array.prototype.slice.call(xml.querySelectorAll('Content > TrendObject'));
      var result = [];
      for (var i = 0; i < trendObjects.length; i++) {
        var obj = trendObjects[i];
        var paNode = obj.querySelector('PlainAddress');
        var plain = paNode ? (paNode.textContent || '').trim() : '';
        var address = obj.getAttribute('Address') || '';
        var name = (plain ? plain.split('/').slice(-1)[0] : '') || address || ('Trend ' + (i + 1));

        var entriesRaw = Array.prototype.slice.call(obj.querySelectorAll('Entry'));
        var entries = [];
        for (var j = 0; j < entriesRaw.length; j++) {
          var e = entriesRaw[j];
          var t = new Date(e.getAttribute('TimeStamp'));
          var y = Number(e.getAttribute('Value'));
          if (!isNaN(y)) entries.push({ t: t, y: y });
        }
        entries.sort(function (a, b) { return a.t - b.t; });
        if (entries.length > 0) {
          result.push({ id: i + 1, name: name, address: address, plain: plain, points: entries });
        }
      }
      return result;
    });
  }

  // Read CSV parameters (optional)
  function parseCSVFile(file) {
    return new Promise(function (resolve) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (res) {
          var data = res.data || [];
          var map = new Map();
          for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var key = ((row.Tag || row.PlainAddress || '') + '').trim();
            if (!key) continue;
            map.set(key, row);
          }
          resolve(map);
        }
      });
    });
  }

  function renderCurveList(filter) {
    if (filter === void 0) filter = '';
    var q = (filter || '').toLowerCase();
    var frag = document.createDocumentFragment();
    var shown = 0;

    var list = state.trends.map(function (t) {
      return { id: t.id, name: t.name, sub: t.plain || t.address, points: t.points };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });

    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var hay = (t.name + ' ' + t.sub).toLowerCase();
      if (q && hay.indexOf(q) === -1) continue;

      var row = document.createElement('label');
      row.className = 'flex items-center gap-2 p-2 hover:bg-slate-50';
      row.innerHTML =
        '<input type="checkbox" class="curveCheck scale-110" data-id="' + t.id + '" />' +
        '<div class="flex-1 min-w-0">' +
        '  <div class="font-medium truncate">' + t.name + '</div>' +
        '  <div class="text-xs text-slate-500 truncate">' + t.sub + '</div>' +
        '</div>' +
        '<div class="text-xs text-slate-500">' + t.points.length + ' pts</div>';
      frag.appendChild(row);
      shown++;
    }
    els.curveList.replaceChildren(frag);
    els.curveCount.textContent = String(shown);

    // PV-Dropdown
    var pvFrag = document.createDocumentFragment();
    for (var k = 0; k < state.trends.length; k++) {
      var tt = state.trends[k];
      var opt = document.createElement('option');
      opt.value = String(tt.id);
      opt.textContent = tt.name;
      pvFrag.appendChild(opt);
    }
    els.pvSelect.replaceChildren(pvFrag);
  }

  function downsample(data, max) {
    if (max === void 0) max = 3000;
    if (data.length <= max) return data;
    var stride = Math.ceil(data.length / max);
    var out = [];
    for (var i = 0; i < data.length; i++) if (i % stride === 0) out.push(data[i]);
    return out;
  }

  function buildDatasets(selectedIds) {
    var out = [];
    for (var i = 0; i < state.trends.length; i++) {
      var t = state.trends[i];
      if (!selectedIds.has(t.id)) continue;
      var ds = {
        label: t.name,
        data: t.points.map(function (p) { return { x: p.t, y: p.y }; }),
        parsing: false,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.2
      };
      out.push(ds);
    }
    return out;
  }

  function plotSelected() {
    var checks = Array.prototype.slice.call(els.curveList.querySelectorAll('.curveCheck:checked'));
    var ids = new Set(checks.map(function (c) { return Number(c.getAttribute('data-id')); }));
    if (ids.size === 0) {
      alert('Bitte mindestens eine Kurve wählen.');
      return;
    }

    var datasets = buildDatasets(ids).map(function (ds) {
      return {
        label: ds.label,
        data: els.downsampleToggle.checked ? downsample(ds.data) : ds.data,
        parsing: false,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.2
      };
    });

    if (state.chart) state.chart.destroy();
    var ctx = els.chartCanvas.getContext('2d');

    state.chart = new Chart(ctx, {
      type: 'line',
      data: { datasets: datasets },
      options: {
        responsive: true,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { position: 'top' },
          zoom: {
            pan: { enabled: true, mode: 'x' },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) { return ctx.dataset.label + ': ' + fmt(ctx.parsed.y); }
            }
          }
        },
        scales: {
          x: { type: 'time', time: { tooltipFormat: 'yyyy-MM-dd HH:mm:ss' } },
          y: { beginAtZero: false }
        }
      }
    });
  }

  function prefillFromCSV(name) {
    var row = state.paramsByName.get(name);
    if (!row) return;
    if (row.XPY1) els.xp.value = row.XPY1;
    if (row.TN || row.tN) els.tn.value = row.TN || row.tN;
    if (row.Vorhalt) els.d.value = row.Vorhalt;
    if (row.xwh) els.xwh.value = row.xwh;
    if (row.TVmin) els.tvmin.value = row.TVmin;
    if (row.TVmax) els.tvmax.value = row.TVmax;
    if (row.EF) els.ef.value = row.EF;
    if (row.KH) els.kh.value = row.KH;
  }

  function exportCSV(updated) {
    var headers = ['Tag','XPY1','tN','Vorhalt','xwh','TVmin','TVmax','EF','KH'];
    var rows = [headers.join(',')];
    rows.push([
      updated.name,
      updated.XPY1,
      updated.tN,
      updated.Vorhalt,
      updated.xwh,
      updated.TVmin,
      updated.TVmax,
      updated.EF,
      updated.KH
    ].join(','));
    var blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'tuning_suggestions.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // Events
  els.parseBtn.addEventListener('click', function () {
    if (!els.xmlInput.files[0]) {
      alert('Bitte eine trend.xml auswählen.');
      return;
    }
    els.parseStatus.textContent = 'Lade…';
    parseXMLFile(els.xmlInput.files[0]).then(function (tr) {
      state.trends = tr;
      els.parseStatus.textContent = 'OK: ' + state.trends.length + ' Kurven geladen.';
      renderCurveList(els.searchInput.value || '');
      if (els.csvInput.files[0]) {
        return parseCSVFile(els.csvInput.files[0]).then(function (m) { state.paramsByName = m; });
      }
    }).catch(function (err) {
      console.error(err);
      els.parseStatus.textContent = 'Fehler beim Laden.';
      alert('XML konnte nicht gelesen werden. Siehe Konsole.');
    });
  });

  els.searchInput.addEventListener('input', function (e) { renderCurveList(e.target.value); });
  els.selectAllBtn.addEventListener('click', function () {
    Array.prototype.forEach.call(els.curveList.querySelectorAll('.curveCheck'), function (c) { c.checked = true; });
  });
  els.clearAllBtn.addEventListener('click', function () {
    Array.prototype.forEach.call(els.curveList.querySelectorAll('.curveCheck'), function (c) { c.checked = false; });
  });
  els.plotBtn.addEventListener('click', plotSelected);
  els.resetZoomBtn.addEventListener('click', function () { if (state.chart && state.chart.resetZoom) state.chart.resetZoom(); });
  els.pvSelect.addEventListener('change', function (e) {
    var id = Number(e.target.value);
    var sel = null;
    for (var i = 0; i < state.trends.length; i++) if (state.trends[i].id === id) { sel = state.trends[i]; break; }
    if (sel) prefillFromCSV(sel.name);
  });

  els.analyzeBtn.addEventListener('click', function () {
    var pvId = Number(els.pvSelect.value);
    var pv = null;
    for (var i = 0; i < state.trends.length; i++) if (state.trends[i].id === pvId) { pv = state.trends[i]; break; }
    if (!pv) { alert('Bitte PV wählen.'); return; }

    var params = {
      XPY1: Number(els.xp.value || '50'),
      tN: Number(els.tn.value || '3'),
      Vorhalt: Number(els.d.value || '0'),
      xwh: Number(els.xwh.value || '0'),
      TVmin: Number(els.tvmin.value || '20'),
      TVmax: Number(els.tvmax.value || '95'),
      EF: Number(els.ef.value || '1.5'),
      KH: Number(els.kh.value || '0'),
      setpoint: els.setpointInput.value ? Number(els.setpointInput.value) : null,
      unit: '°C'
    };

    var analysis = window.ReglerAnalyzer.analyze(pv.points, params);

    els.analysisSummary.replaceChildren();
    for (var i2 = 0; i2 < analysis.summary.length; i2++) {
      var li = document.createElement('li');
      li.textContent = analysis.summary[i2];
      els.analysisSummary.appendChild(li);
    }

    els.suggestionsBox.classList.remove('hidden');
    els.suggXP.textContent = fmt(analysis.suggest.XPY1) + ' K';
    els.suggTN.textContent = fmt(analysis.suggest.tN) + ' min';
    els.suggD.textContent = fmt(analysis.suggest.Vorhalt, 0) + ' s';
    els.suggXWH.textContent = fmt(analysis.suggest.xwh) + ' K';

    els.applySuggestionsBtn.disabled = false;
    els.exportCsvBtn.disabled = false;

    state.lastSuggestion = { name: pv.name, XPY1: analysis.suggest.XPY1, tN: analysis.suggest.tN, Vorhalt: analysis.suggest.Vorhalt, xwh: analysis.suggest.xwh, TVmin: analysis.suggest.TVmin, TVmax: analysis.suggest.TVmax, EF: analysis.suggest.EF, KH: analysis.suggest.KH };
  });

  els.applySuggestionsBtn.addEventListener('click', function () {
    if (!state.lastSuggestion) return;
    els.xp.value = state.lastSuggestion.XPY1;
    els.tn.value = state.lastSuggestion.tN;
    els.d.value = state.lastSuggestion.Vorhalt;
    els.xwh.value = state.lastSuggestion.xwh;
  });

  els.exportCsvBtn.addEventListener('click', function () {
    if (state.lastSuggestion) exportCSV(state.lastSuggestion);
  });

  window.TrendApp = { state: state };
})();
