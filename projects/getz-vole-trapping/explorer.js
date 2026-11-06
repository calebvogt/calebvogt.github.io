/* Getz Vole Trapping Explorer.
 * Data: projects/getz-vole-trapping/data/{meta,mass,site_NN}.json, built by
 * github.com/calebvogt/GetzVoleTrapping (scripts/export_web.py).
 * Dates are integer days since 1970-01-01.
 */
(function () {
  'use strict';

  var root = document.getElementById('gx');
  if (!root) return;
  var BASE = root.dataset.base || 'data/';

  var css = getComputedStyle(root);
  function tok(n) { return css.getPropertyValue(n).trim(); }
  var COL = { MO: tok('--mo'), MP: tok('--mp') };             // species
  var SEXC = { 0: tok('--muted'), 1: tok('--male'), 2: tok('--female') };   // sex: blue males, red females
  var SEX_PL = { 1: 'Males', 2: 'Females' };
  var INK = '#e0e0e0', SURF = tok('--surface') || '#0d0d0d';
  var SP_NAME = { MO: 'Prairie vole', MP: 'Meadow vole' };
  var SP_LATIN = { MO: 'Microtus ochrogaster', MP: 'Microtus pennsylvanicus' };
  var HABS = ['alfalfa', 'bluegrass', 'tallgrass'];
  var HAB_NAME = { alfalfa: 'Alfalfa', bluegrass: 'Bluegrass', tallgrass: 'Tallgrass prairie' };
  var TREAT = {
    control: 'unmanipulated control', supp: 'supplemental food',
    mp_removed: 'meadow voles removed monthly', mo_removed: 'prairie voles removed monthly',
    supp_mp_removed: 'supplemental food + meadow voles removed'
  };
  var TREAT_SHORT = {
    supp: 'fed', mp_removed: 'meadow voles removed', mo_removed: 'prairie voles removed',
    supp_mp_removed: 'fed, meadow voles removed'
  };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  var SEX = { 1: 'Male', 2: 'Female' };
  var REPRO = { 1: 'Non-reproductive', 2: 'Reproductive', 3: 'Pregnant' };
  var CHECK = { 1: 'Morning', 2: 'Afternoon', 3: 'Evening' };
  var CHECK_SHORT = { 1: 'AM', 2: 'PM', 3: 'Eve' };
  var DAY = 86400000;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var M = { l: 58, r: 12 };   // shared horizontal margins (charts that share an x-axis align on these)

  var META = null, MASS = null;
  var S = { sp: 'both', sex: 0, min: 2, sort: 'first', nest: true, color: 'sex', cur: 0, sel: -1, step: 0, timer: null };
  var PULSE_MODE = 'sex-MO';
  var MS = { sp: 'MO', hab: 'all', sex: 0, juv: 'juv' };
  var SOC = null, TRAPS = null;
  var SS = { hab: 'all', meas: 'co' }, TS = { sp: 'MO', hab: 'all' };
  var STR = null, RS = { sp: 'MO', hab: 'all' }, CS = { sp: 'MO', hab: 'all' };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function date(d) { return new Date(d * DAY); }
  function fmtMY(d) { var t = date(d); return MON[t.getUTCMonth()] + ' ' + t.getUTCFullYear(); }
  function fmtDMY(d) { var t = date(d); return t.getUTCDate() + ' ' + MON[t.getUTCMonth()] + ' ' + t.getUTCFullYear(); }
  function yearDay(y) { return Math.round(Date.UTC(y, 0, 1) / DAY); }
  function fmtN(n) { return n.toLocaleString('en-US'); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function plural(n, one, many) { return fmtN(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function svg(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
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
  function niceTicks(max, n) {
    var raw = Math.max(max, 1e-9) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    var step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
    var ticks = [];
    for (var v = 0; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 100) / 100);
    if (ticks.length < 2) ticks.push(step);
    return ticks;
  }
  function nearest(a, v) {
    var lo = 0, hi = a.length - 1;
    if (hi < 0) return -1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid] < v) lo = mid + 1; else hi = mid; }
    if (lo > 0 && Math.abs(a[lo - 1] - v) <= Math.abs(a[lo] - v)) lo--;
    return lo;
  }
  function linePath(xs, ys, x, y, gap) {
    var d = '', prev = null;
    for (var i = 0; i < xs.length; i++) {
      if (ys[i] == null) { prev = null; continue; }
      var cmd = (prev === null || xs[i] - prev > gap) ? 'M' : 'L';
      d += cmd + x(xs[i]).toFixed(1) + ',' + y(ys[i]).toFixed(1);
      prev = xs[i];
    }
    return d;
  }
  function yAxis(s, ticks, y, x0, x1, unit) {
    ticks.forEach(function (t, k) {
      if (t > 0) svg('line', { x1: x0, x2: x1, y1: y(t), y2: y(t), class: 'gx-gridline' }, s);
      svg('text', { x: x0 - 6, y: y(t) + 4, 'text-anchor': 'end' }, s).textContent =
        fmtN(t) + (unit && k === ticks.length - 1 ? unit : '');
    });
    svg('line', { x1: x0, x2: x1, y1: y(0), y2: y(0), class: 'gx-baseline' }, s);
  }
  // Axis titles: x centred under the plot area, y rotated along the left edge.
  var XT = 16;   // extra bottom margin reserved for an x-axis title
  function axisTitles(s, W, H, L, R, T, B, xt, yt) {
    if (xt) svg('text', { x: (L + W - R) / 2, y: H - 3, 'text-anchor': 'middle', class: 'gx-axis-title' }, s).textContent = xt;
    if (yt) svg('text', { x: 0, y: 0, transform: 'translate(11,' + ((T + H - B) / 2) + ') rotate(-90)',
      'text-anchor': 'middle', class: 'gx-axis-title' }, s).textContent = yt;
  }
  function yearAxis(g, x, d0, d1, y0, y1, every, labelY) {
    var a = date(d0).getUTCFullYear() + 1, b = date(d1).getUTCFullYear();
    for (var yr = a; yr <= b; yr++) {
      if (yr % every) continue;
      var px = x(yearDay(yr));
      svg('line', { x1: px, x2: px, y1: y0, y2: y1, class: 'gx-gridline' }, g);
      if (labelY != null) svg('text', { x: px, y: labelY, 'text-anchor': 'middle' }, g).textContent = yr;
    }
  }
  function legend(el, items) {
    el.replaceChildren();
    items.forEach(function (it) {
      var s = h('span', null, el);
      var k = h('i', null, s); k.style.background = it.color;
      s.appendChild(document.createTextNode(it.label + ' '));
      if (it.sub) h('em', null, s, it.sub);
    });
  }
  function hull(pts) {   // Andrew's monotone chain; pts = [[x, y], ...]
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return pts;
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [];
    pts.forEach(function (p) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    });
    for (var i = pts.length - 1; i >= 0; i--) {
      var p = pts[i];
      while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
      up.push(p);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // ---------- tooltip ----------
  var tip = $('gx-tip');
  function showTip(ev, head, rows, sub) {
    tip.replaceChildren();
    if (head) h('div', 'gx-tip-h', tip, head);
    rows.forEach(function (r) {
      var row = h('div', 'gx-tip-r', tip);
      if (r.color) { var k = h('i', null, row); k.style.background = r.color; }
      h('b', null, row, r.value);
      if (r.label) row.appendChild(document.createTextNode(r.label));
    });
    if (sub) h('div', 'gx-tip-sub', tip, sub);
    tip.style.display = 'block';
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var px = ev.clientX + 14, py = ev.clientY + 14;
    if (px + tw > window.innerWidth - 8) px = ev.clientX - tw - 14;
    if (py + th > window.innerHeight - 8) py = ev.clientY - th - 14;
    tip.style.left = Math.max(4, px) + 'px';
    tip.style.top = Math.max(4, py) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  // ---------- header stats ----------
  function drawStats() {
    var caps = 0, nest = 0, inds = 0;
    META.sites.forEach(function (s) { caps += s.n_captures; nest += s.n_nest; inds += s.n_individuals + s.n_nest_only; });
    var el = $('gx-stats');
    [[fmtN(caps), 'monthly grid captures'], [fmtN(nest), 'twice-weekly nest captures'],
     [fmtN(inds), 'individual animals'], [META.sites.length, 'trapping grids'], ['25', 'years']].forEach(function (t) {
      var d = h('div', 'gx-stat', el); h('b', null, d, t[0]); h('span', null, d, t[1]);
    });
  }

  // ---------- grid timeline ----------
  var PULSE = { d0: yearDay(1971) + 200, d1: yearDay(1997) + 180 };
  function siteSpan(s) {
    var a = Infinity, b = -Infinity;
    ['MO', 'MP'].forEach(function (sp) {
      var p = s.pop[sp]; if (!p || !p.d.length) return;
      a = Math.min(a, p.d[0]); b = Math.max(b, p.d[p.d.length - 1]);
    });
    return [a, b];
  }
  function gridOrder() {
    return HABS.map(function (hab) {
      return { hab: hab, sites: META.sites.filter(function (s) { return s.habitat === hab; })
        .sort(function (a, b) { return siteSpan(a)[0] - siteSpan(b)[0] || a.site - b.site; }) };
    });
  }
  function drawTimeline() {
    var wrap = $('gx-timeline');
    wrap.replaceChildren();
    var W = wrap.clientWidth, RH = 19, HEAD = 22, B = 22 + XT;
    var groups = gridOrder();
    var H = groups.reduce(function (n, g) { return n + HEAD + g.sites.length * RH; }, 0) + B;
    var x = lin(PULSE.d0, PULSE.d1, M.l, W - M.r);
    var s = svg('svg', { width: W, height: H, class: 'gx-svg gx-clip', role: 'img',
      'aria-label': 'Timeline of when each of the 19 trapping grids was trapped' }, wrap);
    yearAxis(s, x, PULSE.d0, PULSE.d1, 0, H - B, 5, H - B + 16);
    axisTitles(s, W, H, M.l, M.r, 0, B, 'Year', 'Grid');
    var y = 0;
    groups.forEach(function (g) {
      svg('text', { x: 22, y: y + 15, class: 'gx-panel-title' }, s).textContent = HAB_NAME[g.hab];
      y += HEAD;
      g.sites.forEach(function (site) {
        var sp = siteSpan(site), x0 = x(sp[0]), x1 = Math.max(x(sp[1]), x0 + 3), ctl = site.treatment === 'control';
        var gEl = svg('g', { class: 'gx-tl-row', tabindex: 0, role: 'button',
          'aria-label': 'Grid ' + site.site + ', ' + site.name + '. Open in explorer.' }, s);
        svg('rect', { x: 0, y: y, width: W, height: RH, fill: 'transparent' }, gEl);
        svg('rect', { x: x0, y: y + 4, width: x1 - x0, height: RH - 8, rx: 3, class: ctl ? 'gx-tl-bar' : 'gx-tl-bar gx-tl-exp' }, gEl);
        svg('text', { x: 24, y: y + RH / 2 + 4, class: 'gx-tl-num' }, gEl).textContent = pad2(site.site);
        // Label goes right of the bar, else left, else shortened, else inside the bar.
        var base = site.name.replace(/\s*\(.*\)$/, ''), NUMW = 46;
        var t = svg('text', { y: y + RH / 2 + 4, class: 'gx-tl-label' }, gEl);
        function fits(txt) {
          t.textContent = txt;
          var w = t.getComputedTextLength();
          if (x1 + 6 + w <= W) { t.setAttribute('x', x1 + 6); t.setAttribute('text-anchor', 'start'); return true; }
          if (x0 - 6 - w >= NUMW) { t.setAttribute('x', x0 - 6); t.setAttribute('text-anchor', 'end'); return true; }
          return false;
        }
        if (!(!ctl && fits(base + ' · ' + TREAT_SHORT[site.treatment])) && !fits(base)) {
          t.textContent = base;
          t.setAttribute('x', x0 + 6); t.setAttribute('text-anchor', 'start');
          if (ctl) t.classList.add('gx-tl-in');
        }
        gEl.addEventListener('pointermove', function (ev) {
          showTip(ev, 'Grid ' + site.site + ' · ' + site.name, [
            { value: HAB_NAME[site.habitat], label: ' · ' + site.location + ' · ' + site.area_ha + ' ha' },
            { value: fmtMY(sp[0]) + ' – ' + fmtMY(sp[1]), label: '' },
            { value: TREAT[site.treatment], label: '' },
            { value: fmtN(site.n_individuals + site.n_nest_only), label: ' marked animals' }], 'Click to open this grid');
        });
        gEl.addEventListener('pointerleave', hideTip);
        function open() { hideTip(); loadSite(site.site).then(function () { $('gx-site').scrollIntoView({ behavior: 'smooth' }); }); }
        gEl.addEventListener('click', open);
        gEl.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
        y += RH;
      });
    });
  }

  // ---------- population pulse ----------
  function pulseSeries(ser) {
    if (PULSE_MODE === 'species') {
      return ['MP', 'MO'].filter(function (sp) { return ser[sp]; }).map(function (sp) {
        return { color: COL[sp], d: ser[sp].d, v: ser[sp].density, label: SP_NAME[sp].toLowerCase() + 's' };
      });
    }
    var sp = PULSE_MODE.slice(4), q = ser[sp];
    if (!q) return [];
    return [{ color: SEXC[2], d: q.d, v: q.f, label: 'females' }, { color: SEXC[1], d: q.d, v: q.m, label: 'males' }];
  }
  function drawPulse() {
    var sexMode = PULSE_MODE !== 'species', sp = PULSE_MODE.slice(4);
    legend($('gx-pulse-legend'), sexMode
      ? [{ color: SEXC[1], label: 'Males', sub: SP_NAME[sp].toLowerCase() + 's' }, { color: SEXC[2], label: 'Females', sub: SP_NAME[sp].toLowerCase() + 's' }]
      : [{ color: COL.MO, label: 'Prairie vole', sub: 'M. ochrogaster' }, { color: COL.MP, label: 'Meadow vole', sub: 'M. pennsylvanicus' }]);
    var wrap = $('gx-pulse-panels');
    wrap.replaceChildren();
    var W = wrap.clientWidth, T = 22;
    var x = lin(PULSE.d0, PULSE.d1, M.l, W - M.r);
    var panels = HABS.map(function (hab, hi) {
      var last = hi === HABS.length - 1, B = last ? 20 + XT : 20, H = 118 + B;
      var ser = META.main[hab], series = pulseSeries(ser), all = [1];
      series.forEach(function (q) { all = all.concat(q.v); });
      var ticks = niceTicks(Math.max.apply(null, all), 3);
      var y = lin(0, ticks[ticks.length - 1], H - B, T);
      var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img',
        'aria-label': HAB_NAME[hab] + ' vole density, 1972 to 1997' }, wrap);
      yearAxis(s, x, PULSE.d0, PULSE.d1, T, H - B, 5, H - B + 15);
      yAxis(s, ticks, y, M.l, W - M.r);
      axisTitles(s, W, H, M.l, M.r, T, B, last ? 'Year' : '', 'Voles / ha');
      svg('text', { x: M.l, y: 13, class: 'gx-panel-title' }, s).textContent = HAB_NAME[hab];
      series.forEach(function (q) {
        svg('path', { d: linePath(q.d, q.v, x, y, 62), fill: 'none', stroke: q.color,
          'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, s);
      });
      var cross = svg('line', { y1: T, y2: H - B, class: 'gx-cross', visibility: 'hidden' }, s);
      return { hab: hab, s: s, ser: ser, cross: cross, H: H, B: B };
    });
    function at(ev) {
      var r = ev.currentTarget.getBoundingClientRect();
      return clamp(x.inv(ev.clientX - r.left), PULSE.d0, PULSE.d1);
    }
    function snap(d) { var ref = META.main.alfalfa.MO.d; return ref[nearest(ref, d)]; }
    panels.forEach(function (p) {
      p.s.addEventListener('pointermove', function (ev) {
        var d = snap(at(ev));
        panels.forEach(function (q) {
          q.cross.setAttribute('x1', x(d)); q.cross.setAttribute('x2', x(d)); q.cross.setAttribute('visibility', 'visible');
        });
        var rows = [];
        HABS.forEach(function (hab) {
          pulseSeries(META.main[hab]).slice().reverse().forEach(function (q) {
            var i = nearest(q.d, d);
            if (i < 0 || Math.abs(q.d[i] - d) > 20) return;
            rows.push({ color: q.color, value: fmtN(Math.round(q.v[i])) + '/ha', label: ' ' + HAB_NAME[hab] + ' · ' + q.label });
          });
        });
        showTip(ev, fmtMY(d), rows, 'Click to open this grid');
      });
      p.s.addEventListener('pointerleave', function () {
        panels.forEach(function (q) { q.cross.setAttribute('visibility', 'hidden'); });
        hideTip();
      });
      p.s.addEventListener('click', function (ev) {
        var d = at(ev), se = p.ser.MO || p.ser.MP, i = nearest(se.d, d);
        hideTip();
        loadSite(se.site[i], d).then(function () { $('gx-site').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      });
    });
  }

  // ---------- grid explorer: data ----------
  function siteMenu() {
    var sel = $('gx-site-select');
    HABS.forEach(function (hab) {
      var g = h('optgroup', null, sel); g.label = HAB_NAME[hab];
      META.sites.filter(function (s) { return s.habitat === hab; }).forEach(function (s) {
        var o = h('option', null, g, pad2(s.site) + ' · ' + s.name + ' (' + s.start.slice(0, 4) + '–' + s.end.slice(0, 4) + ')');
        o.value = s.site;
      });
    });
    sel.addEventListener('change', function () { loadSite(+sel.value); });
    $('gx-sp').addEventListener('change', function (e) { S.sp = e.target.value; refilter(); });
    $('gx-sex').addEventListener('change', function (e) { S.sex = +e.target.value; refilter(); });
    $('gx-min').addEventListener('change', function (e) { S.min = +e.target.value; refilter(); });
    $('gx-sort').addEventListener('change', function (e) { S.sort = e.target.value; refilter(); });
    $('gx-nest').addEventListener('change', function (e) { S.nest = e.target.checked; refilter(); });
    $('gx-color').addEventListener('change', function (e) { S.color = e.target.value; refilter(); });
  }

  var cache = {};
  function loadSite(site, day) {
    stop();
    var p = cache[site] || (cache[site] = fetch(BASE + 'site_' + pad2(site) + '.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }));
    return p.then(function (data) {
      S.site = site; S.data = data; S.sel = -1; S.step = 0;
      S.meta = META.sites.filter(function (s) { return s.site === site; })[0];
      indexSite();
      $('gx-site-select').value = site;
      $('gx-nest-wrap').hidden = !data.nest;
      S.cur = day != null ? nearest(data.sessions.d, day) : peakSession();
      siteInfo();
      refilter();
    });
  }

  function indexSite() {
    var c = S.data.caps, I = S.data.inds, n = I.id.length, ss = S.data.sessions, k;
    S.byInd = []; S.nestByInd = [];
    for (var i = 0; i < n; i++) { S.byInd.push([]); S.nestByInd.push([]); }
    for (k = 0; k < c.i.length; k++) S.byInd[c.i[k]].push(k);
    if (S.data.nest) for (k = 0; k < S.data.nest.i.length; k++) S.nestByInd[S.data.nest.i[k]].push(k);
    S.gFirst = new Int32Array(n); S.gLast = new Int32Array(n);
    for (i = 0; i < n; i++) {
      var b = S.byInd[i];
      S.gFirst[i] = b.length ? c.d[b[0]] : 0; S.gLast[i] = b.length ? c.d[b[b.length - 1]] : 0;
    }
    var pos = {}; ss.session.forEach(function (s, j) { pos[s] = j; });
    S.bySess = ss.session.map(function () { return []; });
    S.capSess = new Int32Array(c.i.length);
    for (k = 0; k < c.i.length; k++) {
      var j = pos[c.s[k]];
      S.capSess[k] = j == null ? -1 : j;
      if (j != null) S.bySess[j].push(k);
    }
    var d0 = ss.d[0], d1 = ss.d[ss.d.length - 1];
    if (S.data.nest) { var nd = S.data.nest.d; d0 = Math.min(d0, nd[0]); d1 = Math.max(d1, nd[nd.length - 1]); }
    S.d0 = d0 - 25; S.d1 = d1 + 25;
    S.atTrap = {};   // same trap, same check -> capture indices
    for (k = 0; k < c.i.length; k++) {
      if (c.st[k] <= 0 || c.t[k] < 1 || c.t[k] > 3) continue;
      var tk = c.d[k] + '|' + c.t[k] + '|' + c.st[k];
      (S.atTrap[tk] = S.atTrap[tk] || []).push(k);
    }
    var used = {};
    for (k = 0; k < c.i.length; k++) if (c.gc[k] >= 0) used[c.gc[k] + ',' + c.gr[k]] = (used[c.gc[k] + ',' + c.gr[k]] || 0) + 1;
    S.stations = Object.keys(used).filter(function (key) { return used[key] >= 2; })
      .map(function (key) { return key.split(',').map(Number); });
  }

  function peakSession() {
    var best = 0, bi = 0;
    S.bySess.forEach(function (a, j) { if (a.length > best) { best = a.length; bi = j; } });
    return bi;
  }

  function siteInfo() {
    var m = S.meta, el = $('gx-siteinfo');
    el.replaceChildren();
    h('b', null, el, 'Grid ' + m.site + ' · ' + HAB_NAME[m.habitat] + ' · ' + m.name);
    var txt = ' · ' + m.area_ha + ' ha · ' + m.location + ' · ' + m.start + ' to ' + m.end + ' · ' +
      TREAT[m.treatment] + ' · ' + fmtN(m.n_individuals) + ' animals caught on the grid';
    if (m.n_nest_only) txt += ', plus ' + fmtN(m.n_nest_only) + ' caught only at nests';
    el.appendChild(document.createTextNode(txt));
    var removed = Object.keys(m.removed);
    if (removed.length) {
      var tot = 0; removed.forEach(function (sp) { m.removed[sp].n.forEach(function (v) { tot += v; }); });
      el.appendChild(document.createTextNode(' · ' + fmtN(tot) + ' ' + removed.map(function (sp) {
        return SP_NAME[sp].toLowerCase() + 's'; }).join(', ') + ' removed (not shown)'));
    }
  }

  function gridNote() {
    var m = S.meta, el = $('gx-grid-note');
    var layout = {
      7: ' This grid used three layouts (10-m serpentine 1977–80, 5-m grid 1980–83, 10-m grid 1983–87), drawn on one map.',
      12: ' The Trelease Prairie grid is an irregular L shape; positions are approximate.',
      13: ' The Trelease Prairie grid is an irregular L shape; positions are approximate.',
      14: ' The Trelease Prairie grid is an irregular L shape; positions are approximate.'
    }[m.site] || '';
    if (S.sel < 0) {
      el.textContent = 'Each dot is one animal caught this session, placed at the trap where it was first caught ' +
        'that session. Small grey points are traps. Stations are 10 m apart.' + layout;
    } else {
      var nn = S.nestByInd[S.sel].length;
      el.textContent = 'Circles mark every trap this animal was caught in (bigger = more captures). The shaded area ' +
        'joins its outermost traps, a rough outline of the ground it used. Press Play to replay its captures in order.' +
        (nn ? ' Its ' + plural(nn, 'nest capture') + ' have no trap position and appear only in the table.' : '') + layout;
    }
  }

  function keep(i) {
    var I = S.data.inds;
    if (S.sp !== 'both' && I.sp[i] !== S.sp) return false;
    if (S.sex && I.sex[i] !== S.sex) return false;
    return true;
  }
  function colorOf(i) {
    var I = S.data.inds;
    return S.color === 'sex' ? SEXC[I.sex[i]] || SEXC[0] : COL[I.sp[i]];
  }
  function firstOf(i) { return S.nest || !S.byInd[i].length ? S.data.inds.first[i] : S.gFirst[i]; }
  function lastOf(i) { return S.nest || !S.byInd[i].length ? S.data.inds.last[i] : S.gLast[i]; }
  function sessCount(i) { var I = S.data.inds; return I.nsess[i] + (S.nest ? I.nn[i] : 0); }

  function refilter() {
    var I = S.data.inds, rows = [];
    for (var i = 0; i < I.id.length; i++) {
      if (!keep(i)) continue;
      if (!S.nest && I.n[i] === 0) continue;
      if (sessCount(i) < S.min) continue;
      rows.push(i);
    }
    var key = {
      first: function (a, b) { return firstOf(a) - firstOf(b) || lastOf(a) - lastOf(b); },
      span: function (a, b) { return (lastOf(b) - firstOf(b)) - (lastOf(a) - firstOf(a)) || firstOf(a) - firstOf(b); },
      n: function (a, b) { return (I.n[b] + (S.nest ? I.nn[b] : 0)) - (I.n[a] + (S.nest ? I.nn[a] : 0)) || firstOf(a) - firstOf(b); }
    }[S.sort];
    rows.sort(key);
    S.rows = rows;
    S.rowOf = {}; rows.forEach(function (i, r) { S.rowOf[i] = r; });
    S.followAfterDraw = true;
    $('gx-life-count').textContent = fmtN(rows.length) + ' of ' + fmtN(I.id.length) + ' animals · one row each';
    var marks = $('gx-marks'); marks.replaceChildren();
    var a = h('span', null, marks); h('i', 'gx-mk-sq', a); a.appendChild(document.createTextNode('grid capture'));
    if (S.data.nest && S.nest) {
      var b = h('span', null, marks); h('i', 'gx-mk-tick', b); b.appendChild(document.createTextNode('nest capture'));
    }
    var spList = S.sp === 'both' ? ['MO', 'MP'] : [S.sp];
    legend($('gx-site-legend'), S.color === 'sex'
      ? [{ color: SEXC[1], label: 'Males' }, { color: SEXC[2], label: 'Females' }, { color: SEXC[0], label: 'Sex not recorded' }]
      : spList.filter(function (sp) { return S.meta.pop[sp]; }).map(function (sp) { return { color: COL[sp], label: SP_NAME[sp] }; }));
    if (S.sel >= 0 && !keep(S.sel)) S.sel = -1;
    drawSite();
  }

  function drawSite() {
    drawDensity();
    drawTurnover();
    drawLife();
    drawMapPanel();
    if (S.followAfterDraw) { S.followAfterDraw = false; followSession(); }
  }
  function drawMapPanel() { modeBar(); drawGrid(); drawNet(); drawCard(); stepLabel(); gridNote(); }

  function siteX(W) { return lin(S.d0, S.d1, M.l, W - M.r); }
  function curDay() {
    if (S.sel >= 0 && S.selCaps.length) return S.data.caps.d[S.selCaps[S.step]];
    return S.data.sessions.d[S.cur];
  }

  // ---------- grid explorer: density ----------
  // Lines for the density chart: by sex (summed over the species shown) or by species.
  function densitySeries() {
    var pop = S.meta.pop, sps = ['MO', 'MP'].filter(function (sp) { return pop[sp] && (S.sp === 'both' || S.sp === sp); });
    if (!sps.length) return [];
    var d = pop[sps[0]].d;
    if (S.color === 'sex') {
      return [[1, 'm', 'males'], [2, 'f', 'females']].filter(function (q) { return !S.sex || S.sex === q[0]; }).map(function (q) {
        var v = d.map(function (_, j) { return sps.reduce(function (a, sp) { return a + pop[sp][q[1]][j]; }, 0); });
        return { color: SEXC[q[0]], d: d, v: v, label: q[2] };
      });
    }
    return sps.map(function (sp) { return { color: COL[sp], d: pop[sp].d, v: pop[sp].mnka, label: SP_NAME[sp].toLowerCase() + 's' }; });
  }

  function drawDensity() {
    var wrap = $('gx-density');
    wrap.replaceChildren();
    var W = wrap.clientWidth, B = 20 + XT, H = 130 + B, T = 10;
    var x = siteX(W), series = densitySeries(), max = 1;
    series.forEach(function (q) { max = Math.max(max, Math.max.apply(null, q.v)); });
    var ticks = niceTicks(max, 3), y = lin(0, ticks[ticks.length - 1], H - B, T);
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img',
      'aria-label': 'Animals known alive on this grid, by session' }, wrap);
    yearAxis(s, x, S.d0, S.d1, T, H - B, (S.d1 - S.d0) / 365 > 12 ? 2 : 1, H - B + 15);
    yAxis(s, ticks, y, M.l, W - M.r);
    axisTitles(s, W, H, M.l, M.r, T, B, 'Year', 'Known alive');
    series.forEach(function (q) {
      svg('path', { d: linePath(q.d, q.v, x, y, 75), fill: 'none', stroke: q.color, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, s);
    });
    var cd = curDay();
    S.densCursor = svg('line', { x1: x(cd), x2: x(cd), y1: T, y2: H - B, class: 'gx-cursor' }, s);
    var cross = svg('line', { y1: T, y2: H - B, class: 'gx-cross', visibility: 'hidden' }, s);
    var sd = S.data.sessions.d;
    function idx(ev) { var r = s.getBoundingClientRect(); return nearest(sd, x.inv(ev.clientX - r.left)); }
    s.addEventListener('pointermove', function (ev) {
      var j = idx(ev), d = sd[j];
      cross.setAttribute('x1', x(d)); cross.setAttribute('x2', x(d)); cross.setAttribute('visibility', 'visible');
      var rows = [];
      series.forEach(function (q) {
        var i = nearest(q.d, d);
        if (i >= 0 && q.d[i] === d) rows.push({ color: q.color, value: fmtN(q.v[i]), label: ' ' + q.label + ' known alive' });
      });
      showTip(ev, fmtMY(d) + ' · session ' + S.data.sessions.session[j], rows, 'Click to show this session on the map');
    });
    s.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    s.addEventListener('click', function (ev) { var j = idx(ev); if (S.sel >= 0) deselect(); setSession(j); });
  }

  // ---------- grid explorer: lifelines ----------
  function drawLife() {
    var box = $('gx-life'), cv = box.querySelector('canvas');
    var W = box.clientWidth, n = S.rows.length;
    var rh = Math.max(2, Math.min(9, Math.floor(440 / Math.max(n, 1))));
    var H = Math.max(n * rh, 30), dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    S.rh = rh; S.lifeW = W;
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var x = siteX(W), I = S.data.inds, c = S.data.caps, nd = S.data.nest;
    ctx.strokeStyle = tok('--grid'); ctx.lineWidth = 1;
    var every = (S.d1 - S.d0) / 365 > 12 ? 2 : 1;
    for (var yr = date(S.d0).getUTCFullYear() + 1; yr <= date(S.d1).getUTCFullYear(); yr++) {
      if (yr % every) continue;
      var gx = Math.round(x(yearDay(yr))) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    if (!n) {
      ctx.fillStyle = tok('--muted'); ctx.font = '12px sans-serif';
      ctx.fillText('No animals match these filters.', M.l, 20);
      lifeAxis(W, x);
      return;
    }
    var hasSel = S.sel >= 0 && S.rowOf[S.sel] != null;
    if (hasSel) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, S.rowOf[S.sel] * rh, W, rh); }
    var dot = Math.max(2, Math.min(5, rh - 1)), tickH = Math.max(1.5, rh - 1);
    for (var r = 0; r < n; r++) {
      var i = S.rows[r], yc = r * rh + rh / 2, col = colorOf(i), dim = hasSel && i !== S.sel;
      ctx.globalAlpha = dim ? 0.15 : 0.4;
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, rh * 0.25);
      ctx.beginPath(); ctx.moveTo(x(firstOf(i)), yc); ctx.lineTo(x(lastOf(i)) + 0.5, yc); ctx.stroke();
      ctx.fillStyle = col;
      if (nd && S.nest) {
        ctx.globalAlpha = dim ? 0.2 : 0.75;
        var nk = S.nestByInd[i];
        for (var q = 0; q < nk.length; q++) ctx.fillRect(x(nd.d[nk[q]]) - 0.6, yc - tickH / 2, 1.2, tickH);
      }
      ctx.globalAlpha = dim ? 0.3 : 1;
      var ks = S.byInd[i];
      for (q = 0; q < ks.length; q++) ctx.fillRect(x(c.d[ks[q]]) - dot / 2, yc - dot / 2, dot, dot);
    }
    ctx.globalAlpha = 1;
    if (hasSel) {
      var sy = S.rowOf[S.sel] * rh + rh / 2, big = dot + 3;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x(firstOf(S.sel)), sy); ctx.lineTo(x(lastOf(S.sel)) + 0.5, sy); ctx.stroke();
      ctx.fillStyle = colorOf(S.sel);
      S.byInd[S.sel].forEach(function (k) {
        ctx.fillRect(x(c.d[k]) - big / 2, sy - big / 2, big, big);
        ctx.strokeRect(x(c.d[k]) - big / 2, sy - big / 2, big, big);
      });
    }
    var cx = Math.round(x(curDay())) + 0.5;
    ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.globalAlpha = 1;
    lifeAxis(W, x);
  }
  function lifeAxis(W, x) {
    var el = $('gx-life-axis'); el.replaceChildren();
    var s = svg('svg', { width: W, height: 34, class: 'gx-svg', 'aria-hidden': 'true' }, el);
    yearAxis(s, x, S.d0, S.d1, 0, 4, (S.d1 - S.d0) / 365 > 12 ? 2 : 1, 15);
    axisTitles(s, W, 34, M.l, M.r, 0, 34, 'Year', '');
  }

  function lifeHit(ev) {
    var r = $('gx-life').querySelector('canvas').getBoundingClientRect();
    var row = Math.floor((ev.clientY - r.top) / S.rh);
    if (row < 0 || row >= S.rows.length) return null;
    return { i: S.rows[row], d: siteX(S.lifeW).inv(ev.clientX - r.left) };
  }
  function animalTipRows(i) {
    var I = S.data.inds, rows = [
      { color: colorOf(i), value: SEX[I.sex[i]] || 'Sex not recorded', label: ' · ' + SP_NAME[I.sp[i]].toLowerCase() },
      { value: fmtDMY(firstOf(i)), label: ' → ' + fmtDMY(lastOf(i)) }];
    if (I.n[i]) rows.push({ value: fmtN(I.n[i]), label: ' grid ' + (I.n[i] === 1 ? 'capture' : 'captures') + ' in ' + plural(I.nsess[i], 'monthly session') });
    if (S.nest && I.nn[i]) rows.push({ value: fmtN(I.nn[i]), label: ' twice-weekly nest ' + (I.nn[i] === 1 ? 'capture' : 'captures') });
    return rows;
  }
  function bindLife() {
    var box = $('gx-life');
    box.addEventListener('pointermove', function (ev) {
      var hit = lifeHit(ev);
      if (!hit) return hideTip();
      showTip(ev, S.data.inds.id[hit.i], animalTipRows(hit.i), 'Click to follow this animal');
    });
    box.addEventListener('pointerleave', hideTip);
    box.addEventListener('click', function (ev) { var hit = lifeHit(ev); if (hit) select(hit.i, hit.d); });
    box.addEventListener('keydown', function (ev) {
      if (!S.rows.length) return;
      var r = S.sel >= 0 && S.rowOf[S.sel] != null ? S.rowOf[S.sel] : -1;
      if (ev.key === 'ArrowDown') r = Math.min(S.rows.length - 1, r + 1);
      else if (ev.key === 'ArrowUp') r = Math.max(0, r - 1);
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); return setPos(pos() + 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); return setPos(pos() - 1); }
      else if (ev.key === 'Escape') return deselect();
      else return;
      ev.preventDefault();
      select(S.rows[r]);
      scrollToRow(S.rows[r]);
    });
  }
  function scrollToRow(i) {
    var r = S.rowOf[i];
    if (r == null) return;
    var box = $('gx-life');
    box.scrollTop = Math.max(0, r * S.rh - box.clientHeight / 2);
  }
  function followSession() {
    if (S.sel >= 0 || S.sort !== 'first' || !S.rows.length) return;
    var d = S.data.sessions.d[S.cur], box = $('gx-life'), r = 0;
    while (r < S.rows.length - 1 && lastOf(S.rows[r]) < d - 10) r++;
    box.scrollTop = Math.max(0, r * S.rh - 20);
  }

  // ---------- selection: following one animal ----------
  function select(i, nearDay) {
    stop();
    S.sel = i;
    var c = S.data.caps;
    S.selCaps = S.byInd[i].filter(function (k) { return c.gc[k] >= 0; });
    S.step = 0;
    if (nearDay != null && S.selCaps.length) {
      S.selCaps.forEach(function (k, j) {
        if (Math.abs(c.d[k] - nearDay) < Math.abs(c.d[S.selCaps[S.step]] - nearDay)) S.step = j;
      });
    }
    syncSession();
    drawLife(); drawMapPanel(); moveCursor();
  }
  function deselect() {
    if (S.sel < 0) return;
    stop();
    S.sel = -1;
    drawLife(); drawMapPanel(); moveCursor(); followSession();
  }
  function syncSession() {
    if (S.sel >= 0 && S.selCaps.length) {
      var j = S.capSess[S.selCaps[S.step]];
      if (j >= 0) S.cur = j;
    }
  }

  // ---------- player (sessions, or one animal's captures) ----------
  function steps() { return S.sel >= 0 ? S.selCaps.length : S.data.sessions.d.length; }
  function pos() { return S.sel >= 0 ? S.step : S.cur; }
  function setPos(j) {
    var n = steps();
    if (!n) return;
    j = clamp(j, 0, n - 1);
    if (S.sel >= 0) { S.step = j; syncSession(); } else S.cur = j;
    moveCursor(); drawLife(); drawGrid(); drawNet(); drawCard(); stepLabel();
    if (S.sel < 0) followSession();
  }
  function setSession(j) { if (S.sel >= 0) deselect(); setPos(j); }
  function moveCursor() {
    var x = siteX($('gx-density').clientWidth), d = curDay();
    [S.densCursor, S.turnCursor].forEach(function (c) { if (c) { c.setAttribute('x1', x(d)); c.setAttribute('x2', x(d)); } });
  }
  function stop() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    var b = $('gx-play'); b.textContent = 'Play'; b.setAttribute('aria-label', 'Play');
  }
  function play() {
    if (S.timer) return stop();
    if (pos() >= steps() - 1) setPos(0);
    var b = $('gx-play'); b.textContent = 'Pause'; b.setAttribute('aria-label', 'Pause');
    S.timer = setInterval(function () {
      if (pos() >= steps() - 1) return stop();
      setPos(pos() + 1);
    }, S.sel >= 0 ? 650 : 420);
  }
  function bindPlayer() {
    $('gx-prev').addEventListener('click', function () { stop(); setPos(pos() - 1); });
    $('gx-next').addEventListener('click', function () { stop(); setPos(pos() + 1); });
    $('gx-play').addEventListener('click', play);
    $('gx-slider').addEventListener('input', function (e) { stop(); setPos(+e.target.value); });
  }
  function modeBar() {
    var el = $('gx-mode'), I = S.data.inds;
    el.replaceChildren();
    if (S.sel < 0) {
      h('span', 'gx-mode-label', el, 'Showing all animals, one session at a time');
    } else {
      var t = h('span', 'gx-mode-label', el);
      var k = h('i', null, t); k.style.background = colorOf(S.sel);
      t.appendChild(document.createTextNode('Following ' + I.id[S.sel]));
      var b = h('button', 'gx-back', el, '← All animals');
      b.addEventListener('click', deselect);
    }
  }
  function stepLabel() {
    var el = $('gx-session-label'), ss = S.data.sessions, c = S.data.caps, I = S.data.inds;
    el.replaceChildren();
    var sl = $('gx-slider');
    sl.max = Math.max(0, steps() - 1); sl.value = pos();
    if (S.sel >= 0) {
      if (!S.selCaps.length) {
        el.textContent = 'This animal was only caught at nests, so it has no trap positions to map.';
        return;
      }
      var k = S.selCaps[S.step];
      h('b', null, el, 'Trap capture ' + (S.step + 1) + ' of ' + S.selCaps.length);
      el.appendChild(document.createTextNode('  ·  ' + fmtDMY(c.d[k]) + ', ' + (CHECK[c.t[k]] || 'unrecorded').toLowerCase() + ' check'));
      h('br', null, el);
      el.appendChild(document.createTextNode('Station ' + c.st[k] + ' · ' + (c.m[k] > 0 ? c.m[k] + ' g' : 'mass not recorded') +
        ' · ' + (REPRO[c.rp[k]] || 'condition not recorded').toLowerCase()));
      return;
    }
    var n = { MO: 0, MP: 0 }, seen = {};
    S.bySess[S.cur].forEach(function (k) {
      var i = c.i[k];
      if (!keep(i) || seen[i]) return;
      seen[i] = 1; n[I.sp[i]]++;
    });
    h('b', null, el, fmtMY(ss.d[S.cur]));
    el.appendChild(document.createTextNode('  ·  session ' + (S.cur + 1) + ' of ' + ss.d.length + ' on this grid'));
    h('br', null, el);
    var parts = ['MO', 'MP'].filter(function (sp) { return S.meta.pop[sp] && (S.sp === 'both' || S.sp === sp); })
      .map(function (sp) { return plural(n[sp], SP_NAME[sp].toLowerCase()); });
    el.appendChild(document.createTextNode(parts.join(', ') + ' caught'));
  }

  // ---------- grid explorer: map ----------
  function drawGrid() {
    var wrap = $('gx-grid'), g = S.meta.grid;
    wrap.replaceChildren();
    var nc = g.cols - g.col0, nr = g.rows - g.row0;
    if (nc <= 0 || nr <= 0) { h('p', 'gx-grid-note', wrap, 'No station positions for this grid.'); return; }
    var avail = Math.max(200, wrap.clientWidth - 14), pad = 12, padL = 26, padB = 30;
    var cell = Math.max(7, Math.min(26, Math.floor((avail - pad - padL) / nc), Math.floor(430 / nr)));
    var W = nc * cell + pad + padL, H = nr * cell + pad + padB;
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': 'Trap stations on the grid' }, wrap);
    axisTitles(s, W, H, padL, pad, pad, padB, 'Grid column (traps 10 m apart)', 'Grid row');
    function px(cn) { return padL + (cn - g.col0 + 0.5) * cell; }
    function py(rn) { return pad + (rn - g.row0 + 0.5) * cell; }
    S.stations.forEach(function (p) { svg('circle', { cx: px(p[0]), cy: py(p[1]), r: 1.4, fill: '#4a4945' }, s); });
    var hits = [];
    if (S.sel >= 0) animalMap(s, px, py, cell, hits); else sessionMap(s, px, py, cell, hits);
    function nearestHit(ev) {
      var r = s.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, best = null, bd = 14 * 14;
      hits.forEach(function (p) { var dd = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); if (dd < bd) { bd = dd; best = p; } });
      return best;
    }
    s.addEventListener('pointermove', function (ev) {
      var b = nearestHit(ev);
      if (!b) { s.style.cursor = ''; return hideTip(); }
      s.style.cursor = b.click ? 'pointer' : '';
      showTip(ev, b.head, b.rows, b.sub);
    });
    s.addEventListener('pointerleave', function () { hideTip(); s.style.cursor = ''; });
    s.addEventListener('click', function (ev) { var b = nearestHit(ev); if (b && b.click) { hideTip(); b.click(); } });
  }

  // All animals caught in the current session: one dot per animal.
  function sessionMap(s, px, py, cell, hits) {
    var c = S.data.caps, I = S.data.inds, at = {}, seen = {};
    S.bySess[S.cur].forEach(function (k) {
      var i = c.i[k];
      if (!keep(i) || seen[i] || c.gc[k] < 0) return;
      seen[i] = 1;
      var key = c.gc[k] + ',' + c.gr[k];
      (at[key] = at[key] || []).push(k);
    });
    var r0 = Math.max(2.5, Math.min(5, cell * 0.26));
    Object.keys(at).forEach(function (key) {
      var ks = at[key], n = ks.length, k0 = ks[0], cx = px(c.gc[k0]), cy = py(c.gr[k0]);
      var ring = n > 1 ? cell * 0.28 : 0, rr = n > 1 ? Math.max(2, r0 * 0.75) : r0;
      ks.forEach(function (k, j) {
        var a = 2 * Math.PI * j / n - Math.PI / 2, x = cx + ring * Math.cos(a), y = cy + ring * Math.sin(a), i = c.i[k];
        svg('circle', { cx: x, cy: y, r: rr, fill: colorOf(i), stroke: SURF, 'stroke-width': 1.2 }, s);
        var nThis = S.byInd[i].filter(function (q) { return S.capSess[q] === S.cur; }).length;
        hits.push({ x: x, y: y, head: I.id[i] + ' · station ' + c.st[k], click: function () { select(i, c.d[k]); scrollToRow(i); },
          rows: [{ color: colorOf(i), value: SEX[I.sex[i]] || 'Sex not recorded', label: ' · ' + SP_NAME[I.sp[i]].toLowerCase() },
            { value: plural(nThis, 'capture'), label: ' this session' },
            { value: c.m[k] > 0 ? c.m[k] + ' g' : '–', label: ' · ' + (REPRO[c.rp[k]] || 'condition not recorded').toLowerCase() }],
          sub: 'Click to follow this animal' });
      });
    });
  }

  // One animal: every trap it used, its outline, and a replayable trail.
  function animalMap(s, px, py, cell, hits) {
    var c = S.data.caps, I = S.data.inds, ks = S.selCaps, col = colorOf(S.sel);
    if (!ks.length) {
      svg('text', { x: 14, y: 22 }, s).textContent = 'Nest captures only: no trap positions.';
      return;
    }
    var st = {};
    ks.forEach(function (k, j) {
      var key = c.gc[k] + ',' + c.gr[k];
      if (!st[key]) st[key] = { x: px(c.gc[k]), y: py(c.gr[k]), n: 0, code: c.st[k], first: c.d[k], last: c.d[k] };
      st[key].n++; st[key].last = c.d[k];
    });
    var spots = Object.keys(st).map(function (k) { return st[k]; });
    if (spots.length >= 3) {
      var hp = hull(spots.map(function (p) { return [p.x, p.y]; }));
      svg('polygon', { points: hp.map(function (p) { return p.join(','); }).join(' '), fill: hexA(col, 0.12),
        stroke: hexA(col, 0.55), 'stroke-width': 1, 'stroke-dasharray': '4 3', 'stroke-linejoin': 'round' }, s);
    } else if (spots.length === 2) {
      svg('line', { x1: spots[0].x, y1: spots[0].y, x2: spots[1].x, y2: spots[1].y, stroke: hexA(col, 0.55),
        'stroke-width': 1, 'stroke-dasharray': '4 3' }, s);
    }
    spots.forEach(function (p) {
      svg('circle', { cx: p.x, cy: p.y, r: 3 + 2.4 * Math.sqrt(p.n), fill: hexA(col, 0.22), stroke: col, 'stroke-width': 1.3 }, s);
      hits.push({ x: p.x, y: p.y, head: 'Station ' + p.code,
        rows: [{ color: col, value: plural(p.n, 'capture'), label: ' here' },
          { value: fmtDMY(p.first), label: p.n > 1 ? ' → ' + fmtDMY(p.last) : '' }] });
    });
    // trail up to the current step, fading with age
    for (var j = 1; j <= S.step; j++) {
      var a = ks[j - 1], b = ks[j], age = S.step - j;
      var op = age < 6 ? 0.95 - age * 0.14 : 0.12;
      svg('line', { x1: px(c.gc[a]), y1: py(c.gr[a]), x2: px(c.gc[b]), y2: py(c.gr[b]), stroke: INK,
        'stroke-width': 1.8, opacity: op, 'stroke-linecap': 'round' }, s);
    }
    var k = ks[S.step];
    svg('circle', { cx: px(c.gc[k]), cy: py(c.gr[k]), r: Math.max(5, cell * 0.32), fill: col, stroke: '#ffffff', 'stroke-width': 2.5 }, s);
  }

  // ---------- grid explorer: animal card ----------
  function drawCard() {
    var el = $('gx-card');
    el.replaceChildren();
    if (S.sel < 0) {
      h('p', 'gx-empty', el, 'Click an animal, in the capture histories or on the map, to follow it on its own: ' +
        'every trap it used, a replay of its captures in order, its body mass over time, and its full capture record.');
      return;
    }
    var I = S.data.inds, c = S.data.caps, nd = S.data.nest, i = S.sel, sp = I.sp[i];
    var t = h('h3', null, el); var k = h('i', null, t); k.style.background = colorOf(i);
    t.appendChild(document.createTextNode(I.id[i]));
    var sub = h('p', 'gx-sub', el, SP_NAME[sp] + ' (');
    h('i', null, sub, SP_LATIN[sp]);
    sub.appendChild(document.createTextNode(') · ' + (SEX[I.sex[i]] || 'sex not recorded')));
    var gk = S.byInd[i], nk = S.nestByInd[i];
    var stations = {}; gk.forEach(function (q) { if (c.st[q] > 0) stations[c.st[q]] = 1; });
    var ns = Object.keys(stations).length;
    var dl = h('dl', null, el);
    var items = [['First caught', fmtDMY(I.first[i])], ['Last caught', fmtDMY(I.last[i])],
      ['Known alive', plural(I.last[i] - I.first[i], 'day')]];
    if (gk.length) items.push(['Grid captures', fmtN(gk.length) + ' in ' + plural(I.nsess[i], 'monthly session') +
      (S.selCaps.length < gk.length ? ' (' + S.selCaps.length + ' with a recorded trap)' : '')]);
    if (nk.length) items.push(['Nest captures', fmtN(nk.length) + ' (twice-weekly)']);
    if (gk.length) items.push(['Traps used', ns === 1 ? '1 station' : ns + ' different stations']);
    items.forEach(function (p) { h('dt', null, dl, p[0]); h('dd', null, dl, p[1]); });
    trapMates(el, i);

    // merged, dated record list
    var recs = gk.map(function (q) {
      return { d: c.d[q], kind: 'grid', q: q, check: CHECK_SHORT[c.t[q]] || '–', st: c.st[q] > 0 ? c.st[q] : '–', m: c.m[q], rp: c.rp[q] };
    });
    if (nd) nk.forEach(function (q) { recs.push({ d: nd.d[q], kind: 'nest', check: 'Nest', st: '–', m: nd.m[q], rp: nd.rp[q] }); });
    recs.sort(function (a, b) { return a.d - b.d || (a.kind === 'grid' ? -1 : 1); });
    massChart(el, recs, colorOf(i));

    var wrap = h('div', 'gx-caps', el), tb = h('table', null, wrap), hr = h('tr', null, h('thead', null, tb));
    ['Date', 'Check', 'Station', 'Mass', 'Condition'].forEach(function (x) { h('th', null, hr, x); });
    var body = h('tbody', null, tb), curRow = null, curK = S.selCaps.length ? S.selCaps[S.step] : -1;
    recs.forEach(function (rec) {
      var tr = h('tr', rec.kind === 'nest' ? 'gx-nestrow' : null, body);
      if (rec.q === curK) { tr.className = 'gx-now'; curRow = tr; }
      [fmtDMY(rec.d), rec.check, rec.st, rec.m > 0 ? rec.m + ' g' : '–', REPRO[rec.rp] || '–']
        .forEach(function (v) { h('td', null, tr, v); });
      var j = rec.kind === 'grid' ? S.selCaps.indexOf(rec.q) : -1;
      if (j >= 0) {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function () { stop(); setPos(j); });
      }
    });
    if (curRow) wrap.scrollTop = Math.max(0, curRow.offsetTop - 60);
  }

  // Animals found in the same trap on the same check as animal i.
  function trapMates(el, i) {
    var c = S.data.caps, I = S.data.inds, n = {}, first = {};
    S.byInd[i].forEach(function (k) {
      (S.atTrap[c.d[k] + '|' + c.t[k] + '|' + c.st[k]] || []).forEach(function (k2) {
        var j = c.i[k2];
        if (j === i) return;
        n[j] = (n[j] || 0) + 1;
        if (first[j] == null) first[j] = c.d[k2];
      });
    });
    var mates = Object.keys(n).map(Number).sort(function (a, b) { return n[b] - n[a] || first[a] - first[b]; });
    if (!mates.length) return;
    var box = h('dl', 'gx-mates', el);
    h('dt', null, box, 'Caught in the same trap with');
    var dd = h('dd', null, box);
    dd.style.margin = 0;
    mates.slice(0, 12).forEach(function (j) {
      var b = h('button', 'gx-mate', dd);
      var dot = h('i', null, b); dot.style.background = colorOf(j);
      h('span', null, b, I.id[j]);
      h('em', null, b, '×' + n[j]);
      b.title = (SEX[I.sex[j]] || 'Sex not recorded') + ' ' + SP_NAME[I.sp[j]].toLowerCase() + ', caught together ' + plural(n[j], 'time');
      b.addEventListener('click', function () { select(j, first[j]); scrollToRow(j); });
    });
    if (mates.length > 12) h('span', 'gx-cap', dd, '+ ' + (mates.length - 12) + ' more');
  }

  function massChart(parent, recs, col) {
    var pts = recs.filter(function (r) { return r.m > 0; });
    if (pts.length < 2) return;
    var W = parent.clientWidth - 32, T = 8, B = 18 + XT, H = 78 + B, L = 46;
    var d0 = pts[0].d, d1 = Math.max(pts[pts.length - 1].d, d0 + 1);
    var max = 0; pts.forEach(function (r) { max = Math.max(max, r.m); });
    var ticks = niceTicks(max, 3), x = lin(d0, d1, L, W - 6), y = lin(0, ticks[ticks.length - 1], H - B, T);
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': 'Body mass over time' }, parent);
    yAxis(s, ticks, y, L, W - 6, ' g');
    svg('text', { x: L, y: H - B + 14 }, s).textContent = fmtMY(d0);
    svg('text', { x: W - 6, y: H - B + 14, 'text-anchor': 'end' }, s).textContent = fmtMY(d1);
    axisTitles(s, W, H, L, 6, T, B, 'Date', 'Mass (g)');
    svg('polyline', { points: pts.map(function (r) { return x(r.d) + ',' + y(r.m); }).join(' '),
      fill: 'none', stroke: col, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, s);
    pts.forEach(function (r) {
      var preg = r.rp === 3;
      svg('circle', { cx: x(r.d), cy: y(r.m), r: preg ? 4 : 2.6, fill: preg ? SURF : col,
        stroke: preg ? col : SURF, 'stroke-width': preg ? 2 : 1 }, s);
    });
    if (pts.some(function (r) { return r.rp === 3; })) {
      var n = h('div', 'gx-sub', parent, 'Hollow points = pregnant');
      n.style.margin = '2px 0 0';
    }
  }

  // ---------- body mass ----------
  function bindMass() {
    [['gx-m-sp', 'sp'], ['gx-m-hab', 'hab'], ['gx-m-sex', 'sex'], ['gx-m-juv', 'juv']].forEach(function (p) {
      $(p[0]).addEventListener('change', function (e) { MS[p[1]] = p[1] === 'sex' ? +e.target.value : e.target.value; drawMass(); });
    });
  }
  function drawMass() {
    if (!MASS) return;
    drawSeason(); drawRepro(); drawGrowth();
  }
  function monthAxis(s, x, y0, labelY, W) {
    for (var m = 1; m <= 12; m++) {
      svg('text', { x: x(m), y: labelY, 'text-anchor': 'middle' }, s).textContent = W < 420 ? MON[m - 1][0] : MON[m - 1];
    }
  }
  function sexesShown() { return MS.sex ? [MS.sex] : [1, 2]; }

  function drawSeason() {
    var sexes = sexesShown(), single = sexes.length === 1;
    var data = sexes.map(function (sx) { return { sx: sx, col: SEXC[sx], rows: MASS.season[MS.sp + '|' + MS.hab + '|' + sx] }; });
    var wrap = $('gx-season'); wrap.replaceChildren();
    var W = wrap.clientWidth, T = 10, B = 22 + XT, H = 188 + B, L = M.l, R = M.r;
    var max = 10;
    data.forEach(function (dd) { dd.rows.forEach(function (r) { if (r.q) max = Math.max(max, r.q[single ? 4 : 3]); }); });
    var ticks = niceTicks(max, 4), y = lin(0, ticks[ticks.length - 1], H - B, T), x = lin(0.5, 12.5, L, W - R);
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': 'Body mass by month, by sex' }, wrap);
    yAxis(s, ticks, y, L, W - R, ' g');
    monthAxis(s, x, H - B, H - B + 16, W);
    axisTitles(s, W, H, L, R, T, B, 'Month', 'Body mass (g)');
    function band(rows, lo, hi, fill) {
      var segs = [], cur = [];
      rows.forEach(function (r, j) { if (r.q) cur.push(j); else if (cur.length) { segs.push(cur); cur = []; } });
      if (cur.length) segs.push(cur);
      segs.forEach(function (seg) {
        var top = seg.map(function (j) { return x(j + 1) + ',' + y(rows[j].q[hi]); });
        var bot = seg.slice().reverse().map(function (j) { return x(j + 1) + ',' + y(rows[j].q[lo]); });
        svg('polygon', { points: top.concat(bot).join(' '), fill: fill }, s);
      });
    }
    data.forEach(function (dd) {
      if (single) band(dd.rows, 0, 4, hexA(dd.col, 0.14));
      band(dd.rows, 1, 3, hexA(dd.col, single ? 0.32 : 0.2));
    });
    var months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    data.forEach(function (dd) {
      var meds = dd.rows.map(function (r) { return r.q ? r.q[2] : null; });
      svg('path', { d: linePath(months, meds, x, y, 1.5), fill: 'none', stroke: dd.col, 'stroke-width': 2, 'stroke-linejoin': 'round' }, s);
      meds.forEach(function (m, j) { if (m != null) svg('circle', { cx: x(j + 1), cy: y(m), r: 3, fill: dd.col, stroke: SURF, 'stroke-width': 1.5 }, s); });
    });
    var cross = svg('line', { y1: T, y2: H - B, class: 'gx-cross', visibility: 'hidden' }, s);
    s.addEventListener('pointermove', function (ev) {
      var r = s.getBoundingClientRect(), m = clamp(Math.round(x.inv(ev.clientX - r.left)), 1, 12), rows = [];
      cross.setAttribute('x1', x(m)); cross.setAttribute('x2', x(m)); cross.setAttribute('visibility', 'visible');
      data.forEach(function (dd) {
        var q = dd.rows[m - 1];
        if (!q.q) return rows.push({ color: dd.col, value: 'too few records', label: ' · ' + SEX_PL[dd.sx].toLowerCase() });
        rows.push({ color: dd.col, value: q.q[2] + ' g', label: ' ' + SEX_PL[dd.sx].toLowerCase() + ' · middle 50% ' + q.q[1] + '–' + q.q[3] + ' g · n ' + fmtN(q.n) });
      });
      showTip(ev, MON_LONG[m - 1] + ' · median mass', rows);
    });
    s.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });

    // breeding share, grouped by sex, same x positions
    var bw = $('gx-breed'); bw.replaceChildren();
    var BH = 98 + B, by = lin(0, 1, BH - B, T);
    var b = svg('svg', { width: W, height: BH, class: 'gx-svg', role: 'img', 'aria-label': 'Share in breeding condition by month, by sex' }, bw);
    [0, 0.5, 1].forEach(function (v) {
      if (v > 0) svg('line', { x1: L, x2: W - R, y1: by(v), y2: by(v), class: 'gx-gridline' }, b);
      svg('text', { x: L - 6, y: by(v) + 4, 'text-anchor': 'end' }, b).textContent = Math.round(v * 100) + '%';
    });
    svg('line', { x1: L, x2: W - R, y1: by(0), y2: by(0), class: 'gx-baseline' }, b);
    monthAxis(b, x, BH - B, BH - B + 16, W);
    axisTitles(b, W, BH, L, R, T, B, 'Month', 'In breeding condition');
    var slot = Math.max(6, Math.min(30, (W - L - R) / 12 - 6)), gap = 2, bw1 = (slot - gap * (data.length - 1)) / data.length;
    data.forEach(function (dd, k) {
      dd.rows.forEach(function (q, j) {
        if (q.pr == null) return;
        var x0 = x(j + 1) - slot / 2 + k * (bw1 + gap), top = by(q.pr), rr = Math.min(3, bw1 / 2);
        var bar = svg('path', { d: 'M' + x0 + ',' + by(0) + 'V' + (top + rr) + 'q0,-' + rr + ' ' + rr + ',-' + rr + 'h' + (bw1 - 2 * rr) +
          'q' + rr + ',0 ' + rr + ',' + rr + 'V' + by(0) + 'Z', fill: dd.col }, b);
        bar.addEventListener('pointermove', function (ev) {
          showTip(ev, MON_LONG[j], [{ color: dd.col, value: Math.round(q.pr * 100) + '%', label: ' of ' + SEX_PL[dd.sx].toLowerCase() + ' in breeding condition' }],
            dd.sx === 1 ? 'Males: testes descended.' : 'Females: vulva open, pregnant, or lactating.');
        });
        bar.addEventListener('pointerleave', hideTip);
      });
    });
  }

  function drawRepro() {
    var wrap = $('gx-repro'); wrap.replaceChildren();
    var classes = MS.sex === 1 ? [1, 2] : [1, 2, 3];
    var W = wrap.clientWidth, RH = 78, T = 6, B = 24 + XT, L = 30, R = M.r;
    var H = T + classes.length * RH + B;
    var bin = MASS.bin, nb = MASS.max / bin, x = lin(0, MASS.max, L, W - R);
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': 'Body mass by reproductive condition, by sex' }, wrap);
    for (var g = 0; g <= MASS.max; g += 20) {
      svg('line', { x1: x(g), x2: x(g), y1: T, y2: H - B, class: 'gx-gridline' }, s);
      svg('text', { x: x(g), y: H - B + 18, 'text-anchor': 'middle' }, s).textContent = g;
    }
    axisTitles(s, W, H, L, R, T, B, 'Body mass (g)', 'Share of records');
    classes.forEach(function (rc, k) {
      var top = T + k * RH, base = top + RH - 6;
      var sexes = sexesShown().filter(function (sx) { return rc !== 3 || sx === 2; });
      var ds = sexes.map(function (sx) {
        var d = MASS.repro[MS.sp + '|' + MS.hab + '|' + sx + '|' + rc];
        return d ? { sx: sx, d: d, p: d.h.map(function (v) { return v / d.n; }) } : null;
      }).filter(Boolean);
      svg('line', { x1: L, x2: W - R, y1: base, y2: base, class: 'gx-baseline' }, s);
      var title = REPRO[rc] + (rc === 3 ? ' (females)' : '');
      if (!ds.length) { svg('text', { x: L, y: top + 14, class: 'gx-panel-title' }, s).textContent = title + ' · too few records'; return; }
      var pmax = 0; ds.forEach(function (q) { pmax = Math.max(pmax, Math.max.apply(null, q.p)); });
      var yy = lin(0, pmax, base, top + 22);
      ds.slice().reverse().forEach(function (q) {
        var col = SEXC[q.sx], p = 'M' + x(0) + ',' + base;
        q.p.forEach(function (v, j) { p += 'V' + yy(v).toFixed(1) + 'H' + x((j + 1) * bin).toFixed(1); });
        p += 'V' + base + 'Z';
        svg('path', { d: p, fill: hexA(col, ds.length > 1 ? 0.2 : 0.32), stroke: col, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, s);
        svg('line', { x1: x(q.d.med), x2: x(q.d.med), y1: top + 22, y2: base, stroke: col, 'stroke-width': 1.6, 'stroke-dasharray': '3 2' }, s);
      });
      svg('text', { x: L, y: top + 14, class: 'gx-panel-title' }, s).textContent = title + ' · median ' +
        ds.map(function (q) { return (ds.length > 1 ? SEX_PL[q.sx].toLowerCase() + ' ' : '') + q.d.med + ' g'; }).join(', ');
      var hit = svg('rect', { x: L, y: top, width: W - L - R, height: RH, fill: 'transparent' }, s);
      hit.addEventListener('pointermove', function (ev) {
        var r = s.getBoundingClientRect(), j = clamp(Math.floor(x.inv(ev.clientX - r.left) / bin), 0, nb - 1);
        showTip(ev, title + ' · ' + (j * bin) + '–' + ((j + 1) * bin) + ' g', ds.map(function (q) {
          return { color: SEXC[q.sx], value: Math.round(q.p[j] * 100) + '%', label: ' of ' + SEX_PL[q.sx].toLowerCase() + ' (' + fmtN(q.d.h[j]) + ' of ' + fmtN(q.d.n) + ')' };
        }));
      });
      hit.addEventListener('pointerleave', hideTip);
    });
  }

  function drawGrowth() {
    var G = MASS.growth[MS.sp], wrap = $('gx-growth'), cv = wrap.querySelector('canvas');
    var W = wrap.clientWidth, T = 10, B = 26 + XT, H = 274 + B, L = M.l, R = M.r, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var habI = { alfalfa: 0, bluegrass: 1, tallgrass: 2 }[MS.hab];
    var DMAX = 400, YMAX = 70, x = lin(0, DMAX, L, W - R), y = lin(0, YMAX, H - B, T);
    var sexes = sexesShown(), sel = [], count = { 1: 0, 2: 0 };
    for (var a = 0; a < G.t.length; a++) {
      if (MS.hab !== 'all' && G.hab[a] !== habI) continue;
      if (sexes.indexOf(G.sex[a]) < 0) continue;
      if (MS.juv === 'juv' && !(G.m[a][0] < 20)) continue;
      sel.push(a); count[G.sex[a]]++;
    }
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = tok('--muted'); ctx.strokeStyle = tok('--grid'); ctx.lineWidth = 1;
    [0, 20, 40, 60].forEach(function (v) {
      var yy = Math.round(y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(W - R, yy); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v, L - 6, yy + 4);
    });
    ctx.textAlign = 'center';
    for (var dd = 0; dd <= DMAX; dd += 50) ctx.fillText(dd, x(dd), H - B + 16);
    ctx.fillStyle = tok('--ink-2');
    ctx.fillText('Days since first weighed', (L + W - R) / 2, H - 3);
    ctx.save(); ctx.translate(11, (T + H - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Body mass (g)', 0, 4); ctx.restore();
    ctx.fillStyle = tok('--muted');
    ctx.textAlign = 'left';
    ctx.fillText(sexes.map(function (sx) { return plural(count[sx], sx === 1 ? 'male' : 'female'); }).join(' · '), L + 4, T + 10);
    // spaghetti, one faint line per animal in its sex's color
    ctx.lineWidth = 1;
    sel.forEach(function (a) {
      var t = G.t[a], m = G.m[a];
      ctx.globalAlpha = clamp(4 / Math.sqrt(Math.max(count[G.sex[a]], 1)), 0.04, 0.5);
      ctx.strokeStyle = SEXC[G.sex[a]];
      ctx.beginPath();
      for (var j = 0; j < t.length; j++) { if (j) ctx.lineTo(x(t[j]), y(m[j])); else ctx.moveTo(x(t[j]), y(m[j])); }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // median per sex, 20-day bins
    var BIN = 20, meds = {};
    sexes.forEach(function (sx) {
      var bins = [];
      for (var bI = 0; bI <= DMAX / BIN; bI++) bins.push([]);
      sel.forEach(function (a) { if (G.sex[a] === sx) G.t[a].forEach(function (t, j) { bins[Math.floor(t / BIN)].push(G.m[a][j]); }); });
      meds[sx] = bins.map(function (v) {
        if (v.length < 15) return null;
        v.sort(function (p, q) { return p - q; });
        return { m: v[Math.floor(v.length / 2)], n: v.length };
      });
    });
    function medPath(med) {
      ctx.beginPath(); var on = false;
      med.forEach(function (p, j) {
        if (!p) { on = false; return; }
        var px = x(j * BIN + (j ? BIN / 2 : 0)), py = y(p.m);
        if (on) ctx.lineTo(px, py); else { ctx.moveTo(px, py); on = true; }
      });
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
    sexes.forEach(function (sx) {
      ctx.strokeStyle = SURF; ctx.lineWidth = 5; medPath(meds[sx]);
      ctx.strokeStyle = SEXC[sx]; ctx.lineWidth = 2.5; medPath(meds[sx]);
    });
    cv.onpointermove = function (ev) {
      var r = cv.getBoundingClientRect(), t = clamp(x.inv(ev.clientX - r.left), 0, DMAX), j = Math.floor(t / BIN), rows = [];
      sexes.forEach(function (sx) {
        var p = meds[sx][j];
        if (p) rows.push({ color: SEXC[sx], value: p.m + ' g', label: ' median, ' + SEX_PL[sx].toLowerCase() + ' (' + fmtN(p.n) + ' weighings)' });
      });
      if (!rows.length) return hideTip();
      showTip(ev, 'Days ' + j * BIN + '–' + (j + 1) * BIN + ' after first weighed', rows);
    };
    cv.onpointerleave = hideTip;
  }

  // ---------- shared small-chart helpers ----------
  function pct(v, dp) { return (v * 100).toFixed(dp || 0) + '%'; }
  function pairPanels(el) {
    el.replaceChildren();
    return ['MO', 'MP'].map(function (sp) {
      var d = h('div', null, el), t = h('p', 'gx-pair-title', d, SP_NAME[sp] + ' ');
      h('i', null, t, SP_LATIN[sp]);
      return { sp: sp, el: h('div', null, d), box: d };
    });
  }
  function caption(el, text) { return h('p', 'gx-cap', el, text); }
  // Lines over categorical x positions; null values break the line.
  function catLines(el, o) {
    var W = el.clientWidth, H = (o.H || 170) + XT, T = 10, B = 22 + XT, L = M.l, R = M.r, n = o.cats.length;
    function x(j) { return L + (j + 0.5) * (W - L - R) / n; }
    var ticks = niceTicks(o.max, 4), y = lin(0, ticks[ticks.length - 1], H - B, T);
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': o.label || '' }, el);
    ticks.forEach(function (v) {
      if (v > 0) svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'gx-gridline' }, s);
      svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, s).textContent = o.fmt(v);
    });
    svg('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'gx-baseline' }, s);
    o.cats.forEach(function (cname, j) { svg('text', { x: x(j), y: H - B + 16, 'text-anchor': 'middle' }, s).textContent = cname; });
    axisTitles(s, W, H, L, R, T, B, o.xTitle, o.yTitle);
    o.series.forEach(function (q) {
      var d = '', on = false;
      q.v.forEach(function (v, j) {
        if (v == null) { on = false; return; }
        d += (on ? 'L' : 'M') + x(j).toFixed(1) + ',' + y(v).toFixed(1); on = true;
      });
      svg('path', { d: d, fill: 'none', stroke: q.color, 'stroke-width': 2, 'stroke-linejoin': 'round',
        'stroke-dasharray': q.dash || 'none' }, s);
      q.v.forEach(function (v, j) {
        if (v != null) svg('circle', { cx: x(j), cy: y(v), r: 3.2, fill: q.dash ? SURF : q.color, stroke: q.dash ? q.color : SURF, 'stroke-width': 1.5 }, s);
      });
    });
    var cross = svg('line', { y1: T, y2: H - B, class: 'gx-cross', visibility: 'hidden' }, s);
    s.addEventListener('pointermove', function (ev) {
      var r = s.getBoundingClientRect(), j = clamp(Math.floor((ev.clientX - r.left - L) / ((W - L - R) / n)), 0, n - 1);
      cross.setAttribute('x1', x(j)); cross.setAttribute('x2', x(j)); cross.setAttribute('visibility', 'visible');
      var tp = o.tip(j); showTip(ev, tp.head, tp.rows, tp.sub);
    });
    s.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  }
  // Grouped vertical bars over categories, one bar per series.
  function groupedBars(el, o) {
    var W = el.clientWidth, H = (o.H || 170) + XT, T = 10, B = 22 + XT, L = M.l, R = M.r, n = o.cats.length, m = o.series.length;
    var slot = (W - L - R) / n, grp = Math.min(slot * 0.72, 22 * m + 2 * (m - 1)), gap = 2, bw = (grp - gap * (m - 1)) / m;
    var ticks = niceTicks(o.max, 4), y = lin(0, ticks[ticks.length - 1], H - B, T);
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': o.label || '' }, el);
    ticks.forEach(function (v) {
      if (v > 0) svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'gx-gridline' }, s);
      svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, s).textContent = o.fmt(v);
    });
    o.cats.forEach(function (cname, j) {
      svg('text', { x: L + (j + 0.5) * slot, y: H - B + 16, 'text-anchor': 'middle' }, s).textContent = cname;
      o.series.forEach(function (q, k) {
        var v = q.v[j];
        if (v == null) return;
        var x0 = L + (j + 0.5) * slot - grp / 2 + k * (bw + gap), top = y(v), rr = Math.min(3, bw / 2, (y(0) - top) / 2);
        var bar = svg('path', { d: 'M' + x0 + ',' + y(0) + 'V' + (top + rr) + 'q0,-' + rr + ' ' + rr + ',-' + rr + 'h' + (bw - 2 * rr) +
          'q' + rr + ',0 ' + rr + ',' + rr + 'V' + y(0) + 'Z', fill: q.color }, s);
        svg('rect', { x: x0 - 1, y: T, width: bw + 2, height: H - B - T, fill: 'transparent' }, s)
          .addEventListener('pointermove', function (ev) { var tp = o.tip(j, k); showTip(ev, tp.head, tp.rows, tp.sub); });
        bar.addEventListener('pointerleave', hideTip);
      });
    });
    svg('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'gx-baseline' }, s);
    axisTitles(s, W, H, L, R, T, B, o.xTitle, o.yTitle);
    s.addEventListener('pointerleave', hideTip);
  }

  // ---------- social life ----------
  function bindSocial() {
    $('gx-s-hab').addEventListener('change', function (e) { SS.hab = e.target.value; drawSocial(); });
    $('gx-s-meas').addEventListener('change', function (e) { SS.meas = e.target.value; drawSocial(); });
    $('gx-t-sp').addEventListener('change', function (e) { TS.sp = e.target.value; drawTraps(); });
    $('gx-t-hab').addEventListener('change', function (e) { TS.hab = e.target.value; drawTraps(); });
  }
  var DENS_CATS = ['≤10', '10–20', '20–40', '40–80', '80–160', '>160'];
  var MASS_CATS = ['<30', '30–34', '35–39', '40–44', '45–49', '50+'];
  function drawSocial() {
    if (!SOC) return;
    var hab = SS.hab, meas = SS.meas, measName = meas === 'co' ? 'caught together' : 'shared a trap';

    // 1. opposite-sex co-capture vs density
    var panels = pairPanels($('gx-s-together')), max = 0.1;
    panels.forEach(function (p) { [1, 2].forEach(function (sx) {
      (SOC.together[p.sp + '|' + hab + '|' + sx] || []).forEach(function (r) { if (r.opp != null) max = Math.max(max, r.opp); });
    }); });
    panels.forEach(function (p) {
      var rows = { 1: SOC.together[p.sp + '|' + hab + '|1'] || [], 2: SOC.together[p.sp + '|' + hab + '|2'] || [] };
      catLines(p.el, { cats: DENS_CATS, max: max, fmt: function (v) { return pct(v); }, label: 'Share caught with the opposite sex by density',
        xTitle: 'Population density (voles / ha)', yTitle: 'With opposite sex',
        series: [1, 2].map(function (sx) { return { color: SEXC[sx], v: rows[sx].map(function (r) { return r.opp; }) }; }),
        tip: function (j) {
          return { head: DENS_CATS[j] + ' voles/ha', rows: [1, 2].filter(function (sx) { return rows[sx][j]; }).map(function (sx) {
            var r = rows[sx][j];
            return { color: SEXC[sx], value: r.opp == null ? 'too few' : pct(r.opp), label: ' of ' + SEX_PL[sx].toLowerCase() + ' (' + fmtN(r.n) + ' animal-sessions)' };
          }) };
        } });
    });

    // 2. composition of two-vole traps
    var cw = $('gx-s-comp'); cw.replaceChildren();
    var lg = h('div', 'gx-legend', cw);
    var CC = { MF: '#c9c8c1', FF: SEXC[2], MM: SEXC[1] };
    [['MF', 'Male + female'], ['FF', 'Female + female'], ['MM', 'Male + male']].forEach(function (q) {
      var sp = h('span', null, lg); var k = h('i', null, sp); k.style.background = CC[q[0]]; k.style.height = '8px'; k.style.width = '12px';
      sp.appendChild(document.createTextNode(q[1]));
    });
    var W = cw.clientWidth, RH = 50, CL = 24, H = RH * 2 + 26 + XT, R = M.r;
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': 'Sex composition of two-vole traps' }, cw);
    ['MO', 'MP'].forEach(function (sp, r) {
      var d = SOC.comp[sp + '|' + hab], y0 = r * RH;
      svg('text', { x: CL, y: y0 + 13, class: 'gx-panel-title' }, s).textContent = SP_NAME[sp] + (d ? ' · ' + fmtN(d.n) + ' traps with two voles' : ' · too few records');
      if (!d) return;
      var x = lin(0, 1, CL, W - R), acc = 0;
      [['MF', d.MF], ['FF', d.FF], ['MM', d.MM]].forEach(function (q) {
        var f = q[1] / d.n, x0 = x(acc), w = Math.max(0, x(acc + f) - x0 - 2);
        var rect = svg('rect', { x: x0, y: y0 + 20, width: w, height: 20, rx: 3, fill: CC[q[0]] }, s);
        if (w > 36) svg('text', { x: x0 + 6, y: y0 + 34, style: 'fill:#111' }, s).textContent = pct(f);
        rect.addEventListener('pointermove', function (ev) {
          showTip(ev, SP_NAME[sp], [{ color: CC[q[0]], value: pct(f, 1), label: ' ' + { MF: 'male + female', FF: 'female + female', MM: 'male + male' }[q[0]] + ' (' + fmtN(q[1]) + ')' }],
            'Random entry would give about ' + pct(d.expMF) + ' male + female');
        });
        rect.addEventListener('pointerleave', hideTip);
        acc += f;
      });
      var ex = x(d.expMF);
      svg('line', { x1: ex, x2: ex, y1: y0 + 16, y2: y0 + 44, stroke: '#111', 'stroke-width': 2.5 }, s);
    });
    var cx = lin(0, 1, CL, W - R), ay = RH * 2 + 6;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      svg('line', { x1: cx(v), x2: cx(v), y1: ay, y2: ay + 4, class: 'gx-baseline' }, s);
      svg('text', { x: cx(v), y: ay + 16, 'text-anchor': v === 0 ? 'start' : v === 1 ? 'end' : 'middle' }, s).textContent = pct(v);
    });
    axisTitles(s, W, H, CL, R, 0, H - RH * 2, 'Share of two-vole traps', 'Species');
    caption(cw, 'Dark tick: share of male + female pairs expected if voles entered traps at random.');

    // 3. number of partners
    panels = pairPanels($('gx-s-partners')); max = 0.1;
    panels.forEach(function (p) { [1, 2].forEach(function (sx) {
      var d = SOC.partners[p.sp + '|' + hab + '|' + sx];
      if (d) d[meas].forEach(function (v) { max = Math.max(max, v / d.n); });
    }); });
    panels.forEach(function (p) {
      var D = { 1: SOC.partners[p.sp + '|' + hab + '|1'], 2: SOC.partners[p.sp + '|' + hab + '|2'] };
      groupedBars(p.el, { cats: ['0', '1', '2', '3+'], max: max, fmt: function (v) { return pct(v); }, label: 'Number of opposite-sex partners',
        xTitle: 'Opposite-sex partners per session', yTitle: 'Breeding animals',
        series: [1, 2].map(function (sx) { return { color: SEXC[sx], v: D[sx] ? D[sx][meas].map(function (v) { return v / D[sx].n; }) : [] }; }),
        tip: function (j, k) {
          var sx = k + 1, d = D[sx];
          return { head: SP_NAME[p.sp] + ' · breeding ' + SEX_PL[sx].toLowerCase(),
            rows: [{ color: SEXC[sx], value: pct(d[meas][j] / d.n, 1), label: ' ' + measName + ' with ' + ['no', 'one', 'two', 'three or more'][j] + ' ' + (sx === 1 ? 'female' : 'male') + (j === 1 ? '' : 's') }],
            sub: fmtN(d[meas][j]) + ' of ' + fmtN(d.n) + ' animal-sessions' };
        } });
      var parts = [1, 2].filter(function (sx) { return D[sx]; }).map(function (sx) {
        var a = D[sx][meas], any = a[1] + a[2] + a[3];
        return SEX_PL[sx].toLowerCase() + ' ' + (any ? pct(a[1] / any) : '–');
      });
      var cp = caption(p.box, '');
      h('b', null, cp, 'Of those with any partner, one only: ' + parts.join(', ') + '.');
    });

    // 4. mass and number of females (breeding males)
    panels = pairPanels($('gx-s-mass')); max = 0.1;
    panels.forEach(function (p) { (SOC.mass[p.sp + '|' + hab] || []).forEach(function (r) { if (r[meas + '1'] != null) max = Math.max(max, r[meas + '1']); }); });
    panels.forEach(function (p) {
      var rows = SOC.mass[p.sp + '|' + hab] || [];
      catLines(p.el, { cats: MASS_CATS, max: max, fmt: function (v) { return pct(v); }, label: 'Breeding males with female partners by body mass',
        xTitle: 'Male body mass (g)', yTitle: 'Breeding males',
        series: [{ color: SEXC[1], v: rows.map(function (r) { return r[meas + '1']; }) },
                 { color: SEXC[1], dash: '5 4', v: rows.map(function (r) { return r[meas + '2']; }) }],
        tip: function (j) {
          var r = rows[j];
          if (!r || r[meas + '1'] == null) return { head: MASS_CATS[j] + ' g', rows: [{ value: 'too few males', label: '' }] };
          return { head: 'Breeding males, ' + MASS_CATS[j] + ' g', rows: [
            { color: SEXC[1], value: pct(r[meas + '1']), label: ' with 1+ females' },
            { color: SEXC[1], value: pct(r[meas + '2']), label: ' with 2+ females' }],
            sub: fmtN(r.n) + ' male-sessions · ' + r.ncap + ' captures per session' };
        } });
      caption(p.box, 'Solid: 1+ female partners; dashed: 2+.');
    });

    // 5. pair fidelity
    var fw = $('gx-s-fid'); fw.replaceChildren();
    var FW = fw.clientWidth, LBL = Math.min(300, FW * 0.45) + 18, BH = 16, GAP = 6, HEAD = 22;
    var kinds = [['together', 'Caught together this month', '#e0e0e0'],
                 ['neighbors', 'Neighbors (shared a trap, not caught together)', '#8f8e88'],
                 ['any', 'Any male–female pair on the grid', '#55544f']];
    var PLOT = 2 * (HEAD + kinds.length * (BH + GAP)), FH = PLOT + 26 + XT, fmax = 0.05;
    ['MO', 'MP'].forEach(function (sp) { var f = SOC.fidelity[sp + '|' + hab]; if (f) kinds.forEach(function (k) { if (f[k[0]].p) fmax = Math.max(fmax, f[k[0]].p); }); });
    var fx = lin(0, fmax * 1.12, LBL, FW - 50);
    var fs = svg('svg', { width: FW, height: FH, class: 'gx-svg', role: 'img', 'aria-label': 'Pairs caught together again next month' }, fw);
    var yy = 0;
    ['MO', 'MP'].forEach(function (sp) {
      var f = SOC.fidelity[sp + '|' + hab];
      svg('text', { x: 22, y: yy + 14, class: 'gx-panel-title' }, fs).textContent = SP_NAME[sp];
      yy += HEAD;
      kinds.forEach(function (k) {
        var d = f && f[k[0]];
        svg('text', { x: LBL - 8, y: yy + BH - 4, 'text-anchor': 'end' }, fs).textContent = k[1];
        if (d && d.p != null && d.followed >= 20) {
          var w = Math.max(2, fx(d.p) - LBL);
          var b = svg('rect', { x: LBL, y: yy, width: w, height: BH, rx: 3, fill: k[2] }, fs);
          svg('text', { x: LBL + w + 6, y: yy + BH - 4, style: 'fill:' + INK }, fs).textContent = pct(d.p, d.p < 0.1 ? 1 : 0);
          b.addEventListener('pointermove', function (ev) {
            showTip(ev, SP_NAME[sp] + ' · ' + k[1], [{ value: fmtN(d.again), label: ' of ' + fmtN(d.followed) + ' pairs caught together again next month' }]);
          });
          b.addEventListener('pointerleave', hideTip);
        } else {
          svg('text', { x: LBL, y: yy + BH - 4 }, fs).textContent = 'too few pairs';
        }
        yy += BH + GAP;
      });
    });
    var ft = niceTicks(fmax * 1.12, 4).filter(function (v) { return v <= fmax * 1.12; });
    ft.forEach(function (v) {
      svg('line', { x1: fx(v), x2: fx(v), y1: PLOT + 4, y2: PLOT + 8, class: 'gx-baseline' }, fs);
      svg('text', { x: fx(v), y: PLOT + 20, 'text-anchor': 'middle' }, fs).textContent = pct(v);
    });
    axisTitles(fs, FW, FH, LBL, 50, 0, FH - PLOT, 'Caught together again the next month', 'Male–female pairs');
  }

  // ---------- coming back to the trap ----------
  function drawTraps() {
    if (!TRAPS) return;
    var base = TS.sp + '|' + TS.hab + '|', D = { 1: TRAPS.dist[base + 1] || {}, 2: TRAPS.dist[base + 2] || {} };
    var cats = ['Same', '10 m', '14–20', '22–30', '>30 m'], max = 0.1;
    ['within', 'next'].forEach(function (w) { [1, 2].forEach(function (sx) { if (D[sx][w]) D[sx][w].p.forEach(function (v) { max = Math.max(max, v); }); }); });
    [['within', 'gx-t-within', 'Later in the same session'], ['next', 'gx-t-next', 'In a later month']].forEach(function (q) {
      var el = $(q[1]); el.replaceChildren();
      h('p', 'gx-pair-title', el, q[2]);
      var box = h('div', null, el);
      groupedBars(box, { cats: cats, max: max, H: 150, fmt: function (v) { return pct(v); }, label: 'Distance to previous capture',
        xTitle: 'Distance from previous capture', yTitle: 'Recaptures',
        series: [1, 2].map(function (sx) { return { color: SEXC[sx], v: D[sx][q[0]] ? D[sx][q[0]].p : [] }; }),
        tip: function (j, k) {
          var sx = k + 1, d = D[sx][q[0]];
          return { head: q[2] + ' · ' + SEX_PL[sx].toLowerCase(), rows: [{ color: SEXC[sx], value: pct(d.p[j], 1), label: ' ' + TRAPS.labels[j] }], sub: fmtN(d.n) + ' recaptures' };
        } });
      var med = [1, 2].filter(function (sx) { return D[sx][q[0]]; }).map(function (sx) { return SEX_PL[sx].toLowerCase() + ' ' + Math.round(D[sx][q[0]].median) + ' m'; });
      caption(el, 'Median distance: ' + med.join(', ') + '.');
    });
    var E = { 1: TRAPS.exp[base + 1], 2: TRAPS.exp[base + 2] }, ord = ['1st', '2nd', '3rd', '4th', '5th'];
    $('gx-t-cohort').textContent = 'The same ' + [1, 2].map(function (sx) { return fmtN(E[sx] ? E[sx].animals : 0) + ' ' + SEX_PL[sx].toLowerCase(); }).join(' and ') +
      ', each caught in at least five different months, followed through their first five: average captures per three-day session.';
    [['gx-t-caps', 'caps', function (v) { return v.toFixed(v < 10 && v % 1 ? 1 : 0); }, ' captures per session', 'Captures / session'],
     ['gx-t-same', 'same', function (v) { return pct(v); }, ' first capture in last month\'s trap', 'Same trap']].forEach(function (q) {
      var el = $(q[0]); el.replaceChildren();
      var m = 0.1;
      [1, 2].forEach(function (sx) { if (E[sx]) E[sx].rows.forEach(function (r) { if (r[q[1]] != null) m = Math.max(m, r[q[1]]); }); });
      catLines(el, { cats: ord, max: m, H: 150, fmt: q[2], label: 'By months of experience',
        xTitle: 'Month of being caught (1st, 2nd, …)', yTitle: q[4],
        series: [1, 2].map(function (sx) { return { color: SEXC[sx], v: E[sx] ? E[sx].rows.map(function (r) { return r[q[1]]; }) : [] }; }),
        tip: function (j) {
          return { head: ord[j] + ' month caught', rows: [1, 2].filter(function (sx) { return E[sx] && E[sx].rows[j][q[1]] != null; }).map(function (sx) {
            var r = E[sx].rows[j];
            return { color: SEXC[sx], value: q[1] === 'caps' ? r.caps.toFixed(2) : pct(r.same), label: q[3] + ' · ' + SEX_PL[sx].toLowerCase() };
          }) };
        } });
    });
  }

  // ---------- grid explorer: turnover (first capture vs. caught before) ----------
  var TURN = { neu: '#e0e0e0', ret: '#6b6a65' };
  function drawTurnover() {
    var wrap = $('gx-turnover'); wrap.replaceChildren();
    legend($('gx-turnover-legend'), [{ color: TURN.neu, label: 'First capture' }, { color: TURN.ret, label: 'Caught before' }]);
    if (!STR) return;
    var tv = STR.turnover[String(S.site)] || {}, pop = S.meta.pop;
    var sps = ['MO', 'MP'].filter(function (sp) { return tv[sp] && pop[sp] && (S.sp === 'both' || S.sp === sp); });
    if (!sps.length) return;
    var d = pop[sps[0]].d, n = d.length, neu = [], ret = [], small = [];
    for (var j = 0; j < n; j++) {
      neu.push(sps.reduce(function (a, sp) { return a + tv[sp].new[j]; }, 0));
      ret.push(sps.reduce(function (a, sp) { return a + tv[sp].ret[j]; }, 0));
      small.push(sps.reduce(function (a, sp) { return a + tv[sp].small[j]; }, 0));
    }
    var W = wrap.clientWidth, T = 6, B = 20 + XT, H = 96 + B, x = siteX(W), max = 1;
    for (j = 0; j < n; j++) max = Math.max(max, neu[j] + ret[j]);
    var ticks = niceTicks(max, 3), y = lin(0, ticks[ticks.length - 1], H - B, T);
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': 'Animals caught each session: first capture vs. caught before' }, wrap);
    yearAxis(s, x, S.d0, S.d1, T, H - B, (S.d1 - S.d0) / 365 > 12 ? 2 : 1, H - B + 15);
    yAxis(s, ticks, y, M.l, W - M.r);
    axisTitles(s, W, H, M.l, M.r, T, B, 'Year', 'Caught');
    var bw = clamp((W - M.l - M.r) / n * 0.7, 1, 6);
    for (j = 0; j < n; j++) {
      var x0 = x(d[j]) - bw / 2;
      if (ret[j]) svg('rect', { x: x0, y: y(ret[j]), width: bw, height: y(0) - y(ret[j]), fill: TURN.ret }, s);
      if (neu[j]) svg('rect', { x: x0, y: y(ret[j] + neu[j]), width: bw, height: Math.max(0, y(ret[j]) - y(ret[j] + neu[j]) - 1), fill: TURN.neu }, s);
    }
    S.turnCursor = svg('line', { x1: x(curDay()), x2: x(curDay()), y1: T, y2: H - B, class: 'gx-cursor' }, s);
    function idx(ev) { var r = s.getBoundingClientRect(); return nearest(d, x.inv(ev.clientX - r.left)); }
    s.addEventListener('pointermove', function (ev) {
      var j2 = idx(ev);
      showTip(ev, fmtMY(d[j2]) + (j2 === 0 ? ' · first session on this grid' : ''), [
        { color: TURN.neu, value: fmtN(neu[j2]), label: ' caught for the first time' + (neu[j2] ? ' (' + small[j2] + ' under ' + STR.juv_g + ' g)' : '') },
        { color: TURN.ret, value: fmtN(ret[j2]), label: ' caught before' }], 'Click to show this session on the map');
    });
    s.addEventListener('pointerleave', hideTip);
    s.addEventListener('click', function (ev) { var j2 = idx(ev); if (S.sel >= 0) deselect(); setSession(nearest(S.data.sessions.d, d[j2])); });
  }

  // ---------- grid explorer: who was caught together ----------
  function drawNet() {
    var wrap = $('gx-net'); wrap.replaceChildren();
    var c = S.data.caps, I = S.data.inds, W = Math.max(220, wrap.clientWidth), note = $('gx-net-note');
    var nodes = {}, edges = {};
    function edge(a, b, w) {
      var k = a < b ? a + ',' + b : b + ',' + a;
      edges[k] = (edges[k] || 0) + (w || 1);
      nodes[a] = 1; nodes[b] = 1;
    }
    if (S.sel >= 0) {
      $('gx-net-title').textContent = 'Everyone ' + I.id[S.sel] + ' was caught with';
      S.byInd[S.sel].forEach(function (k) {
        (S.atTrap[c.d[k] + '|' + c.t[k] + '|' + c.st[k]] || []).forEach(function (k2) { if (c.i[k2] !== S.sel) edge(S.sel, c.i[k2]); });
      });
    } else {
      $('gx-net-title').textContent = 'Caught together this session';
      var seen = {};
      S.bySess[S.cur].forEach(function (k) {
        if (!keep(c.i[k])) return;
        seen[c.i[k]] = 1;
        var key = c.d[k] + '|' + c.t[k] + '|' + c.st[k];
        if (seen['k' + key]) return;
        seen['k' + key] = 1;
        var grp = (S.atTrap[key] || []).map(function (q) { return c.i[q]; }).filter(function (i) { return keep(i); });
        for (var a = 0; a < grp.length; a++) for (var b = a + 1; b < grp.length; b++) if (grp[a] !== grp[b]) edge(grp[a], grp[b]);
      });
    }
    var ids = Object.keys(nodes).map(Number);
    // connected components
    var parent = {};
    ids.forEach(function (i) { parent[i] = i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    Object.keys(edges).forEach(function (k) { var p = k.split(',').map(Number); parent[find(p[0])] = find(p[1]); });
    var comps = {};
    ids.forEach(function (i) { (comps[find(i)] = comps[find(i)] || []).push(i); });
    comps = Object.keys(comps).map(function (k) { return comps[k]; }).sort(function (a, b) { return b.length - a.length; });
    if (S.sel < 0) {
      var caughtN = Object.keys(seen).filter(function (k) { return k[0] !== 'k'; }).length;
      var pairs = comps.filter(function (g) { return g.length === 2; }), big = comps.filter(function (g) { return g.length > 2; });
      var mf = pairs.filter(function (g) { return I.sex[g[0]] && I.sex[g[1]] && I.sex[g[0]] !== I.sex[g[1]]; }).length;
      note.textContent = comps.length ? plural(pairs.length, 'pair') + ' (' + mf + ' male–female), ' + plural(big.length, 'group') +
        ' of 3+, and ' + fmtN(caughtN - ids.length) + ' animals caught only alone. Lines join animals found in the same trap on the ' +
        'same check; thicker = more checks together.' : 'No two animals were caught in the same trap this session.';
    } else {
      note.textContent = ids.length ? 'Every animal this one was ever found in the same trap with, on the same check. Thicker line = more times together.'
        : 'This animal was never caught in the same trap as another.';
    }
    if (!ids.length) return;
    // layout: ego = star; session = components packed left to right
    var R = 5, pos = {}, rowH = 0, cx = 10, cy = 10, H;
    if (S.sel >= 0) {
      var others = ids.filter(function (i) { return i !== S.sel; }), rad = Math.min(W / 2 - 40, 30 + others.length * 6);
      H = rad * 2 + 50;
      pos[S.sel] = [W / 2, H / 2];
      others.forEach(function (i, j) { var a = 2 * Math.PI * j / others.length - Math.PI / 2; pos[i] = [W / 2 + rad * Math.cos(a), H / 2 + rad * Math.sin(a)]; });
    } else {
      comps.forEach(function (g) {
        var k = g.length, local;
        if (k === 2) local = [[0, 0], [22, 0]];
        else if (k <= 5) local = g.map(function (_, j) { var a = 2 * Math.PI * j / k - Math.PI / 2, r = Math.max(12, k * 4.2); return [r * Math.cos(a), r * Math.sin(a)]; });
        else local = forceLayout(g, edges);
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        local.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
        var sc = Math.min(1, (W - 30) / Math.max(1, x1 - x0));
        var bw = (x1 - x0) * sc + 16, bh = (y1 - y0) * sc + 16;
        if (cx + bw > W - 6 && cx > 10) { cx = 10; cy += rowH + 8; rowH = 0; }
        g.forEach(function (i, j) { pos[i] = [cx + 8 + (local[j][0] - x0) * sc, cy + 8 + (local[j][1] - y0) * sc]; });
        cx += bw + 8; rowH = Math.max(rowH, bh);
      });
      H = cy + rowH + 10;
    }
    var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': 'Animals caught in the same trap' }, wrap);
    Object.keys(edges).forEach(function (k) {
      var p = k.split(',').map(Number), a = pos[p[0]], b = pos[p[1]];
      svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#8f8e88', 'stroke-width': Math.min(5, 1 + (edges[k] - 1) * 0.8), opacity: 0.85, 'stroke-linecap': 'round' }, s);
    });
    var hits = [];
    ids.forEach(function (i) {
      var p = pos[i], ego = i === S.sel;
      svg('circle', { cx: p[0], cy: p[1], r: ego ? R + 2 : R, fill: colorOf(i), stroke: ego ? '#ffffff' : SURF, 'stroke-width': ego ? 2 : 1.5 }, s);
      var w = S.sel >= 0 && !ego ? edges[S.sel < i ? S.sel + ',' + i : i + ',' + S.sel] : 0;
      hits.push({ x: p[0], y: p[1], i: i, w: w });
    });
    function near(ev) {
      var r = s.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, best = null, bd = 12 * 12;
      hits.forEach(function (p) { var dd = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); if (dd < bd) { bd = dd; best = p; } });
      return best;
    }
    s.addEventListener('pointermove', function (ev) {
      var b = near(ev);
      if (!b) { s.style.cursor = ''; return hideTip(); }
      s.style.cursor = 'pointer';
      var rows = animalTipRows(b.i);
      if (b.w) rows.unshift({ value: plural(b.w, 'time'), label: ' in the same trap as ' + I.id[S.sel] });
      showTip(ev, I.id[b.i], rows, 'Click to follow this animal');
    });
    s.addEventListener('pointerleave', function () { hideTip(); s.style.cursor = ''; });
    s.addEventListener('click', function (ev) { var b = near(ev); if (b && b.i !== S.sel) { hideTip(); select(b.i, curDay()); scrollToRow(b.i); } });
  }

  // Fruchterman-Reingold layout for one connected component; returns [[x, y], ...] in node order.
  function forceLayout(g, edges) {
    var n = g.length, idx = {}, K = 20, ITER = 180;
    g.forEach(function (id, i) { idx[id] = i; });
    var E = [];
    Object.keys(edges).forEach(function (k) {
      var p = k.split(',').map(Number);
      if (idx[p[0]] != null && idx[p[1]] != null) E.push([idx[p[0]], idx[p[1]]]);
    });
    var x = new Float64Array(n), y = new Float64Array(n), dx = new Float64Array(n), dy = new Float64Array(n);
    var R0 = Math.sqrt(n) * K * 0.6;
    for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; x[i] = R0 * Math.cos(a) + (i % 7) * 0.3; y[i] = R0 * Math.sin(a) + (i % 5) * 0.3; }
    for (var it = 0; it < ITER; it++) {
      dx.fill(0); dy.fill(0);
      for (i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
        var ex = x[i] - x[j], ey = y[i] - y[j], d2 = ex * ex + ey * ey + 0.01, f = K * K / d2;
        dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f;
      }
      E.forEach(function (e) {
        var ex = x[e[0]] - x[e[1]], ey = y[e[0]] - y[e[1]], d = Math.sqrt(ex * ex + ey * ey) + 0.01, f = d / K;
        dx[e[0]] -= ex * f; dy[e[0]] -= ey * f; dx[e[1]] += ex * f; dy[e[1]] += ey * f;
      });
      var temp = K * 2 * (1 - it / ITER) + 0.5;
      for (i = 0; i < n; i++) {
        dx[i] -= x[i] * 0.02; dy[i] -= y[i] * 0.02;   // gentle pull to centre
        var m = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1, s = Math.min(m, temp) / m;
        x[i] += dx[i] * s; y[i] += dy[i] * s;
      }
    }
    var out = [];
    for (i = 0; i < n; i++) out.push([x[i], y[i]]);
    return out;
  }

  // ---------- coverage heatmap ----------
  function ymDay(ym) { return Math.round(Date.UTC(Math.floor(ym / 12), ym % 12, 15) / DAY); }
  function drawCoverage() {
    if (!STR) return;
    var cov = STR.coverage, wrap = $('gx-coverage'), cv = wrap.querySelector('canvas');
    var groups = gridOrder(), rows = [];
    groups.forEach(function (g) { rows.push({ head: HAB_NAME[g.hab] }); g.sites.forEach(function (s) { rows.push({ site: s }); }); });
    var W = wrap.clientWidth, RH = 13, T = 4, B = 22 + XT + 26, L = M.l, R = M.r, H = T + rows.length * RH + B, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var d0 = ymDay(cov.start) - 15, d1 = ymDay(cov.start + cov.n - 1) + 16, x = lin(d0, d1, L, W - R), cw = (W - L - R) / cov.n;
    var max = 1;
    Object.keys(cov.sites).forEach(function (k) { cov.sites[k].forEach(function (v) { if (v) max = Math.max(max, v[0] + v[1]); }); });
    function shade(n) { return n ? 'rgba(232,231,225,' + (0.18 + 0.82 * Math.sqrt(n / max)).toFixed(3) + ')' : 'rgba(255,255,255,0.07)'; }
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    // year gridlines + labels
    ctx.strokeStyle = tok('--grid'); ctx.fillStyle = tok('--muted'); ctx.textAlign = 'center';
    var plotB = T + rows.length * RH;
    for (var yr = 1975; yr <= 1995; yr += 5) {
      var gx = Math.round(x(yearDay(yr))) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, T); ctx.lineTo(gx, plotB); ctx.stroke();
      ctx.fillText(yr, gx, plotB + 15);
    }
    S.covRows = rows; S.covGeom = { T: T, RH: RH, L: L, cw: cw };
    rows.forEach(function (r, ri) {
      var y0 = T + ri * RH;
      if (r.head) { ctx.fillStyle = tok('--ink-2'); ctx.textAlign = 'left'; ctx.fillText(r.head, L, y0 + 10); return; }
      ctx.fillStyle = tok('--muted'); ctx.textAlign = 'right'; ctx.fillText(pad2(r.site.site), L - 6, y0 + 10);
      (cov.sites[String(r.site.site)] || []).forEach(function (v, j) {
        if (!v) return;
        ctx.fillStyle = shade(v[0] + v[1]);
        ctx.fillRect(L + j * cw, y0 + 1.5, Math.max(1, cw - (cw > 3 ? 0.6 : 0)), RH - 3);
      });
    });
    // axis titles
    ctx.fillStyle = tok('--ink-2'); ctx.textAlign = 'center';
    ctx.fillText('Year', (L + W - R) / 2, plotB + 31);
    ctx.save(); ctx.translate(11, (T + plotB) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Grid', 0, 4); ctx.restore();
    // ramp legend
    var ly = plotB + 44, lx = L, lw = 140;
    for (var q = 0; q <= lw; q++) { ctx.fillStyle = shade(Math.max(1, Math.pow(q / lw, 2) * max)); ctx.fillRect(lx + q, ly, 1, 9); }
    ctx.fillStyle = tok('--muted'); ctx.textAlign = 'left';
    ctx.fillText('1', lx - 10, ly + 8); ctx.fillText(fmtN(max) + ' animals caught', lx + lw + 6, ly + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(lx + lw + 150, ly, 12, 9);
    ctx.fillStyle = tok('--muted'); ctx.fillText('trapped, none caught', lx + lw + 168, ly + 8);
    function hit(ev) {
      var r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var ri = Math.floor((my - T) / RH), j = Math.floor((mx - L) / cw);
      if (ri < 0 || ri >= rows.length || !rows[ri].site || j < 0 || j >= cov.n) return null;
      var v = (cov.sites[String(rows[ri].site.site)] || [])[j];
      return v ? { site: rows[ri].site, ym: cov.start + j, v: v } : null;
    }
    cv.onpointermove = function (ev) {
      var hh = hit(ev);
      if (!hh) return hideTip();
      showTip(ev, 'Grid ' + hh.site.site + ' · ' + hh.site.name + ' · ' + MON[hh.ym % 12] + ' ' + Math.floor(hh.ym / 12),
        [{ color: COL.MO, value: fmtN(hh.v[0]), label: ' prairie voles' }, { color: COL.MP, value: fmtN(hh.v[1]), label: ' meadow voles' }], 'Click to open this grid and month');
    };
    cv.onpointerleave = hideTip;
    cv.onclick = function (ev) {
      var hh = hit(ev);
      if (!hh) return;
      hideTip();
      loadSite(hh.site.site, ymDay(hh.ym)).then(function () { $('gx-site').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
  }

  // ---------- arrivals and departures ----------
  function drawTurn() {
    if (!STR) return;
    var k = RS.sp + '|' + RS.hab + '|', R = { 1: STR.residence[k + 1], 2: STR.residence[k + 2] };
    var months = [];
    for (var m = 0; m <= STR.horizon; m++) months.push(m % 3 === 0 ? String(m) : '');
    var el = $('gx-r-res'); el.replaceChildren();
    catLines(el, { cats: months, max: 1, fmt: function (v) { return pct(v); }, label: 'Share still known alive by months since first capture',
      xTitle: 'Months since first capture', yTitle: 'Still known alive',
      series: [1, 2].map(function (sx) { return { color: SEXC[sx], v: R[sx] ? R[sx].s : [] }; }),
      tip: function (j) {
        return { head: j + ' month' + (j === 1 ? '' : 's') + ' after first capture', rows: [1, 2].filter(function (sx) { return R[sx]; }).map(function (sx) {
          return { color: SEXC[sx], value: pct(R[sx].s[j], 1), label: ' of ' + fmtN(R[sx].n) + ' ' + SEX_PL[sx].toLowerCase() };
        }) };
      } });
    caption(el, 'Median time known alive: ' + [1, 2].filter(function (sx) { return R[sx]; }).map(function (sx) {
      return SEX_PL[sx].toLowerCase() + ' ' + plural(R[sx].median_days, 'day'); }).join(', ') +
      '. Many animals are caught in only one session.');
    var N = { 1: STR.recruit[k + 1], 2: STR.recruit[k + 2] }, mx = 0.1;
    [1, 2].forEach(function (sx) { N[sx].forEach(function (r) { if (r.p != null) mx = Math.max(mx, r.p); }); });
    el = $('gx-r-new'); el.replaceChildren();
    catLines(el, { cats: MON.map(function (s) { return s[0]; }), max: mx, fmt: function (v) { return pct(v); }, label: 'Share of animals caught that were new, by month',
      xTitle: 'Month', yTitle: 'New animals',
      series: [1, 2].map(function (sx) { return { color: SEXC[sx], v: N[sx].map(function (r) { return r.p; }) }; }),
      tip: function (j) {
        return { head: MON_LONG[j], rows: [1, 2].map(function (sx) {
          var r = N[sx][j];
          return { color: SEXC[sx], value: r.p == null ? 'too few' : pct(r.p), label: ' of ' + fmtN(r.n) + ' ' + SEX_PL[sx].toLowerCase() + ' caught were new' };
        }) };
      } });
  }

  // ---------- experiments ----------
  var EXP_COL = { t: '#c98500', c: '#c3c2b7' };
  var EXPERIMENTS = [
    { what: 'Extra food', hab: 'bluegrass', sp: 'MO', t: [8], c: [7] },
    { what: 'Extra food', hab: 'bluegrass', sp: 'MP', t: [8], c: [7] },
    { what: 'Extra food', hab: 'tallgrass', sp: 'MO', t: [17], c: [15] },
    { what: 'Extra food', hab: 'tallgrass', sp: 'MP', t: [17], c: [15] },
    { what: 'Meadow voles removed', hab: 'bluegrass', sp: 'MO', t: [9], c: [7, 11] },
    { what: 'Prairie voles removed', hab: 'bluegrass', sp: 'MP', t: [10], c: [7] },
    { what: 'Meadow voles removed', hab: 'tallgrass', sp: 'MO', t: [19], c: [13, 16] },
    { what: 'Meadow voles removed', hab: 'Trelease tallgrass', sp: 'MO', t: [14], c: [15] },
    { what: 'Extra food, meadow voles removed', hab: 'tallgrass', sp: 'MO', t: [18], c: [19] }
  ];
  function siteSeries(ids, sp) {
    var d = [], v = [], src = [];
    ids.forEach(function (id) {
      var s = META.sites.filter(function (q) { return q.site === id; })[0], p = s && s.pop[sp];
      if (!p) return;
      p.d.forEach(function (dd, j) { d.push(dd); v.push(p.mnka[j] / s.area_ha); src.push(id); });
    });
    var o = d.map(function (_, j) { return j; }).sort(function (a, b) { return d[a] - d[b]; });
    return { d: o.map(function (j) { return d[j]; }), v: o.map(function (j) { return v[j]; }), site: o.map(function (j) { return src[j]; }) };
  }
  function drawExp() {
    legend($('gx-exp-legend'), [{ color: EXP_COL.t, label: 'Treated grid' }, { color: EXP_COL.c, label: 'Control grid (dashed)' }]);
    var wrap = $('gx-exp-panels'); wrap.replaceChildren();
    EXPERIMENTS.forEach(function (e) {
      var tr = siteSeries(e.t, e.sp), ct0 = siteSeries(e.c, e.sp);
      if (!tr.d.length) return;
      var d0 = tr.d[0] - 20, d1 = tr.d[tr.d.length - 1] + 20, ct = { d: [], v: [], site: [] };
      ct0.d.forEach(function (dd, j) { if (dd >= d0 && dd <= d1) { ct.d.push(dd); ct.v.push(ct0.v[j]); ct.site.push(ct0.site[j]); } });
      var box = h('div', null, wrap), title = h('p', 'gx-pair-title', box);
      h('b', null, title, e.what);
      title.appendChild(document.createTextNode(' · ' + e.hab + ' · ' + SP_NAME[e.sp].toLowerCase() + 's '));
      h('i', null, title, '(grid ' + e.t.join(', ') + ' vs. ' + e.c.join(' then ') + ')');
      var el = h('div', null, box);
      var W = el.clientWidth, T = 8, B = 20 + XT, H = 120 + B, x = lin(d0, d1, M.l, W - M.r), max = 1;
      tr.v.concat(ct.v).forEach(function (v) { max = Math.max(max, v); });
      var ticks = niceTicks(max, 3), y = lin(0, ticks[ticks.length - 1], H - B, T);
      var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': e.what + ' experiment' }, el);
      yearAxis(s, x, d0, d1, T, H - B, (d1 - d0) / 365 > 8 ? 2 : 1, H - B + 15);
      yAxis(s, ticks, y, M.l, W - M.r);
      axisTitles(s, W, H, M.l, M.r, T, B, 'Year', 'Voles / ha');
      svg('path', { d: linePath(ct.d, ct.v, x, y, 75), fill: 'none', stroke: EXP_COL.c, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, s);
      svg('path', { d: linePath(tr.d, tr.v, x, y, 75), fill: 'none', stroke: EXP_COL.t, 'stroke-width': 2, 'stroke-linejoin': 'round' }, s);
      var cross = svg('line', { y1: T, y2: H - B, class: 'gx-cross', visibility: 'hidden' }, s);
      s.addEventListener('pointermove', function (ev) {
        var r = s.getBoundingClientRect(), dd = x.inv(ev.clientX - r.left), i = nearest(tr.d, dd), jj = nearest(ct.d, tr.d[i]);
        cross.setAttribute('x1', x(tr.d[i])); cross.setAttribute('x2', x(tr.d[i])); cross.setAttribute('visibility', 'visible');
        var rows = [{ color: EXP_COL.t, value: tr.v[i].toFixed(0) + '/ha', label: ' treated (grid ' + tr.site[i] + ')' }];
        if (jj >= 0 && Math.abs(ct.d[jj] - tr.d[i]) < 40) rows.push({ color: EXP_COL.c, value: ct.v[jj].toFixed(0) + '/ha', label: ' control (grid ' + ct.site[jj] + ')' });
        showTip(ev, fmtMY(tr.d[i]), rows);
      });
      s.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
      // mean density over months when both grids were trapped
      var tm = [], cm = [];
      tr.d.forEach(function (dd, i) { var jj = nearest(ct.d, dd); if (jj >= 0 && Math.abs(ct.d[jj] - dd) < 40) { tm.push(tr.v[i]); cm.push(ct.v[jj]); } });
      var mean = function (a) { return a.reduce(function (p, q) { return p + q; }, 0) / a.length; };
      if (tm.length) caption(box, 'Mean over ' + plural(tm.length, 'paired session') + ': treated ' + mean(tm).toFixed(0) + '/ha, control ' + mean(cm).toFixed(0) + '/ha.');
    });
  }

  // ---------- breeding calendar ----------
  function drawCal() {
    if (!STR) return;
    var B = STR.breeding, panels = $('gx-c-panels'); panels.replaceChildren();
    [[2, 'Females pregnant'], [1, 'Males in breeding condition']].forEach(function (q) {
      var sx = q[0], cells = B.cells[CS.sp + '|' + CS.hab + '|' + sx], col = SEXC[sx];
      var box = h('div', null, panels); h('p', 'gx-pair-title', box, q[1]);
      var el = h('div', null, box);
      var W = el.clientWidth, RH = 12, T = 2, L = M.l, R = M.r, B2 = 20 + XT, H = T + B.years.length * RH + B2;
      var cw = (W - L - R) / 12;
      var s = svg('svg', { width: W, height: H, class: 'gx-svg', role: 'img', 'aria-label': q[1] + ' by year and month' }, el);
      B.years.forEach(function (yr, yi) {
        var y0 = T + yi * RH;
        if (yr % 5 === 0) svg('text', { x: L - 6, y: y0 + 10, 'text-anchor': 'end' }, s).textContent = yr;
        cells[yi].forEach(function (v, m) {
          var x0 = L + m * cw;
          if (!v) return;
          var p = v[0] / v[1];
          var r = svg('rect', { x: x0 + 0.5, y: y0 + 0.5, width: cw - 1, height: RH - 1, fill: hexA(col, 0.1 + 0.9 * p) }, s);
          r.addEventListener('pointermove', function (ev) {
            showTip(ev, MON_LONG[m] + ' ' + yr, [{ color: col, value: pct(p), label: ' ' + q[1].toLowerCase().replace(/^(females|males) /, '') }],
              v[0] + ' of ' + v[1] + ' ' + SEX_PL[sx].toLowerCase());
          });
          r.addEventListener('pointerleave', hideTip);
        });
      });
      MON.forEach(function (mn, m) { svg('text', { x: L + (m + 0.5) * cw, y: H - B2 + 14, 'text-anchor': 'middle' }, s).textContent = W < 420 ? mn[0] : mn; });
      axisTitles(s, W, H, L, R, T, B2, 'Month', 'Year');
      var ramp = h('div', 'gx-ramp', box);
      ramp.appendChild(document.createTextNode('0%'));
      var bar = h('span', 'gx-ramp-bar', ramp); bar.style.background = 'linear-gradient(90deg,' + hexA(col, 0.1) + ',' + hexA(col, 1) + ')';
      ramp.appendChild(document.createTextNode('100% of ' + SEX_PL[sx].toLowerCase()));
    });
  }
  function bindStructure() {
    $('gx-r-sp').addEventListener('change', function (e) { RS.sp = e.target.value; drawTurn(); });
    $('gx-r-hab').addEventListener('change', function (e) { RS.hab = e.target.value; drawTurn(); });
    $('gx-c-sp').addEventListener('change', function (e) { CS.sp = e.target.value; drawCal(); });
    $('gx-c-hab').addEventListener('change', function (e) { CS.hab = e.target.value; drawCal(); });
  }

  // ---------- boot ----------
  var lastW = 0;
  function onResize() {
    var w = root.clientWidth;
    if (w === lastW) return;
    lastW = w;
    drawTimeline(); drawPulse(); drawMass(); drawSocial(); drawTraps(); drawExp(); drawCoverage(); drawTurn(); drawCal();
    if (S.data) drawSite();
  }

  function loadAux(name, done, retries) {
    fetch(BASE + name).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(done)
      .catch(function () { if (retries > 0) setTimeout(function () { loadAux(name, done, retries - 1); }, 1500); });
  }

  fetch(BASE + 'meta.json').then(function (r) { return r.json(); }).then(function (meta) {
    META = meta;
    drawStats(); siteMenu(); bindLife(); bindPlayer(); bindMass(); bindSocial(); bindStructure();
    $('gx-pulse-mode').addEventListener('change', function (e) { PULSE_MODE = e.target.value; drawPulse(); });
    lastW = root.clientWidth;
    drawTimeline(); drawPulse(); drawExp();
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(onResize, 150); });
    loadAux('mass.json', function (m) { MASS = m; drawMass(); }, 2);
    loadAux('social.json', function (m) { SOC = m; drawSocial(); }, 2);
    loadAux('traps.json', function (m) { TRAPS = m; drawTraps(); }, 2);
    loadAux('structure.json', function (m) { STR = m; drawCoverage(); drawTurn(); drawCal(); if (S.data) drawTurnover(); }, 2);
    return loadSite(3);
  }).catch(function (err) {
    var p = h('p', 'gx-note', null, 'Could not load the data (' + err.message + ').');
    root.insertBefore(p, root.firstChild);
  });
})();
