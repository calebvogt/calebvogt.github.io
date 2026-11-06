/* C57BL/6J vs wild-derived mice in field enclosures: interactive version of
 * Vogt et al. 2024, BMC Biology 22:35 (doi:10.1186/s12915-024-01809-0).
 * Data: projects/c57-vs-wild-derived/data/*.json, built from the tables deposited on
 * Zenodo by the lab's 2020_LID repository (web/build_web_data.py, web/figure_data.py).
 * Times are seconds since each trial's first RFID read; bouts are stored in deciseconds.
 * Enclosures are drawn upright, zones 1-2 at the bottom and 7-8 at the top (Fig S1B).
 */
(function () {
  'use strict';

  var root = document.getElementById('cw');
  if (!root) return;
  var BASE = root.dataset.base || 'data/';
  var PAPER = root.dataset.paper || 'https://doi.org/10.1186/s12915-024-01809-0';

  var css = getComputedStyle(root);
  function tok(n, d) { return css.getPropertyValue(n).trim() || d; }
  // Group colours as in the paper's figures: C57 warm, wild-derived cool; light females, dark males.
  var COL = {
    C57F: tok('--c57-f', '#f5874f'), C57M: tok('--c57-m', '#b5653a'),
    WDF: tok('--wd-f', '#87ceeb'), WDM: tok('--wd-m', '#5684a6'),
    C57: tok('--c57', '#e9954a'), WD: tok('--wd', '#6fb1d8') };
  var INK = '#e0e0e0', MUTED = tok('--muted', '#898781');
  var FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  var STRAIN_NAME = { C57: 'C57BL/6J', WD: 'Wild-derived' };
  var SEX_NAME = { M: 'male', F: 'female' };
  var GROUPS = [
    { key: 'C57F', strain: 'C57', sex: 'F', label: 'C57 females' },
    { key: 'C57M', strain: 'C57', sex: 'M', label: 'C57 males' },
    { key: 'WDF', strain: 'WD', sex: 'F', label: 'WD females' },
    { key: 'WDM', strain: 'WD', sex: 'M', label: 'WD males' }];
  // Ten distinguishable hues for the males of one trial (zone ownership).
  var CAT = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WKD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  var SVGNS = 'http://www.w3.org/2000/svg';
  var ITHACA = { lat: 42.44, lon: -76.48 };   // Liddell Field Station, for the day/night shading
  var EDT_MS = 4 * 3600e3;                    // trials ran June-August 2020: UTC-4 throughout

  var META, TERR, FIGS, TRIAL = {};
  var BOUTS = {}, SNET = {};                  // per-trial files, loaded when first needed
  var REDRAW = [];                            // everything to redraw on resize

  // ---------- small helpers ----------
  function $(id) { return document.getElementById(id); }
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function lin(d0, d1, r0, r1) {
    var f = function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); };
    f.inv = function (p) { return d0 + (p - r0) / (r1 - r0) * (d1 - d0); };
    return f;
  }
  function niceTicks(lo, hi, n) {
    var raw = Math.max(hi - lo, 1e-9) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    var step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
    var ticks = [];
    for (var v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    if (ticks[ticks.length - 1] < hi) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 1e6) / 1e6);
    return ticks;
  }
  function fmtN(n) { return Math.round(n).toLocaleString('en-US'); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; }
  function sd(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }
  function sem(a) { return a.length < 2 ? 0 : sd(a) / Math.sqrt(a.length); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexA(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, u) {
    var p = rgb(a), q = rgb(b);
    return '#' + [0, 1, 2].map(function (i) { return pad16(Math.round(p[i] + (q[i] - p[i]) * u)); }).join('');
  }
  function pad16(v) { var s = v.toString(16); return s.length < 2 ? '0' + s : s; }
  function ramp(stops, v) {   // stops: [[value, '#rrggbb'], ...] ascending
    if (v <= stops[0][0]) return stops[0][1];
    for (var i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    }
    return stops[stops.length - 1][1];
  }
  function rng(seed) {        // mulberry32: a small seeded generator, so layouts repeat exactly
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function keyStyle(k, it) {
    if (it.cls === 'ring') k.style.color = it.color; else k.style.background = it.color;
    if (it.dash) k.style.background = 'repeating-linear-gradient(90deg,' + it.color + ' 0 5px,transparent 5px 8px)';
  }
  function legend(el, items) {
    el.replaceChildren();
    items.forEach(function (it) {
      var s = h('span', null, el);
      keyStyle(h('i', it.cls || null, s), it);
      s.appendChild(document.createTextNode(it.label));
    });
  }
  // A legend whose entries hide and show their series.
  function toggleLegend(el, items, hidden, redraw) {
    el.replaceChildren();
    items.forEach(function (it) {
      var b = h('button', null, el);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!hidden[it.key]));
      keyStyle(h('i', it.cls || null, b), it);
      b.appendChild(document.createTextNode(it.label));
      b.addEventListener('click', function () { hidden[it.key] = !hidden[it.key]; redraw(); });
    });
  }
  function segmented(el, onChange) {
    var bs = el.querySelectorAll('button');
    bs.forEach(function (b) {
      b.addEventListener('click', function () {
        bs.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        onChange(b.dataset.v);
      });
    });
  }
  function yAxis(s, ticks, y, x0, x1, fmt) {
    ticks.forEach(function (t) {
      svg('line', { x1: x0, x2: x1, y1: y(t), y2: y(t), class: t === 0 ? 'cw-baseline' : 'cw-gridline' }, s);
      svg('text', { x: x0 - 6, y: y(t) + 4, 'text-anchor': 'end' }, s).textContent = fmt ? fmt(t) : t;
    });
  }
  function axisTitles(s, W, H, L, R, T, B, xt, yt) {
    if (xt) svg('text', { x: (L + W - R) / 2, y: H - 3, 'text-anchor': 'middle', class: 'cw-axis-title' }, s).textContent = xt;
    if (yt) svg('text', { transform: 'translate(12,' + ((T + H - B) / 2) + ') rotate(-90)', 'text-anchor': 'middle',
      class: 'cw-axis-title' }, s).textContent = yt;
  }
  function sizeSvg(s, H) {
    var W = Math.max(280, s.clientWidth || s.parentNode.clientWidth || 800);
    s.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    s.setAttribute('height', H);
    s.replaceChildren();
    return W;
  }
  function sizeCanvas(cv, H) {
    var W = cv.clientWidth || cv.parentNode.clientWidth || 800, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
    }
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    return { c: c, W: W, H: H };
  }
  function pathOf(pts) {   // pts: [[x, y] | null]; nulls break the line
    var d = '', pen = false;
    pts.forEach(function (p) {
      if (!p) { pen = false; return; }
      d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
      pen = true;
    });
    return d;
  }

  // ---------- tooltip ----------
  var tip = $('cw-tip');
  function showTip(ev, head, rows) {
    tip.replaceChildren();
    if (head) h('div', 'cw-tip-h', tip, head);
    (rows || []).forEach(function (r) {
      var row = h('div', 'cw-tip-r', tip);
      if (r.color) { var k = h('i', null, row); k.style.background = r.color; }
      h('b', null, row, r.value);
      if (r.label) row.appendChild(document.createTextNode(' ' + r.label));
    });
    tip.style.display = 'block';
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var px = ev.clientX + 14, py = ev.clientY + 14;
    if (px + tw > window.innerWidth - 8) px = ev.clientX - tw - 14;
    if (py + th > window.innerHeight - 8) py = ev.clientY - th - 14;
    tip.style.left = Math.max(4, px) + 'px';
    tip.style.top = Math.max(4, py) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  // ---------- figure references ----------
  // Main figures link to the article's figure; supplementary ones to their additional file.
  function figLink(id) {
    var supp = id.charAt(0) === 'S', n = id.replace(/^S/, '').charAt(0);
    var a = document.createElement('a');
    a.href = PAPER + (supp ? '#MOESM' + n : '#Fig' + n);
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'Fig ' + id;
    return a;
  }
  function figCaption(el, figs, stats, note) {
    el.replaceChildren();
    el.appendChild(document.createTextNode('In the paper: '));
    figs.forEach(function (f, i) {
      if (i) el.appendChild(document.createTextNode(', '));
      el.appendChild(figLink(f));
    });
    if (stats) { el.appendChild(document.createTextNode('. Reported statistics: ')); h('b', null, el, stats); }
    if (note) el.appendChild(document.createTextNode('. ' + note));
  }

  // ---------- time ----------
  function originMs(tr) {   // trial origin as a UTC epoch (origin is local EDT)
    var p = tr.origin.split(/[-T:]/).map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5]) + EDT_MS;
  }
  function localDate(tr, sec) { return new Date(tr.originMs + sec * 1000 - EDT_MS); }   // read with getUTC*
  function dayOf(tr, sec) {
    for (var d = 0; d < tr.day_ends_s.length; d++) if (sec < tr.day_ends_s[d]) return d + 1;
    return tr.day_ends_s.length;
  }
  function tEnd(tr) { return tr.day_ends_s[tr.day_ends_s.length - 1]; }
  function fmtClock(tr, sec, short) {
    var d = localDate(tr, sec);
    return (short ? '' : WKD[d.getUTCDay()] + ' ') + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ', ' +
      pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }
  function fmtElapsed(sec) {
    return Math.floor(sec / 86400) + ' d ' + pad2(Math.floor(sec % 86400 / 3600)) + ':' +
      pad2(Math.floor(sec % 3600 / 60)) + ' after release';
  }
  // Solar altitude (degrees) at Ithaca; NOAA's low-precision formulae, ample for shading night.
  function sunAlt(ms) {
    var d = ms / 864e5 - 10957.5;                         // days since J2000.0
    var g = (357.529 + 0.98560028 * d) * Math.PI / 180;
    var q = 280.459 + 0.98564736 * d;
    var L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
    var e = (23.439 - 0.00000036 * d) * Math.PI / 180;
    var dec = Math.asin(Math.sin(e) * Math.sin(L));
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    var gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    var ha = ((gmst * 15 + ITHACA.lon) * Math.PI / 180) - ra;
    var lat = ITHACA.lat * Math.PI / 180;
    return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
  }
  function isNight(tr, sec) { return sunAlt(tr.originMs + sec * 1000) < -6; }

  // ---------- data ----------
  function getJSON(name) {
    return fetch(BASE + name).then(function (r) {
      if (!r.ok) throw new Error(name + ': ' + r.status);
      return r.json();
    });
  }
  function loadBouts(id) {
    if (BOUTS[id]) return Promise.resolve(BOUTS[id]);
    return getJSON('bouts_' + id + '.json').then(function (b) {
      var n = TRIAL[id].mice.length, per = [];
      for (var i = 0; i < n; i++) per.push({ s: [], e: [], z: [] });
      for (var k = 0; k < b.m.length; k++) {         // already sorted by start
        var p = per[b.m[k]];
        p.s.push(b.s[k] / 10); p.e.push(b.e[k] / 10); p.z.push(b.z[k]);
      }
      BOUTS[id] = per;
      return per;
    });
  }
  function loadSnet(id) {
    if (SNET[id]) return Promise.resolve(SNET[id]);
    return getJSON('snet_' + id + '.json').then(function (d) { SNET[id] = d; return d; });
  }
  function lastStartAtOrBefore(a, t) {   // index of the last a[i] <= t, or -1
    var lo = 0, hi = a.length - 1, ans = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (a[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }
  function trialLabel(tr) {
    var a = localDate(tr, 0), b = localDate(tr, tEnd(tr));
    return tr.id + ' · ' + STRAIN_NAME[tr.strain] + ' · ' + MON[a.getUTCMonth()] + ' ' + a.getUTCDate() + '–' +
      (a.getUTCMonth() === b.getUTCMonth() ? '' : MON[b.getUTCMonth()] + ' ') + b.getUTCDate();
  }
  function trialsOf(strain) { return META.trials.filter(function (t) { return !strain || t.strain === strain; }); }
  function fillTrials(sel, value, strain) {
    sel.replaceChildren();
    trialsOf(strain).forEach(function (tr) { var o = h('option', null, sel, trialLabel(tr)); o.value = tr.id; });
    sel.value = value;
  }
  function figMouse(i) { return FIGS.mice[i]; }
  function groupKey(mo) { return mo.strain + mo.sex; }

  // ---------- header stats ----------
  function drawStats() {
    var mice = META.trials.reduce(function (s, t) { return s + t.mice.length; }, 0);
    var reads = 0;
    if (FIGS && FIGS.reads) {
      Object.keys(FIGS.reads).forEach(function (t) {
        Object.keys(FIGS.reads[t]).forEach(function (n) {
          FIGS.reads[t][n].forEach(function (d) { d.forEach(function (v) { reads += v || 0; }); });
        });
      });
    }
    var el = $('cw-stats');
    el.replaceChildren();
    var stats = [[META.trials.length, 'trials · 4 C57, 3 wild-derived'], [mice, 'mice']];
    if (reads) stats.push([(reads / 1e6).toFixed(1) + ' M', 'RFID reads']);
    stats.push([fmtN(META.tracked_hours), 'hours of tracked location']);
    stats.forEach(function (s) {
      var d = h('div', 'cw-stat', el); h('b', null, d, String(s[0])); h('span', null, d, s[1]);
    });
    $('cw-hours').textContent = fmtN(META.tracked_hours);
    $('cw-hours-dep').textContent = fmtN(META.tracked_hours_deposited);
  }

  // ---------- enclosure geometry ----------
  // x runs across the 15.2 m width, y up the 38.1 m length from the zone 1-2 end.
  function zoneXY(z) { var zz = META.zones[z - 1]; return { x: zz.x, y: zz.y }; }
  function encL() { return META.enclosure_m[1]; }
  function encW() { return META.enclosure_m[0]; }
  // Zone squares in a small 2 x 4 map: column 0 for odd zones, row 0 (top) for zones 7-8.
  function zoneCell(z) { return { col: (z - 1) % 2, row: 3 - Math.floor((z - 1) / 2) }; }

  // ---------- design: enclosure map + trial calendar ----------
  function drawMap() {
    var s = $('cw-map'), H = 400, W = sizeSvg(s, H);
    var top = 34, eh = H - top - 14, sc = eh / encL(), ew = encW() * sc;
    var ex = Math.max(40, (W - ew) / 2 + 10), ey = top;
    svg('rect', { x: ex, y: ey, width: ew, height: eh, rx: 4, fill: '#121510', stroke: '#3b4a33' }, s);
    META.zones.forEach(function (zz) {
      var cx = ex + zz.x * sc, cy = ey + (encL() - zz.y) * sc;
      svg('rect', { x: cx - 13, y: cy - 9, width: 26, height: 18, rx: 3, fill: '#2a2a26', stroke: '#6c6a60' }, s);
      svg('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', fill: INK }, s).textContent = zz.zone;
    });
    // dimension lines
    svg('line', { x1: ex, x2: ex + ew, y1: 16, y2: 16, stroke: '#5d5b54' }, s);
    [ex, ex + ew].forEach(function (x) { svg('line', { x1: x, x2: x, y1: 12, y2: 20, stroke: '#5d5b54' }, s); });
    svg('text', { x: ex + ew / 2, y: 11, 'text-anchor': 'middle' }, s).textContent = '15.2 m';
    var lx = ex - 16;
    svg('line', { x1: lx, x2: lx, y1: ey, y2: ey + eh, stroke: '#5d5b54' }, s);
    [ey, ey + eh].forEach(function (y) { svg('line', { x1: lx - 4, x2: lx + 4, y1: y, y2: y, stroke: '#5d5b54' }, s); });
    svg('text', { transform: 'translate(' + (lx - 6) + ',' + (ey + eh / 2) + ') rotate(-90)', 'text-anchor': 'middle' }, s)
      .textContent = '38.1 m';
  }
  function drawCalendar() {
    var s = $('cw-calendar'), W = sizeSvg(s, 150);
    var d0 = Date.UTC(2020, 5, 15), d1 = Date.UTC(2020, 7, 27);
    var L = 92, R = 10, x = lin(d0, d1, L, W - R);
    var rows = { A: 34, B: 84 };
    Object.keys(rows).forEach(function (k) {
      svg('text', { x: L - 10, y: rows[k] + 15, 'text-anchor': 'end', fill: INK }, s).textContent = 'Enclosure ' + k;
      svg('line', { x1: L, x2: W - R, y1: rows[k] + 30, y2: rows[k] + 30, class: 'cw-gridline' }, s);
    });
    for (var m = 5; m <= 7; m++) {
      var t = Date.UTC(2020, m, 1);
      if (t >= d0) {
        svg('line', { x1: x(t), x2: x(t), y1: 24, y2: 120, class: 'cw-gridline' }, s);
        svg('text', { x: x(t) + 3, y: 136 }, s).textContent = MON[m] + ' 2020';
      }
    }
    META.trials.forEach(function (tr) {
      var a = tr.originMs, b = tr.originMs + tEnd(tr) * 1000, y = rows[tr.enclosure];
      var r = svg('rect', { x: x(a), y: y, width: Math.max(4, x(b) - x(a)), height: 24, rx: 4,
        fill: hexA(COL[tr.strain], 0.35), stroke: COL[tr.strain] }, s);
      svg('text', { x: (x(a) + x(b)) / 2, y: y + 16, 'text-anchor': 'middle', fill: INK }, s).textContent = tr.id;
      r.addEventListener('mousemove', function (ev) {
        showTip(ev, trialLabel(tr), [{ value: tr.mice.length, label: 'mice', color: COL[tr.strain] },
          { value: 'Enclosure ' + tr.enclosure }]);
      });
      r.addEventListener('mouseleave', hideTip);
    });
    legend($('cw-cal-legend'), [{ color: COL.C57, label: 'C57BL/6J' }, { color: COL.WD, label: 'Wild-derived outbred' }]);
  }

  // ---------- replay: every trial's enclosure, upright, on one canvas ----------
  var RP = { t: 7200, playing: false, speed: 3600, trails: true, max: 1, last: null, ids: [], shown: {}, disp: {}, snap: true };
  var TRAIL_S = 8 * 3600;   // trail memory, in trial seconds
  function setupReplay() {
    RP.ids = trialsOf('C57').concat(trialsOf('WD')).map(function (t) { return t.id; });
    RP.ids.forEach(function (id) { RP.shown[id] = true; RP.disp[id] = {}; });
    var chips = $('cw-rp-trials');
    RP.ids.forEach(function (id) {
      var tr = TRIAL[id], b = h('button', 'cw-chip', chips);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'true');
      h('i', null, b).style.background = COL[tr.strain];
      b.appendChild(document.createTextNode(id + ' · ' + (tr.strain === 'C57' ? 'C57' : 'wild-derived')));
      b.addEventListener('click', function () {
        var on = RP.ids.filter(function (k) { return RP.shown[k]; });
        if (RP.shown[id] && on.length === 1) return;          // keep at least one
        RP.shown[id] = !RP.shown[id];
        b.setAttribute('aria-pressed', String(RP.shown[id]));
        RP.snap = true; startReplayData();
      });
    });
    $('cw-play').addEventListener('click', function () {
      if (RP.t >= RP.max) RP.t = 0;
      RP.playing = !RP.playing; RP.last = null;
      $('cw-play').innerHTML = RP.playing ? '&#10074;&#10074;' : '&#9654;';
      $('cw-play').setAttribute('aria-label', RP.playing ? 'Pause' : 'Play');
      if (RP.playing) requestAnimationFrame(rpTick);
    });
    $('cw-time').addEventListener('input', function () { RP.t = this.value / 1000 * RP.max; RP.snap = true; drawReplay(); });
    $('cw-speed').addEventListener('change', function () { RP.speed = +this.value; });
    $('cw-trails').addEventListener('change', function () { RP.trails = this.checked; drawReplay(); });
    var cv = $('cw-arenas');
    cv.addEventListener('mousemove', replayHover);
    cv.addEventListener('mouseleave', hideTip);
    legend($('cw-replay-legend'), GROUPS.map(function (g) { return { color: COL[g.key], label: g.label, cls: 'dot' }; })
      .concat([{ color: MUTED, label: 'Visit ended (last detected there)', cls: 'ring' },
        { color: '#2a3550', label: 'Night at Ithaca', cls: 'box' }]));
    REDRAW.push(function () { RP.snap = true; drawReplay(); });
    startReplayData();
  }
  function startReplayData() {
    var ids = RP.ids.filter(function (id) { return RP.shown[id]; });
    drawReplay();
    Promise.all(ids.map(loadBouts)).then(function () {
      RP.max = Math.max.apply(null, ids.map(function (id) { return tEnd(TRIAL[id]); }));
      RP.t = Math.min(RP.t, RP.max); RP.snap = true;
      drawReplay();
    });
  }
  function rpTick(now) {
    if (!RP.playing) return;
    if (RP.last != null) RP.t = Math.min(RP.max, RP.t + (now - RP.last) / 1000 * RP.speed);
    RP.last = now;
    drawReplay();
    if (RP.t >= RP.max) {
      RP.playing = false; $('cw-play').innerHTML = '&#9654;'; $('cw-play').setAttribute('aria-label', 'Play');
      return;
    }
    requestAnimationFrame(rpTick);
  }
  // Panels at >= 128 px each: one row if they all fit, else C57 trials on one row and
  // wild-derived on the next (else plain wrapping); each enclosure as tall as its panel allows.
  function rpLayout(W) {
    var on = function (id) { return RP.shown[id]; }, gap = 12;
    var ids = RP.ids.filter(on), fit = Math.max(1, Math.floor((W + gap) / (128 + gap))), rows;
    var c57 = trialsOf('C57').map(function (t) { return t.id; }).filter(on);
    var wd = trialsOf('WD').map(function (t) { return t.id; }).filter(on);
    if (ids.length <= fit) rows = [ids];
    else if (c57.length <= fit && wd.length <= fit) rows = [c57, wd].filter(function (r) { return r.length; });
    else { rows = []; for (var i = 0; i < ids.length; i += fit) rows.push(ids.slice(i, i + fit)); }
    var perRow = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    var pw = (W - (perRow - 1) * gap) / perRow, maxEH = rows.length > 1 ? 380 : perRow <= 2 ? 520 : 440;
    var eh = Math.min(maxEH, (pw - 4) * encL() / encW()), ew = eh * encW() / encL(), head = 36;
    return { rows: rows, pw: pw, eh: eh, ew: ew, head: head, gap: gap, rowH: head + eh + 16, W: W,
      H: rows.length * (head + eh + 16) };
  }
  function drawReplay() {
    var cv = $('cw-arenas'), W0 = cv.clientWidth || 900, G = rpLayout(W0), C = sizeCanvas(cv, G.H), c = C.c;
    $('cw-time').value = Math.round(RP.t / Math.max(RP.max, 1) * 1000);
    $('cw-clock').textContent = fmtElapsed(RP.t);
    var hits = [];
    G.rows.forEach(function (row, r) {
      var x0 = (G.W - (row.length * G.pw + (row.length - 1) * G.gap)) / 2;   // centre short rows
      row.forEach(function (id, k) {
        drawArena(c, G, x0 + k * (G.pw + G.gap), r * G.rowH, TRIAL[id], BOUTS[id], RP.disp[id], hits);
      });
    });
    cv._hits = hits;
    RP.snap = false;
  }
  // Where each mouse is at time t: inside a zone (bout in progress) or last seen at one.
  function stateAt(per, t) {
    return per.map(function (p) {
      var i = lastStartAtOrBefore(p.s, t);
      if (i < 0) return null;
      return { zone: p.z[i], inside: t <= p.e[i], i: i };
    });
  }
  function drawArena(c, G, px, py, tr, per, disp, hits) {
    var sc = G.eh / encL(), ex = px + (G.pw - G.ew) / 2, ey = py + G.head;
    function X(m) { return ex + m * sc; }
    function Y(m) { return ey + (encL() - m) * sc; }
    var t = Math.min(RP.t, tEnd(tr)), night = isNight(tr, t), cxp = px + G.pw / 2;
    c.textAlign = 'center';
    c.font = '12.5px ' + FONT; c.fillStyle = COL[tr.strain];
    c.fillText(tr.id + ' · ' + (G.pw > 190 ? STRAIN_NAME[tr.strain] : tr.strain === 'C57' ? 'C57' : 'WD'), cxp, py + 13);
    c.font = '11px ' + FONT; c.fillStyle = MUTED;
    var line2 = 'Day ' + dayOf(tr, t) + ' · ' + fmtClock(tr, t, true) + (night ? ' · night' : '');
    if (c.measureText(line2).width > G.pw) line2 = fmtClock(tr, t, true);
    c.fillText(line2, cxp, py + 28);
    c.textAlign = 'left';
    c.fillStyle = night ? '#0b0f1a' : '#11150f';
    c.fillRect(ex, ey, G.ew, G.eh);
    c.strokeStyle = night ? '#2a3550' : '#3b4a33'; c.lineWidth = 1;
    c.strokeRect(ex + 0.5, ey + 0.5, G.ew - 1, G.eh - 1);
    var zr = clamp(1.55 * sc, 8, 24);              // half-size of a zone box
    if (!per) {
      c.fillStyle = MUTED; c.textAlign = 'center'; c.fillText('loading…', cxp, ey + G.eh / 2); c.textAlign = 'left';
      return;
    }
    var st = stateAt(per, t);
    if (RP.trails) {                               // the last TRAIL_S seconds of zone-to-zone moves
      c.lineWidth = 1.3;
      per.forEach(function (p, m) {
        var i1 = lastStartAtOrBefore(p.s, t); if (i1 < 1) return;
        var i0 = Math.max(1, lastStartAtOrBefore(p.s, t - TRAIL_S));
        var col = COL[tr.strain + tr.mice[m].sex], jit = (m - tr.mice.length / 2) * 0.3;
        for (var i = i0; i <= i1; i++) {
          if (p.z[i] === p.z[i - 1]) continue;
          var age = clamp((t - p.s[i]) / TRAIL_S, 0, 1), a = zoneXY(p.z[i - 1]), b = zoneXY(p.z[i]);
          c.strokeStyle = hexA(col, 0.6 * (1 - age) + 0.05);
          c.beginPath();
          c.moveTo(X(a.x) + jit, Y(a.y) + jit);
          c.lineTo(X(b.x) + jit, Y(b.y) + jit);
          c.stroke();
        }
      });
    }
    var inside = {}, outside = {};
    st.forEach(function (s, m) {
      if (!s) return;
      var bag = s.inside ? inside : outside;
      (bag[s.zone] = bag[s.zone] || []).push(m);
    });
    META.zones.forEach(function (zz) {
      var n = (inside[zz.zone] || []).length, cx = X(zz.x), cy = Y(zz.y);
      c.fillStyle = n ? '#2b2b24' : '#1c1c19'; c.strokeStyle = '#6c6a60'; c.lineWidth = 1;
      c.beginPath(); c.rect(cx - zr, cy - zr, 2 * zr, 2 * zr); c.fill(); c.stroke();
      c.fillStyle = MUTED; c.font = '9.5px ' + FONT;
      c.fillText(zz.zone, cx - zr + 2, cy - zr + 9);
    });
    // Mice inside a zone pack in a sunflower spiral on its centre; mice that left ring it.
    var dot = clamp(sc * 0.36, 2.6, 4.4), step = dot * 1.75;
    function target(z, k, n, outer) {
      var p = zoneXY(z), cx = X(p.x), cy = Y(p.y);
      if (outer) {
        var a = (k / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2, r = zr + dot + 3;
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
      }
      var rr = step * Math.sqrt(k + 0.5) * 0.85, aa = k * 2.39996;
      return { x: cx + rr * Math.cos(aa), y: cy + rr * Math.sin(aa) };
    }
    var pos = [];
    function place(bag, outer) {
      Object.keys(bag).forEach(function (z) {
        var ms = bag[z];
        ms.forEach(function (m, k) {
          var q = target(+z, k, ms.length, outer), d = disp[m];
          if (!d || RP.snap) d = disp[m] = { x: q.x, y: q.y };
          else { d.x += (q.x - d.x) * 0.25; d.y += (q.y - d.y) * 0.25; }
          pos.push({ m: m, x: d.x, y: d.y, inside: !outer, zone: +z });
        });
      });
    }
    place(outside, true); place(inside, false);
    pos.forEach(function (p) {
      var col = COL[tr.strain + tr.mice[p.m].sex];
      c.beginPath(); c.arc(p.x, p.y, p.inside ? dot : dot * 0.8, 0, Math.PI * 2);
      if (p.inside) { c.fillStyle = col; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 0.7; c.stroke(); }
      else { c.strokeStyle = hexA(col, 0.6); c.lineWidth = 1.2; c.stroke(); }
      hits.push({ x: p.x, y: p.y, tr: tr, m: p.m, inside: p.inside, zone: p.zone });
    });
    if (RP.t > tEnd(tr)) {
      c.fillStyle = 'rgba(13,13,13,0.55)'; c.fillRect(ex, ey, G.ew, G.eh);
      c.fillStyle = INK; c.textAlign = 'center'; c.font = '11px ' + FONT;
      c.fillText('trial ended', cxp, ey + G.eh / 2); c.textAlign = 'left';
    }
  }
  function replayHover(ev) {
    var cv = $('cw-arenas'), hits = cv._hits || [], r = cv.getBoundingClientRect();
    var mx = ev.clientX - r.left, my = ev.clientY - r.top, best = null, bd = 64;
    hits.forEach(function (p) { var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); if (d < bd) { bd = d; best = p; } });
    if (!best) { hideTip(); return; }
    var mo = best.tr.mice[best.m];
    showTip(ev, mo.name + ' (' + mo.code + ') · ' + best.tr.id, [
      { color: COL[best.tr.strain + mo.sex], value: STRAIN_NAME[best.tr.strain] + ' ' + SEX_NAME[mo.sex] },
      { value: (best.inside ? 'In zone ' : 'Last seen at zone ') + best.zone },
      { value: 'Cage ' + mo.cage + ' · released at zone ' + mo.release_zone }]);
  }

  // ---------- generic line chart: group means ± SEM over days ----------
  // o: { series: [{key, label, color, dash, m[], e[], n[], indiv: [{label, v[]}]}], hidden, indiv,
  //      yLabel, xLabel, x, height, fmt, refY, zero, yMin, yMax, unit, endLabels }
  function lineChart(s, o) {
    var H = o.height || 290, W = sizeSvg(s, H), L = 58, Rr = o.endLabels ? 52 : 16, T = 12, B = 38;
    var hidden = o.hidden || {}, ser = o.series.filter(function (r) { return !hidden[r.key]; });
    var xs = o.x || DAYS, lo = Infinity, hi = -Infinity;
    function see(v) { if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    ser.forEach(function (r) {
      r.m.forEach(function (v, i) { if (v != null) { see(v - (r.e[i] || 0)); see(v + (r.e[i] || 0)); } });
      if (o.indiv && r.indiv) r.indiv.forEach(function (iv) { iv.v.forEach(see); });
    });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (o.zero !== false) lo = Math.min(lo, 0);
    if (o.refY != null) see(o.refY);
    if (o.yMin != null) lo = o.yMin;
    if (o.yMax != null) hi = o.yMax;
    var fmt = o.fmt || function (v) { return v.toFixed(1); };
    var ticks = niceTicks(lo, hi, 5), y = lin(ticks[0], ticks[ticks.length - 1], H - B, T);
    var x = lin(xs[0], xs[xs.length - 1], L + 12, W - Rr - 12);
    yAxis(s, ticks, y, L, W - Rr, o.tickFmt);
    xs.forEach(function (d) { svg('text', { x: x(d), y: H - B + 16, 'text-anchor': 'middle' }, s).textContent = d; });
    axisTitles(s, W, H, L, Rr, T, B, o.xLabel || 'Day', o.yLabel);
    if (o.refY != null) {
      svg('line', { x1: L, x2: W - Rr, y1: y(o.refY), y2: y(o.refY), stroke: '#77756c', 'stroke-dasharray': '5 4' }, s);
    }
    if (o.indiv) ser.forEach(function (r) {
      (r.indiv || []).forEach(function (iv) {
        var p = svg('path', { d: pathOf(iv.v.map(function (v, i) { return v == null ? null : [x(xs[i]), y(v)]; })),
          fill: 'none', stroke: r.color, 'stroke-width': 1, 'stroke-opacity': 0.25 }, s);
        p.addEventListener('mouseenter', function () { p.setAttribute('stroke-opacity', 0.95); p.setAttribute('stroke-width', 2); });
        p.addEventListener('mousemove', function (ev) {
          var last = null; iv.v.forEach(function (v, i) { if (v != null) last = [i, v]; });
          showTip(ev, iv.label, last ? [{ color: r.color, value: fmt(last[1]), label: 'on day ' + xs[last[0]] }] : []);
        });
        p.addEventListener('mouseleave', function () { p.setAttribute('stroke-opacity', 0.25); p.setAttribute('stroke-width', 1); hideTip(); });
      });
    });
    var labels = [];
    ser.forEach(function (r) {
      svg('path', { d: pathOf(r.m.map(function (v, i) { return v == null ? null : [x(xs[i]), y(v)]; })),
        fill: 'none', stroke: r.color, 'stroke-width': 2.2, 'stroke-dasharray': r.dash ? '6 4' : null }, s);
      r.m.forEach(function (v, i) {
        if (v == null) return;
        var cx = x(xs[i]), e = r.e[i] || 0;
        if (e > 0) {
          svg('line', { x1: cx, x2: cx, y1: y(v - e), y2: y(v + e), stroke: r.color, 'stroke-width': 1.3 }, s);
          [v - e, v + e].forEach(function (w) {
            svg('line', { x1: cx - 3, x2: cx + 3, y1: y(w), y2: y(w), stroke: r.color, 'stroke-width': 1.3 }, s);
          });
        }
        var c = svg('circle', { cx: cx, cy: y(v), r: 3.7, fill: r.dash ? '#0d0d0d' : r.color, stroke: r.color, 'stroke-width': 1.6 }, s);
        c.addEventListener('mousemove', function (ev) {
          showTip(ev, r.label + ' · day ' + xs[i], [{ color: r.color, value: fmt(v),
            label: '± ' + fmt(e) + ' SEM' + (r.n ? ' (n = ' + r.n[i] + ' ' + (o.unit || 'mice') + ')' : '') }]);
        });
        c.addEventListener('mouseleave', hideTip);
      });
      if (o.endLabels) {
        var lv = null; r.m.forEach(function (v) { if (v != null) lv = v; });
        if (lv != null) labels.push({ y: y(lv), text: r.label, col: r.color });
      }
    });
    if (o.endLabels) {
      labels.sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 12);
      labels.forEach(function (l) { svg('text', { x: W - Rr + 6, y: l.y + 4, fill: l.col }, s).textContent = l.text; });
    }
  }

  // Per-mouse daily values from figs.json, pooled into groups (mean ± SEM across mice).
  function groupSeries(metric, groups) {
    var vals = FIGS.daily[metric] || [];
    return groups.map(function (g) {
      var rows = [];
      FIGS.mice.forEach(function (mo, i) { if (g.test(mo) && vals[i]) rows.push({ mo: mo, v: vals[i] }); });
      var m = [], e = [], n = [];
      for (var d = 0; d < 10; d++) {
        var col = [];
        rows.forEach(function (r) { var v = r.v[d]; if (v != null && isFinite(v)) col.push(v); });
        m.push(mean(col)); e.push(sem(col)); n.push(col.length);
      }
      return { key: g.key, label: g.label, color: g.color, dash: g.dash, m: m, e: e, n: n,
        indiv: rows.map(function (r) { return { label: r.mo.name + ' · ' + r.mo.t, v: r.v }; }) };
    });
  }
  var FOUR = GROUPS.map(function (g) {
    return { key: g.key, label: g.label, color: COL[g.key], test: function (mo) { return mo.strain === g.strain && mo.sex === g.sex; } };
  });
  var FEMALES = FOUR.filter(function (g) { return g.key.slice(-1) === 'F'; });
  function fixed(n) { return function (v) { return v.toFixed(n); }; }

  // Two half-width charts side by side (stacked on phones), sharing one legend and one "show each"
  // box. Each half has its own measure picker, or a fixed title when its list holds one measure.
  // lists: one array of measures [{id, label, y, fig[], stats, note, fmt, refY, zero}] per half.
  // opts.defaults: the measure each half starts on; opts.series(m): build series other than by group.
  var PAIR_H = 250;
  function chartPair(prefix, lists, groups, opts) {
    opts = opts || {};
    var box = $('cw-' + prefix + '-pair'), chk = $('cw-' + prefix + '-indiv'), hidden = {}, panels = [];
    lists.forEach(function (list, k) {
      var div = h('div', 'cw-panel', box), head = h('div', 'cw-panel-head', div), sel = null;
      if (list.length > 1) {
        sel = h('select', null, head);
        sel.setAttribute('aria-label', 'Measure for chart ' + (k + 1));
        list.forEach(function (m) { var o = h('option', null, sel, m.label); o.value = m.id; });
        sel.value = (opts.defaults || [])[k] || list[0].id;
        sel.addEventListener('change', draw);
      } else {
        h('div', 'cw-pair-h', head, list[0].label);
      }
      panels.push({ list: list, sel: sel, svg: svg('svg', { class: 'cw-svg' }, div), fig: h('p', 'cw-fig', div) });
    });
    function draw() {
      var shown = null;
      panels.forEach(function (p) {
        var id = p.sel ? p.sel.value : p.list[0].id;
        var m = p.list.filter(function (q) { return q.id === id; })[0];
        var series = opts.series ? opts.series(m) : groupSeries(m.id, groups);
        lineChart(p.svg, { series: series, hidden: hidden, indiv: chk && chk.checked, unit: opts.unit,
          yLabel: m.y, refY: m.refY, zero: m.zero, fmt: m.fmt || fixed(1), height: PAIR_H });
        figCaption(p.fig, m.fig, m.stats, m.note);
        shown = shown || series;
      });
      toggleLegend($('cw-' + prefix + '-legend'), shown, hidden, draw);
    }
    if (chk) chk.addEventListener('change', draw);
    REDRAW.push(draw);
    draw();
  }
  var SPACE_MEASURES = [
    { id: 'zones_visited', label: 'Zones visited each day', y: 'Zones visited', fig: ['3B'],
      stats: 'LMM: log(day) P < 0.0001; genotype:log(day) P < 0.0001; sex:log(day) P < 0.0001' },
    { id: 'zones_cum', label: 'New zones visited, cumulative', y: 'Cumulative novel zones visited', fig: ['3C'],
      stats: 'LMM (day 10): sex P < 0.0001; genotype P = 0.013; sex:genotype P = 0.017' },
    { id: 'distance_m', label: 'Minimum distance travelled', y: 'Minimum distance travelled (m)', fig: ['S3D'],
      stats: 'LMM: log(day) P < 0.0001; genotype:log(day) P < 0.0001; sex:log(day) P < 0.0001' },
    { id: 'top_zone_pct', label: 'Time in the most used zone', y: '% time in most occupied zone', fig: ['S2B', 'S3E'],
      zero: false, stats: 'males LMM: genotype P = 0.024; log(day) P = 0.007; genotype:log(day) P = 0.081 · ' +
        'females LMM: genotype P = 0.035; log(day) P = 0.007' }];
  var TB_MEASURES = [
    { id: 'alone_pct', label: 'Time alone', y: '% time alone', fig: ['4B'],
      stats: 'LMM: sex P < 0.0001; genotype P = 0.004; sex:genotype:log(day) P = 0.024' },
    { id: 'samesex_pct', label: 'Time in same-sex groups', y: '% time in same-sex associations', fig: ['4C'],
      stats: 'LMM: sex P < 0.0001; sex:log(day) P < 0.0001; sex:genotype:log(day) P < 0.0001' },
    { id: 'oppsex_pct', label: 'Time with the other sex', y: '% time in opposite-sex associations', fig: ['S4A'],
      stats: 'LMM: sex P < 0.0001; genotype:log(day) P < 0.0001; genotype:sex:log(day) P = 0.036' },
    { id: 'oppsex_social_pct', label: 'Share of social time spent with the other sex', y: '% social time in opposite-sex associations',
      fig: ['S4B'], stats: 'LMM: sex:log(day) P < 0.0001' }];
  var CM_MEASURES = [
    { id: 'cagemate_pref', label: 'Preference for cagemates (observed − expected)', y: '% cagemate preference (obs. − exp.)',
      fig: ['3D'], refY: 0, stats: 'LMM (days 2–10): genotype P = 0.005; WD vs null P = 0.0007; C57 vs null P = 0.33' },
    { id: 'cagemate_time_pct', label: 'Female–female social time spent with cagemates', y: '% of female–female time with cagemates',
      fig: ['S3G'], stats: 'LMM: genotype P = 0.004; genotype:log(day) P < 0.0001' }];
  var ND_MEASURES = [
    { id: 'degree', label: 'Partners that day (node degree)', y: 'Node degree centrality', fig: ['4H'],
      stats: 'LMM: sex P = 0.006; genotype:log(day) P < 0.0001; sex:log(day) P = 0.0002; genotype:sex:log(day) P = 0.01' },
    { id: 'novel_mice_cum', label: 'New mice met, cumulative', y: 'Cumulative novel mice met', fig: ['S4C'],
      stats: 'LMM, day 10 values: strain P = 0.0098; sex P < 0.0001',
      note: 'Days 1–9 corrected for a sorting error in the original script (see About the data).' },
    { id: 'pagerank', label: 'PageRank', y: 'Node PageRank score', fig: ['S4D'], fmt: fixed(3), zero: false,
      stats: 'LMM: sex P = 0.028; genotype:log(day) P = 0.025; sex:log(day) P < 0.0001; genotype:sex:log(day) P = 0.0014' }];
  var NS_MEASURES = [
    { id: 'components', label: 'Separate groups (network components)', y: '# network components', fig: ['4F'],
      stats: 'LMM: genotype:log(day) P < 0.0001' },
    { id: 'edge_density', label: 'Edge density', y: 'Network edge density', fig: ['4G'], fmt: fixed(2),
      stats: 'LMM: genotype:log(day) P < 0.0001' }];

  // ---------- space use: zone activity maps (Figs 2A, 3A, S2A, S3A) ----------
  var HM = { sex: 'F', C57: 'T001', WD: 'T004' };
  var READ_STOPS = [[0, '#25306e'], [1, '#3d5ad8'], [2, '#7d46c4'], [3, '#c8506a'], [4, '#f27b2e'], [4.8, '#ffc766']];
  function readColor(n) { return n > 0 ? ramp(READ_STOPS, Math.log10(n)) : '#191919'; }
  function setupHeatmaps() {
    segmented($('cw-hm-sex'), function (v) { HM.sex = v; drawHeatmaps(); });
    ['C57', 'WD'].forEach(function (st) {
      var sel = $('cw-hm-' + st.toLowerCase());
      fillTrials(sel, HM[st], st);
      sel.addEventListener('change', function () { HM[st] = sel.value; drawHeatmaps(); });
    });
    var sc = $('cw-hm-scale');
    sc.replaceChildren();
    var none = h('span', null, sc); none.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:2px;background:#191919;border:1px solid #333';
    sc.appendChild(document.createTextNode('no reads'));
    var bar = h('span', 'bar', sc);
    bar.style.background = 'linear-gradient(90deg,' + READ_STOPS.map(function (s) { return s[1] + ' ' + (s[0] / 4.8 * 100) + '%'; }).join(',') + ')';
    sc.appendChild(document.createTextNode('1 → 10 → 100 → 1,000 → 10,000+ RFID reads (log scale)'));
    REDRAW.push(drawHeatmaps);
    drawHeatmaps();
  }
  function drawHeatmaps() {
    ['C57', 'WD'].forEach(function (st) { drawHeat(st, HM[st]); });
    figCaption($('cw-hm-fig'), HM.sex === 'F' ? ['3A', 'S3A'] : ['2A', 'S2A'], null);
  }
  function drawHeat(st, id) {
    var s = $('cw-hm-' + st.toLowerCase() + '-svg'), tr = TRIAL[id], reads = (FIGS.reads || {})[id] || {};
    var mice = tr.mice.filter(function (m) { return m.sex === HM.sex; });
    $('cw-hm-' + st.toLowerCase() + '-h').textContent = trialLabel(tr) + ' · ' + mice.length + (HM.sex === 'F' ? ' females' : ' males');
    var W0 = Math.max(280, s.clientWidth || s.parentNode.clientWidth || 500), L = 40, colW = (W0 - L) / 10;
    var q = clamp(Math.floor((colW - 8) / 2), 5, 12), gw = 2 * q + 1, gh = 4 * q + 3, rowH = gh + 9, T = 18;
    var W = sizeSvg(s, T + mice.length * rowH + 4);
    DAYS.forEach(function (d) {
      svg('text', { x: L + (d - 0.5) * colW, y: 11, 'text-anchor': 'middle' }, s).textContent = d === 1 ? 'Day 1' : d;
    });
    mice.forEach(function (mo, r) {
      var y0 = T + r * rowH, days = reads[mo.name];
      svg('text', { x: L - 6, y: y0 + gh / 2 + 4, 'text-anchor': 'end', fill: INK }, s).textContent = mo.code;
      DAYS.forEach(function (d) {
        var x0 = L + (d - 1) * colW + (colW - gw) / 2, zs = days ? days[d - 1] : null;
        for (var z = 1; z <= 8; z++) {
          var cell = zoneCell(z), n = zs ? zs[z - 1] : null;
          svg('rect', { x: x0 + cell.col * (q + 1), y: y0 + cell.row * (q + 1), width: q, height: q,
            fill: n == null ? '#101010' : readColor(n), 'data-m': r, 'data-d': d, 'data-z': z }, s);
        }
      });
    });
    s.onmousemove = function (ev) {
      var t = ev.target, ds = t.dataset || {};
      if (ds.z == null) { hideTip(); return; }
      var mo = mice[+ds.m], days = reads[mo.name], n = days ? days[ds.d - 1][ds.z - 1] : null;
      showTip(ev, mo.name + ' (' + mo.code + ') · day ' + ds.d, [{ color: n ? readColor(n) : '#191919',
        value: n == null ? 'not tracked' : fmtN(n), label: n == null ? '' : 'reads in zone ' + ds.z }]);
    };
    s.onmouseleave = hideTip;
    void W;
  }

  // ---------- male territories ----------
  function drawOwnership() {
    var s = $('cw-own'), ids = trialsOf('C57').concat(trialsOf('WD'));
    var W0 = Math.max(280, s.clientWidth || s.parentNode.clientWidth || 800), L = 92, colW = (W0 - L) / 10;
    var q = clamp(Math.floor((colW - 10) / 2), 4, 13), gw = 2 * q + 1, gh = 4 * q + 3, rowH = gh + 10, T = 18;
    sizeSvg(s, T + ids.length * rowH + 2);
    DAYS.forEach(function (d) {
      svg('text', { x: L + (d - 0.5) * colW, y: 11, 'text-anchor': 'middle' }, s).textContent = d === 1 ? 'Day 1' : d;
    });
    var info = [];
    ids.forEach(function (tr, r) {
      var y0 = T + r * rowH, own = TERR[tr.id].owner, mc = {}, k = 0;
      tr.mice.forEach(function (mo) { if (mo.sex === 'M') mc[mo.name] = CAT[k++ % CAT.length]; });
      svg('text', { x: 0, y: y0 + gh / 2 + 4, fill: COL[tr.strain] }, s).textContent = tr.id + ' · ' + (tr.strain === 'C57' ? 'C57' : 'WD');
      DAYS.forEach(function (d) {
        var x0 = L + (d - 1) * colW + (colW - gw) / 2;
        for (var z = 1; z <= 8; z++) {
          var cell = zoneCell(z), o = own[z + '_' + d];
          var a = o ? 0.22 + 0.78 * clamp((o[1] - 30) / 70, 0, 1) : 0;
          svg('rect', { x: x0 + cell.col * (q + 1), y: y0 + cell.row * (q + 1), width: q, height: q,
            fill: o ? hexA(mc[o[0]] || '#888888', a) : '#191919', 'data-i': info.length }, s);
          info.push({ tr: tr, d: d, z: z, o: o, col: o ? mc[o[0]] : null });
        }
      });
    });
    s.onmousemove = function (ev) {
      var i = ev.target.dataset ? ev.target.dataset.i : null;
      if (i == null) { hideTip(); return; }
      var c = info[+i];
      showTip(ev, c.tr.id + ' · zone ' + c.z + ' · day ' + c.d, c.o ?
        [{ color: c.col, value: c.o[0], label: 'made ' + c.o[1] + '% of the zone’s male reads' }] : [{ value: 'No male reads' }]);
    };
    s.onmouseleave = hideTip;
  }
  var RANK1 = { hidden: {} };
  function drawRank1() {
    var series = ['C57', 'WD'].map(function (st) {
      var vals = DAYS.map(function () { return []; });
      trialsOf(st).forEach(function (tr) {
        (FIGS.rank1[tr.id] || []).forEach(function (zs, d) { zs.forEach(function (v) { if (v != null) vals[d].push(v); }); });
      });
      return { key: st, label: (st === 'C57' ? 'C57' : 'WD') + ' males', color: COL[st + 'M'],
        m: vals.map(mean), e: vals.map(sem), n: vals.map(function (a) { return a.length; }) };
    });
    lineChart($('cw-rank1'), { series: series, hidden: RANK1.hidden, zero: false, unit: 'zone-days', height: PAIR_H,
      yLabel: '% male reads from the zone’s top male' });
    toggleLegend($('cw-rank1-legend'), series, RANK1.hidden, drawRank1);
    figCaption($('cw-rank1-fig'), ['2B'], 'LMM: genotype P = 0.025; log(day) P < 0.0001; genotype:log(day) P = 0.004');
  }

  // Kernel density with R's default bandwidth (bw.nrd0) times `adjust`, as ggplot's
  // geom_density computes it; the paper's Figs 2D and S3C use adjust = 0.25.
  function kde(vals, x0, x1, n, adjust) {
    var s = vals.slice().sort(function (a, b) { return a - b; }), N = s.length;
    var q = function (p) { var i = (N - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(N - 1, lo + 1)] - s[lo]) * (i - lo); };
    var lo = Math.min(sd(s), (q(0.75) - q(0.25)) / 1.34) || sd(s) || 1;
    var bw = 0.9 * lo * Math.pow(N, -0.2) * (adjust || 1), out = [];
    for (var i = 0; i <= n; i++) {
      var x = x0 + (x1 - x0) * i / n, dsum = 0;
      for (var j = 0; j < N; j++) { var u = (x - s[j]) / bw; dsum += Math.exp(-0.5 * u * u); }
      out.push([x, dsum / (N * bw * Math.sqrt(2 * Math.PI))]);
    }
    return out;
  }
  var PS = { sex: 'M' };
  function setupPAS() {
    segmented($('cw-pas-sex'), function (v) { PS.sex = v; drawPAS(); });
    REDRAW.push(drawPAS);
    drawPAS();
  }
  function drawPAS() {
    var sex = PS.sex, pas = FIGS.daily.pas, rows = [];
    FIGS.mice.forEach(function (mo, i) { if (mo.sex === sex && pas[i]) rows.push({ mo: mo, v: pas[i] }); });
    // trajectories
    var s = $('cw-pas-lines'), H = 300, W = sizeSvg(s, H), L = 52, Rr = 12, T = 12, B = 38, lo = 0, hi = 1;
    rows.forEach(function (r) { r.v.forEach(function (v) { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
    var ticks = niceTicks(lo, hi, 6), y = lin(ticks[0], ticks[ticks.length - 1], H - B, T), x = lin(1, 10, L + 10, W - Rr - 6);
    yAxis(s, ticks, y, L, W - Rr);
    DAYS.forEach(function (d) { svg('text', { x: x(d), y: H - B + 16, 'text-anchor': 'middle' }, s).textContent = d; });
    axisTitles(s, W, H, L, Rr, T, B, 'Day', 'Priority access score');
    svg('line', { x1: L, x2: W - Rr, y1: y(0), y2: y(0), stroke: '#77756c', 'stroke-dasharray': '5 4' }, s);
    rows.forEach(function (r) {
      var col = COL[groupKey(r.mo)];
      var p = svg('path', { d: pathOf(r.v.map(function (v, i) { return v == null ? null : [x(i + 1), y(v)]; })),
        fill: 'none', stroke: col, 'stroke-width': 1.3, 'stroke-opacity': 0.55 }, s);
      p.addEventListener('mouseenter', function () { p.setAttribute('stroke-opacity', 1); p.setAttribute('stroke-width', 2.6); });
      p.addEventListener('mousemove', function (ev) {
        var last = r.v[r.v.length - 1];
        showTip(ev, r.mo.name + ' · ' + r.mo.t, [{ color: col, value: last == null ? '–' : last.toFixed(2), label: 'on day 10' }]);
      });
      p.addEventListener('mouseleave', function () { p.setAttribute('stroke-opacity', 0.55); p.setAttribute('stroke-width', 1.3); hideTip(); });
    });
    // day-10 distributions
    var s2 = $('cw-pas-density'), W2 = sizeSvg(s2, H), L2 = 52, all = [];
    var dens = ['C57', 'WD'].map(function (st) {
      var v = rows.filter(function (r) { return r.mo.strain === st && r.v[9] != null; }).map(function (r) { return r.v[9]; });
      all = all.concat(v);
      return { st: st, v: v };
    });
    var x0 = Math.min.apply(null, all) - 3, x1 = Math.max.apply(null, all) + 3, ymax = 0;
    dens.forEach(function (d) { d.k = kde(d.v, x0, x1, 240, 0.25); d.k.forEach(function (p) { ymax = Math.max(ymax, p[1]); }); });
    var t2 = niceTicks(0, ymax, 4), yy = lin(0, t2[t2.length - 1], H - B, T), xx = lin(x0, x1, L2 + 6, W2 - 12);
    yAxis(s2, t2, yy, L2, W2 - 12, fixed(2));
    niceTicks(x0, x1, 6).forEach(function (v) {
      if (v >= x0 && v <= x1) svg('text', { x: xx(v), y: H - B + 16, 'text-anchor': 'middle' }, s2).textContent = v;
    });
    axisTitles(s2, W2, H, L2, 12, T, B, 'Day 10 priority access score', 'Density');
    dens.forEach(function (d) {
      var col = COL[d.st + sex];
      var pts = d.k.map(function (p) { return xx(p[0]).toFixed(1) + ',' + yy(p[1]).toFixed(1); });
      svg('path', { d: 'M' + xx(x0) + ',' + yy(0) + 'L' + pts.join('L') + 'L' + xx(x1) + ',' + yy(0) + 'Z',
        fill: hexA(col, 0.4), stroke: col, 'stroke-width': 1.6 }, s2);
    });
    svg('line', { x1: xx(0), x2: xx(0), y1: T, y2: H - B, stroke: '#9a978c', 'stroke-dasharray': '5 4' }, s2);
    legend($('cw-pas-legend'), dens.map(function (d) {
      return { color: COL[d.st + sex], label: (d.st === 'C57' ? 'C57 ' : 'WD ') + (sex === 'M' ? 'males' : 'females') + ' (n = ' + d.v.length + ')' };
    }));
    figCaption($('cw-pas-fig'), sex === 'M' ? ['2D', 'S2D'] : ['S3B', 'S3C'], sex === 'M' ?
      'excess mass test for unimodality: C57 males P < 0.0001; WD males P = 0.02' :
      'excess mass test for unimodality: C57 females P = 0.64; WD females P = 0.95');
  }
  function drawWin() {
    var s = $('cw-win'), H = PAIR_H, W = sizeSvg(s, H), L = 58, Rr = 20, T = 12, B = 38;
    var y = lin(0, 1, H - B, T), xh = L + (W - L - Rr) * 0.28, xa = L + (W - L - Rr) * 0.72;
    yAxis(s, [0, 0.25, 0.5, 0.75, 1], y, L, W - Rr, fixed(2));
    svg('text', { x: xh, y: H - B + 16, 'text-anchor': 'middle', fill: INK }, s).textContent = 'Home';
    svg('text', { x: xa, y: H - B + 16, 'text-anchor': 'middle', fill: INK }, s).textContent = 'Away';
    axisTitles(s, W, H, L, Rr, T, B, 'Location', 'Overall win rate');
    var n = { C57: 0, WD: 0 };
    (FIGS.winrate || []).forEach(function (w) {
      var col = COL[w.strain + 'M'], g = svg('g', { 'stroke-opacity': 0.75 }, s);
      n[w.strain] = (n[w.strain] || 0) + 1;
      svg('line', { x1: xh, x2: xa, y1: y(w.home), y2: y(w.away), stroke: col, 'stroke-width': 1.6 }, g);
      svg('circle', { cx: xh, cy: y(w.home), r: 3.5, fill: col }, g);
      svg('circle', { cx: xa, cy: y(w.away), r: 3.5, fill: col }, g);
      g.addEventListener('mouseenter', function () { g.setAttribute('stroke-opacity', 1); });
      g.addEventListener('mousemove', function (ev) {
        showTip(ev, w.name + ' · ' + w.t, [{ color: col, value: Math.round(w.home * 100) + '%', label: 'wins at home' },
          { color: col, value: Math.round(w.away * 100) + '%', label: 'wins away' }]);
      });
      g.addEventListener('mouseleave', function () { g.setAttribute('stroke-opacity', 0.75); hideTip(); });
    });
    s._n = n;
  }
  // Males grouped by the sign of their day-10 priority access score, as in Figs 2F and S2F
  // (a male with no day-10 score, Anubis, is left out).
  function pasSign(i) {
    var p = FIGS.daily.pas[i];
    return p && p[9] != null ? (p[9] > 0 ? 'pos' : 'neg') : null;
  }
  function holderGroups(byStrain) {
    var out = [], idx = {};
    FIGS.mice.forEach(function (mo, i) { idx[mo.t + '/' + mo.name] = i; });
    var sign = function (mo) { return pasSign(idx[mo.t + '/' + mo.name]); };
    if (!byStrain) {
      return [{ key: 'pos', label: 'Males, PAS > 0', color: '#e3b341', test: function (mo) { return mo.sex === 'M' && sign(mo) === 'pos'; } },
        { key: 'neg', label: 'Males, PAS ≤ 0', color: '#8f8cc4', test: function (mo) { return mo.sex === 'M' && sign(mo) === 'neg'; } }];
    }
    ['C57', 'WD'].forEach(function (st) {
      [['pos', 'PAS > 0', false], ['neg', 'PAS ≤ 0', true]].forEach(function (pg) {
        out.push({ key: st + pg[0], label: (st === 'C57' ? 'C57' : 'WD') + ' males, ' + pg[1], color: COL[st + 'M'], dash: pg[2],
          test: function (mo) { return mo.sex === 'M' && mo.strain === st && sign(mo) === pg[0]; } });
      });
    });
    return out;
  }
  // Fig 2F as published: a male counts from his first day with any time with females, and
  // his total carries over a day without data (the deposited script differs slightly; see
  // the data notes).
  function fmPublished() {
    return FIGS.daily.fm_time_cum_min.map(function (v) {
      if (!v) return null;
      var out = [], last = null, entered = false;
      for (var d = 0; d < 10; d++) {
        var x = v[d] != null ? v[d] : last;
        if (x != null && x > 0) entered = true;
        out.push(entered ? x : null);
        if (v[d] != null) last = v[d];
      }
      return out;
    });
  }
  var FM = { hidden: {}, hiddenZones: {} };
  function drawFM() {
    FIGS.daily.fm_pub = FIGS.daily.fm_pub || fmPublished();
    var fm = groupSeries('fm_pub', holderGroups(true));
    lineChart($('cw-fm'), { series: fm, hidden: FM.hidden, height: PAIR_H,
      yLabel: 'Cumulative time with females (min)', fmt: fixed(0) });
    toggleLegend($('cw-fm-legend'), fm, FM.hidden, drawFM);
    figCaption($('cw-fm-fig'), ['2F'], 'LMM: log(day) P < 0.0001; genotype:log(day) P = 0.0004; PAS:log(day) P < 0.0001',
      'Drawn as published; the deposited script differs slightly (see About the data).');
    var zones = groupSeries('zones_visited', holderGroups(false));
    lineChart($('cw-s2f'), { series: zones, hidden: FM.hiddenZones, height: PAIR_H, zero: false,
      yLabel: 'Zones visited', fmt: fixed(2) });
    toggleLegend($('cw-s2f-legend'), zones, FM.hiddenZones, drawFM);
    figCaption($('cw-s2f-fig'), ['S2F'], 'LMM: day P = 0.007; PASstatus:day P = 0.011');
  }
  function drawWinFM() {
    drawWin(); drawFM();
    var n = $('cw-win')._n || {};
    figCaption($('cw-win-fig'), ['2E'], 'LMM: location P < 0.0001 (' + n.C57 + ' C57 and ' + n.WD + ' WD territorial males)');
  }
  function setupWinFM() {
    REDRAW.push(drawWinFM);
    drawWinFM();
  }

  // ---------- encounters between pairs of mice (Figs 2C, S2C, S2E, S3F) ----------
  var DY = { type: 'MM', view: 'dur', hidden: {} };
  var DY_INFO = {
    MM: { figs: ['2C', 'S2C'], ymax: 150, col: { C57: COL.C57M, WD: COL.WDM }, label: 'male–male',
      stats: '2C LMM: log(day) P < 0.0001; genotype:log(day) P = 0.006 · S2C LMM: genotype P < 0.001; log(day) P < 0.0001' },
    FM: { figs: ['S2E'], ymax: 40, col: { C57: COL.C57, WD: COL.WD }, label: 'female–male',
      stats: 'LMM: TrialTime P < 0.0001; genotype P < 0.0001' },
    FF: { figs: ['S3F'], ymax: 40, col: { C57: COL.C57F, WD: COL.WDF }, label: 'female–female',
      stats: 'LMM: log(TrialTime) P < 0.0001; genotype:time P = 0.023' } };
  function setupDyadic() {
    $('cw-dy-type').addEventListener('change', function () { DY.type = this.value; drawDyadic(); });
    segmented($('cw-dy-view'), function (v) { DY.view = v; drawDyadic(); });
    REDRAW.push(drawDyadic);
    drawDyadic();
  }
  function drawDyadic() {
    var info = DY_INFO[DY.type], cv = $('cw-dy-canvas'), fs = $('cw-dy-freq');
    // toggleAttribute, not .hidden: SVG elements have no `hidden` property, only the attribute
    cv.toggleAttribute('hidden', DY.view !== 'dur'); fs.toggleAttribute('hidden', DY.view === 'dur');
    if (DY.view === 'dur') drawDyCanvas(info);
    else {
      var series = ['C57', 'WD'].map(function (st) {
        var per = trialsOf(st).map(function (tr) { return ((FIGS.dyadic_freq[DY.type] || {})[tr.id]) || []; });
        var m = [], e = [], n = [];
        DAYS.forEach(function (d) {
          var col = per.map(function (p) { return p[d - 1]; }).filter(function (v) { return v != null; });
          m.push(mean(col)); e.push(sem(col)); n.push(col.length);
        });
        return { key: st, label: STRAIN_NAME[st], color: info.col[st], m: m, e: e, n: n,
          indiv: trialsOf(st).map(function (tr, k) { return { label: tr.id, v: per[k] }; }) };
      });
      lineChart(fs, { series: series, hidden: DY.hidden, unit: 'trials', fmt: fixed(0), height: 300,
        yLabel: info.label.charAt(0).toUpperCase() + info.label.slice(1) + ' encounters per trial' });
    }
    legend($('cw-dy-legend'), ['C57', 'WD'].map(function (st) {
      var d = ((FIGS.dyadic[DY.type] || {})[st]) || { min: [] };
      return { color: info.col[st], label: STRAIN_NAME[st] + ' (' + fmtN(d.min.length) + ' encounters)', cls: 'dot' };
    }));
    figCaption($('cw-dy-fig'), info.figs, info.stats, DY.view === 'freq' && DY.type === 'MM' ?
      'Days with no encounters count as zero here; the published means skipped them (see About the data).' : null);
  }
  function drawDyCanvas(info) {
    var cv = $('cw-dy-canvas'), C = sizeCanvas(cv, 320), c = C.c, W = C.W, H = C.H;
    var L = 52, gap = 18, T = 30, B = 36, fw = (W - L - gap - 8) / 2, ymax = info.ymax;
    var yt = niceTicks(0, ymax, 5), y = lin(0, yt[yt.length - 1], H - B, T);
    c.font = '11px ' + FONT; c.textAlign = 'right'; c.fillStyle = MUTED;
    yt.forEach(function (t) {
      c.fillText(t, L - 6, y(t) + 4);
      c.strokeStyle = t === 0 ? '#383835' : '#2c2c2a'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(L, Math.round(y(t)) + 0.5); c.lineTo(W - 8, Math.round(y(t)) + 0.5); c.stroke();
    });
    c.save(); c.translate(12, (T + H - B) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillStyle = '#c3c2b7';
    c.fillText('Encounter duration (min)', 0, 0); c.restore();
    ['C57', 'WD'].forEach(function (st, k) {
      // t is the trial day plus the fraction of it elapsed, as the paper plots it (1.0 = start of day 1)
      var d = ((FIGS.dyadic[DY.type] || {})[st]) || { t: [], min: [] };
      var fx = L + k * (fw + gap), tmax = 11;
      d.t.forEach(function (t) { tmax = Math.max(tmax, t); });
      var x = lin(1, Math.ceil(tmax), fx + 6, fx + fw - 6), over = 0;
      c.fillStyle = '#c3c2b7'; c.textAlign = 'center'; c.font = '12px ' + FONT;
      c.fillText(STRAIN_NAME[st], fx + fw / 2, 16);
      c.fillStyle = MUTED; c.font = '11px ' + FONT;
      for (var dd = 1; dd < Math.ceil(tmax); dd++) c.fillText(dd, x(dd), H - B + 16);
      c.fillStyle = '#c3c2b7'; c.fillText('Day', fx + fw / 2, H - 4);
      c.fillStyle = hexA(info.col[st], 0.4);
      for (var i = 0; i < d.t.length; i++) {
        var v = d.min[i];
        if (v > ymax) { over++; v = ymax; }
        c.fillRect(x(d.t[i]) - 1.2, y(v) - 1.2, 2.4, 2.4);
      }
      if (over) { c.fillStyle = MUTED; c.textAlign = 'right'; c.fillText(over + ' longer, drawn at the top', fx + fw - 6, T - 4); }
    });
  }

  // ---------- social: group make-up (Fig 4A) ----------
  // Colour on log10(1 + hours), blue through grey and yellow to red, which reproduces the
  // look of the paper's Fig 4A (seconds-long make-ups blue, the commonest red).
  var COMP_STOPS = [[0, '#26309a'], [0.9, '#3346d6'], [1.3, '#8a8aa0'], [1.9, '#f0dc3a'], [2.2, '#f39a2c'], [2.52, '#e8322a']];
  function compColor(v) { return ramp(COMP_STOPS, Math.log10(1 + v)); }
  function drawComp() {
    var mx = 0, maxM = 0, maxF = 0;
    ['C57', 'WD'].forEach(function (st) {
      FIGS.comp_hours[st].forEach(function (row, i) {
        row.forEach(function (v, j) { if (v > 0) { mx = Math.max(mx, v); maxM = Math.max(maxM, i); maxF = Math.max(maxF, j); } });
      });
    });
    if (FIGS.comp_max) { maxM = Math.max(maxM, FIGS.comp_max[0]); maxF = Math.max(maxF, FIGS.comp_max[1]); }
    ['C57', 'WD'].forEach(function (st) {
      var s = $('cw-comp-' + st), M = FIGS.comp_hours[st];
      var W0 = Math.max(260, s.clientWidth || s.parentNode.clientWidth || 500), L = 44, T = 36;
      var cw = (W0 - L - 6) / (maxF + 1), ch = Math.min(cw, 34), H = T + (maxM + 1) * ch + 8;
      sizeSvg(s, H);
      svg('text', { x: L + (maxF + 1) * cw / 2, y: 11, 'text-anchor': 'middle', class: 'cw-axis-title' }, s).textContent = 'Females present';
      svg('text', { transform: 'translate(10,' + (T + (maxM + 1) * ch / 2) + ') rotate(-90)', 'text-anchor': 'middle',
        class: 'cw-axis-title' }, s).textContent = 'Males present';
      for (var j = 0; j <= maxF; j++) svg('text', { x: L + (j + 0.5) * cw, y: T - 6, 'text-anchor': 'middle' }, s).textContent = j;
      for (var i = 0; i <= maxM; i++) {
        svg('text', { x: L - 6, y: T + (i + 0.5) * ch + 4, 'text-anchor': 'end' }, s).textContent = i;
        for (j = 0; j <= maxF; j++) {
          if (i === 0 && j === 0) continue;
          var v = (M[i] || [])[j] || 0;
          svg('rect', { x: L + j * cw + 1, y: T + i * ch + 1, width: cw - 2, height: ch - 2, rx: 2,
            fill: v > 0 ? compColor(v) : '#161616', 'data-i': i, 'data-j': j }, s);
        }
      }
      s.onmousemove = function (ev) {
        var ds = ev.target.dataset || {};
        if (ds.i == null) { hideTip(); return; }
        var v = (M[+ds.i] || [])[+ds.j] || 0, nm = +ds.i, nf = +ds.j;
        var what = nm + nf === 1 ? (nm ? 'A male alone' : 'A female alone') :
          nm + (nm === 1 ? ' male' : ' males') + ' + ' + nf + (nf === 1 ? ' female' : ' females');
        var txt = v >= 1 ? v.toFixed(1) + ' h' : v * 60 >= 1 ? (v * 60).toFixed(1) + ' min' : (v * 3600).toFixed(0) + ' s';
        showTip(ev, STRAIN_NAME[st] + ': ' + what, [{ value: v > 0 ? txt : 'never', label: v > 0 ? 'per trial (mean)' : '' }]);
      };
      s.onmouseleave = hideTip;
    });
    var sc = $('cw-comp-scale'), top = COMP_STOPS[COMP_STOPS.length - 1][0];
    sc.replaceChildren();
    var bar = h('span', 'bar', sc);
    bar.style.background = 'linear-gradient(90deg,' + COMP_STOPS.map(function (s) { return s[1] + ' ' + (s[0] / top * 100) + '%'; }).join(',') + ')';
    sc.appendChild(document.createTextNode('minutes → 1 h → 10 h → 100 h → ' + Math.round(mx) + ' h per trial (log scale)'));
    figCaption($('cw-comp-fig'), ['4A'], null);
  }

  // ---------- networks in motion: a sliding window over the trial ----------
  // Mirrors the lab's animation code (gbi_SocialBehavior.Rmd): an SRI network from the
  // grouping events in each window, one frame per hour, each frame's Fruchterman-Reingold
  // layout started from the last (igraph's layout_with_fr: niter = 50, start.temp = 0.02).
  // A weak pull to the centre keeps mice with no partners near the rest.
  var NW = { t: 1, playing: false, last: null, speed: 6, win: 6, groups: true, ids: ['T006', 'T007'], max: 1,
    frames: {}, views: [{}, {}], snap: true };
  var NW_KEYS = ['c57', 'wd'];
  function setupNetworks() {
    NW_KEYS.forEach(function (k, i) {
      var sel = $('cw-nw-' + k);
      fillTrials(sel, NW.ids[i], k === 'c57' ? 'C57' : 'WD');
      sel.addEventListener('change', function () { NW.ids[i] = sel.value; NW.views[i] = {}; NW.snap = true; nwStart(); });
      var cv = $('cw-nw-cv-' + k);
      cv.addEventListener('mousemove', function (ev) { nwHover(ev, i); });
      cv.addEventListener('mouseleave', hideTip);
    });
    $('cw-nw-play').addEventListener('click', function () {
      if (NW.t >= NW.max) NW.t = 1;
      NW.playing = !NW.playing; NW.last = null;
      $('cw-nw-play').innerHTML = NW.playing ? '&#10074;&#10074;' : '&#9654;';
      $('cw-nw-play').setAttribute('aria-label', NW.playing ? 'Pause' : 'Play');
      if (NW.playing) requestAnimationFrame(nwTick);
    });
    $('cw-nw-time').addEventListener('input', function () { NW.t = 1 + this.value / 1000 * (NW.max - 1); NW.snap = true; drawNets(); });
    $('cw-nw-window').addEventListener('change', function () { NW.win = +this.value; NW.snap = true; drawNets(); });
    $('cw-nw-speed').addEventListener('change', function () { NW.speed = +this.value; });
    $('cw-nw-groups').addEventListener('change', function () { NW.groups = this.checked; drawNets(); });
    legend($('cw-nw-legend'), GROUPS.map(function (g) { return { color: COL[g.key], label: g.label, cls: 'dot' }; })
      .concat([{ color: MUTED, label: 'No partners in the window', cls: 'ring' }, { color: '#3a3a36', label: 'Louvain group', cls: 'box' }]));
    REDRAW.push(function () { NW.snap = true; drawNets(); });
    NW.t = 36;                                     // the end of the second night
    nwStart();
  }
  function nwStart() {
    Promise.all(NW.ids.map(loadSnet)).then(function () {
      NW.max = Math.max.apply(null, NW.ids.map(function (id) { return SNET[id].n.length; }));
      NW.t = clamp(NW.t, 1, NW.max); NW.snap = true;
      drawNets();
    });
  }
  function nwTick(now) {
    if (!NW.playing) return;
    if (NW.last != null) NW.t = Math.min(NW.max, NW.t + (now - NW.last) / 1000 * NW.speed);
    NW.last = now;
    drawNets();
    if (NW.t >= NW.max) {
      NW.playing = false; $('cw-nw-play').innerHTML = '&#9654;'; $('cw-nw-play').setAttribute('aria-label', 'Play');
      return;
    }
    requestAnimationFrame(nwTick);
  }
  function drawNets() {
    $('cw-nw-time').value = Math.round((NW.t - 1) / Math.max(1, NW.max - 1) * 1000);
    var hr = Math.floor(NW.t);
    $('cw-nw-clock').textContent = 'Hour ' + hr + ' after release · window ' + Math.max(0, hr - NW.win) + '–' + hr + ' h';
    NW.ids.forEach(function (id, i) { if (SNET[id]) drawNet($('cw-nw-cv-' + NW_KEYS[i]), id, i); });
    NW.snap = false;
  }
  // Fruchterman-Reingold as igraph implements it: repulsion 1/d between all pairs,
  // attraction d^2 * weight along links, moves capped by a linearly cooling temperature.
  function frLayout(P, n, edges, niter, temp0, grav, rnd) {
    var dx = new Float64Array(n), dy = new Float64Array(n), temp = temp0, cool = temp0 / niter;
    for (var it = 0; it < niter; it++) {
      dx.fill(0); dy.fill(0);
      for (var v = 0; v < n; v++) {
        for (var u = v + 1; u < n; u++) {
          var ex = P[2 * v] - P[2 * u], ey = P[2 * v + 1] - P[2 * u + 1], d2 = ex * ex + ey * ey;
          if (d2 < 1e-12) { ex = (rnd() - 0.5) * 1e-3; ey = (rnd() - 0.5) * 1e-3; d2 = ex * ex + ey * ey; }
          dx[v] += ex / d2; dy[v] += ey / d2; dx[u] -= ex / d2; dy[u] -= ey / d2;
        }
      }
      for (var e = 0; e < edges.length; e++) {
        var a = edges[e][0], b = edges[e][1];
        var fx = P[2 * a] - P[2 * b], fy = P[2 * a + 1] - P[2 * b + 1], dl = Math.sqrt(fx * fx + fy * fy) * edges[e][2];
        dx[a] -= fx * dl; dy[a] -= fy * dl; dx[b] += fx * dl; dy[b] += fy * dl;
      }
      for (v = 0; v < n; v++) {
        var gx = P[2 * v], gy = P[2 * v + 1], g = Math.sqrt(gx * gx + gy * gy) * grav;
        dx[v] -= gx * g; dy[v] -= gy * g;
        var len = Math.sqrt(dx[v] * dx[v] + dy[v] * dy[v]);
        if (len > temp) { dx[v] *= temp / len; dy[v] *= temp / len; }
        P[2 * v] += dx[v]; P[2 * v + 1] += dy[v];
      }
      temp -= cool;
    }
  }
  // Louvain community detection (Blondel et al. 2008): move nodes between communities
  // while modularity improves, merge each community into a node, repeat.
  function louvain(n, edges) {
    var label = [], adj = [], nodes = n, i, j;
    for (i = 0; i < n; i++) { label.push(i); adj.push({}); }
    edges.forEach(function (e) {
      if (e[2] <= 0) return;
      adj[e[0]][e[1]] = (adj[e[0]][e[1]] || 0) + e[2];
      adj[e[1]][e[0]] = (adj[e[1]][e[0]] || 0) + e[2];
    });
    for (var level = 0; level < 8; level++) {
      var k = [], m2 = 0;
      for (i = 0; i < nodes; i++) { var s = 0; for (j in adj[i]) s += adj[i][j]; k.push(s); m2 += s; }
      if (!m2) break;
      var comm = [], tot = [];
      for (i = 0; i < nodes; i++) { comm.push(i); tot.push(k[i]); }
      var moved = false, improved = true, guard = 0;
      while (improved && guard++ < 30) {
        improved = false;
        for (i = 0; i < nodes; i++) {
          var ci = comm[i], wTo = {};
          for (j in adj[i]) { if (+j !== i) wTo[comm[j]] = (wTo[comm[j]] || 0) + adj[i][j]; }
          tot[ci] -= k[i];
          var best = ci, bestGain = (wTo[ci] || 0) - tot[ci] * k[i] / m2;
          for (var cc in wTo) {
            var gain = wTo[cc] - tot[cc] * k[i] / m2;
            if (gain > bestGain + 1e-12) { bestGain = gain; best = +cc; }
          }
          tot[best] += k[i];
          if (best !== ci) { comm[i] = best; improved = true; moved = true; }
        }
      }
      if (!moved) break;
      var ren = {}, nc = 0;
      for (i = 0; i < nodes; i++) if (ren[comm[i]] == null) ren[comm[i]] = nc++;
      for (i = 0; i < n; i++) label[i] = ren[comm[label[i]]];
      var nadj = [];
      for (i = 0; i < nc; i++) nadj.push({});
      for (i = 0; i < nodes; i++) {
        for (j in adj[i]) { var a = ren[comm[i]], b = ren[comm[j]]; nadj[a][b] = (nadj[a][b] || 0) + adj[i][j]; }
      }
      adj = nadj; nodes = nc;
    }
    return label;
  }
  var NW_GRAV = 0.06;
  function nwFrames(id, w) {
    var key = id + '_' + w;
    if (NW.frames[key]) return NW.frames[key];
    var sn = SNET[id], N = TRIAL[id].mice.length, H = sn.n.length, pa = [], pb = [];
    for (var a = 0; a < N; a++) for (var b = a + 1; b < N; b++) { pa.push(a); pb.push(b); }
    var xw = new Float64Array(pa.length), nw = new Float64Array(N), rnd = rng(20200813);
    function addHour(hh, sign) {
      var nn = sn.n[hh], xs = sn.x[hh];
      for (var i = 0; i < N; i++) nw[i] += sign * nn[i];
      for (var k = 0; k < xs.length; k += 2) xw[xs[k]] += sign * xs[k + 1];
    }
    var P = new Float64Array(2 * N), frames = [];
    for (var i = 0; i < N; i++) { var ang = i / N * 2 * Math.PI; P[2 * i] = Math.cos(ang); P[2 * i + 1] = Math.sin(ang); }
    for (var f = 1; f <= H; f++) {
      addHour(f - 1, 1);
      if (f - 1 - w >= 0) addHour(f - 1 - w, -1);
      var edges = [], deg = new Int16Array(N);
      for (var p = 0; p < pa.length; p++) {
        if (xw[p] <= 0) continue;
        var den = nw[pa[p]] + nw[pb[p]] - xw[p];
        edges.push([pa[p], pb[p], den > 0 ? xw[p] / den : 0]);
        deg[pa[p]]++; deg[pb[p]]++;
      }
      frLayout(P, N, edges, f === 1 ? 400 : 50, f === 1 ? 0.2 : 0.02, NW_GRAV, rnd);
      frames.push({ pos: Float64Array.from(P), edges: edges, deg: deg, comm: louvain(N, edges) });
    }
    NW.frames[key] = frames;
    return frames;
  }
  function hull(pts) {   // monotone chain convex hull of [x, y] points
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return pts;
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [];
    pts.forEach(function (p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for (var i = pts.length - 1; i >= 0; i--) {
      var p = pts[i];
      while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
      up.push(p);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function drawHulls(c, fr, S, alpha, pad) {
    if (alpha <= 0.01) return;
    var byComm = {};
    fr.comm.forEach(function (cm, i) { if (fr.deg[i] > 0) (byComm[cm] = byComm[cm] || []).push(S[i]); });
    c.save();
    c.globalAlpha = alpha; c.lineJoin = 'round'; c.lineCap = 'round';
    Object.keys(byComm).forEach(function (cm) {
      var pts = byComm[cm];
      if (pts.length < 2) return;
      var hp = hull(pts);
      c.beginPath();
      hp.forEach(function (p, k) { if (k) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
      c.closePath();
      c.strokeStyle = '#3a3a36'; c.lineWidth = 2 * pad + 2; c.stroke();
      c.strokeStyle = '#171716'; c.lineWidth = 2 * pad; c.stroke();
      c.fillStyle = '#171716'; c.fill();
    });
    c.restore();
  }
  function drawNet(cv, id, k) {
    var tr = TRIAL[id], frames = nwFrames(id, NW.win), H = frames.length, N = tr.mice.length;
    var W0 = cv.clientWidth || 520, Hc = Math.round(clamp(W0 * 0.82, 320, 480)), C = sizeCanvas(cv, Hc), c = C.c, W = C.W;
    var f = clamp(NW.t, 1, H), k0 = Math.floor(f), k1 = Math.min(H, k0 + 1), u = f - k0;
    u = u * u * (3 - 2 * u);
    var A = frames[k0 - 1], B = frames[k1 - 1], P = [], i;
    for (i = 0; i < N; i++) P.push([A.pos[2 * i] * (1 - u) + B.pos[2 * i] * u, A.pos[2 * i + 1] * (1 - u) + B.pos[2 * i + 1] * u]);
    // fit the view to the mice, easing so the camera does not jump
    var top = 40, pad = 26, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    P.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var tgt = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
      s: Math.min((W - 2 * pad) / Math.max(x1 - x0, 0.5), (Hc - top - 2 * pad) / Math.max(y1 - y0, 0.5)) };
    var v = NW.views[k];
    if (NW.snap || !v.s) { v.cx = tgt.cx; v.cy = tgt.cy; v.s = tgt.s; }
    else { v.cx += (tgt.cx - v.cx) * 0.12; v.cy += (tgt.cy - v.cy) * 0.12; v.s += (tgt.s - v.s) * 0.12; }
    var S = P.map(function (p) { return [W / 2 + (p[0] - v.cx) * v.s, top + (Hc - top) / 2 + (p[1] - v.cy) * v.s]; });
    var deg = []; for (i = 0; i < N; i++) deg.push(A.deg[i] * (1 - u) + B.deg[i] * u);
    var rad = deg.map(function (d) { return d < 0.5 ? 2.6 : 3 + 1.45 * Math.sqrt(d); });
    // header
    var t = f * 3600, night = isNight(tr, t), fr = u < 0.5 ? A : B;
    var groups = {}, alone = 0;
    fr.comm.forEach(function (cm, j) { if (fr.deg[j] > 0) groups[cm] = 1; else alone++; });
    c.textAlign = 'left'; c.font = '12.5px ' + FONT; c.fillStyle = COL[tr.strain];
    c.fillText('Day ' + dayOf(tr, t) + ' · ' + fmtClock(tr, t) + (night ? ' · night' : ''), 2, 14);
    c.font = '11px ' + FONT; c.fillStyle = MUTED;
    c.fillText(fr.edges.length + ' links · ' + Object.keys(groups).length + ' groups · ' + alone + ' without partners', 2, 30);
    if (NW.groups) { drawHulls(c, A, S, 1 - u, 15); drawHulls(c, B, S, u, 15); }
    // links: union of both frames, weights blended
    var wmap = {};
    A.edges.forEach(function (e) { wmap[e[0] * N + e[1]] = [e[0], e[1], e[2] * (1 - u)]; });
    B.edges.forEach(function (e) {
      var kk = e[0] * N + e[1];
      if (wmap[kk]) wmap[kk][2] += e[2] * u; else wmap[kk] = [e[0], e[1], e[2] * u];
    });
    c.lineCap = 'round';
    Object.keys(wmap).forEach(function (kk) {
      var e = wmap[kk], p = S[e[0]], q = S[e[1]], w = e[2];
      if (w < 0.004) return;
      var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1];
      c.strokeStyle = 'rgba(190,188,180,' + (0.16 + 0.5 * Math.min(1, w * 1.6)).toFixed(3) + ')';
      c.lineWidth = 0.5 + 7 * w;
      c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(mx - dy * 0.2, my + dx * 0.2, q[0], q[1]); c.stroke();
    });
    // mice
    c.font = '9.5px ' + FONT; c.textAlign = 'center';
    var hits = [];
    tr.mice.forEach(function (mo, j) {
      var col = COL[tr.strain + mo.sex], p = S[j];
      c.beginPath(); c.arc(p[0], p[1], rad[j], 0, Math.PI * 2);
      if (deg[j] < 0.5) { c.strokeStyle = hexA(col, 0.55); c.lineWidth = 1.2; c.stroke(); }
      else { c.fillStyle = col; c.fill(); c.strokeStyle = '#0d0d0d'; c.lineWidth = 1; c.stroke(); }
      c.fillStyle = deg[j] < 0.5 ? '#6a6862' : '#a9a79c';
      c.fillText(mo.code, p[0], p[1] - rad[j] - 3);
      hits.push({ x: p[0], y: p[1], j: j });
    });
    c.textAlign = 'left';
    cv._hits = hits; cv._frame = fr; cv._tr = tr;
  }
  function nwHover(ev, k) {
    var cv = $('cw-nw-cv-' + NW_KEYS[k]), hits = cv._hits || [], r = cv.getBoundingClientRect();
    var mx = ev.clientX - r.left, my = ev.clientY - r.top, best = null, bd = 144;
    hits.forEach(function (p) { var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); if (d < bd) { bd = d; best = p; } });
    if (!best) { hideTip(); return; }
    var tr = cv._tr, fr = cv._frame, mo = tr.mice[best.j], ties = [];
    fr.edges.forEach(function (e) {
      if (e[0] === best.j) ties.push([e[1], e[2]]); else if (e[1] === best.j) ties.push([e[0], e[2]]);
    });
    ties.sort(function (a, b) { return b[1] - a[1]; });
    var rows = [{ color: COL[tr.strain + mo.sex], value: ties.length, label: ties.length === 1 ? 'partner in the window' : 'partners in the window' }];
    ties.slice(0, 3).forEach(function (tt) {
      rows.push({ value: tr.mice[tt[0]].name, label: '(association ' + tt[1].toFixed(2) + ')' });
    });
    showTip(ev, mo.name + ' (' + mo.code + ') · ' + tr.id, rows);
  }

  // ---------- network structure by day (Figs 4F, 4G) ----------
  // Means ± SEM across the trials of each strain, with each trial's own line on request.
  function netSeries(m) {
    return ['C57', 'WD'].map(function (st) {
      var trs = trialsOf(st), per = trs.map(function (tr) { return FIGS.net[tr.id][m.id]; });
      var mm = [], e = [], n = [];
      DAYS.forEach(function (d) {
        var col = per.map(function (p) { return p[d - 1]; }).filter(function (v) { return v != null; });
        mm.push(mean(col)); e.push(sem(col)); n.push(col.length);
      });
      return { key: st, label: STRAIN_NAME[st], color: COL[st], m: mm, e: e, n: n,
        indiv: trs.map(function (tr, k) { return { label: trialLabel(tr), v: per[k] }; }) };
    });
  }

  // ---------- boot ----------
  Promise.all([getJSON('meta.json'), getJSON('territory.json'), getJSON('figs.json')])
    .then(function (r) {
      META = r[0]; TERR = r[1]; FIGS = r[2];
      META.trials.forEach(function (tr) { tr.originMs = originMs(tr); TRIAL[tr.id] = tr; });
      drawStats(); drawMap(); drawCalendar();
      REDRAW.push(drawMap, drawCalendar);
      setupReplay();
      setupHeatmaps();
      chartPair('sp', [SPACE_MEASURES, SPACE_MEASURES], FOUR, { defaults: ['zones_visited', 'zones_cum'] });
      drawOwnership(); drawRank1(); REDRAW.push(drawOwnership, drawRank1);
      setupPAS();
      setupWinFM();
      setupDyadic();
      drawComp(); REDRAW.push(drawComp);
      chartPair('tb', [TB_MEASURES, TB_MEASURES], FOUR, { defaults: ['alone_pct', 'samesex_pct'] });
      chartPair('cm', [[CM_MEASURES[0]], [CM_MEASURES[1]]], FEMALES);
      setupNetworks();
      chartPair('ns', [[NS_MEASURES[0]], [NS_MEASURES[1]]], null, { series: netSeries, unit: 'trials' });
      chartPair('nd', [ND_MEASURES, ND_MEASURES], FOUR, { defaults: ['degree', 'novel_mice_cum'] });
      var timer, lastW = window.innerWidth;
      window.addEventListener('resize', function () {
        if (window.innerWidth === lastW) return;   // ignore height-only changes (mobile toolbars)
        lastW = window.innerWidth;
        clearTimeout(timer);
        timer = setTimeout(function () { REDRAW.forEach(function (fn) { fn(); }); }, 150);
      });
    })
    .catch(function (err) {
      var p = h('p', 'cw-note', root); p.textContent = 'Could not load the data: ' + err.message;
      if (window.console) console.error(err);
    });
})();
