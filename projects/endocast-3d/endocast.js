/* Endocasts in 3D: specimen picker, specimen card, results table, downloads. */
(function () {
  'use strict';
  var root = document.getElementById('ec');
  if (!root) return;
  var base = root.dataset.base;

  // Caliper (cast), scan, and print values. Lengths in mm (means of three
  // repeats), volumes in cm3. Print/volume are null where not measured.
  var SPECIMENS = [
    { slug: 'taung-child', name: 'Taung Child', taxon: 'Australopithecus africanus',
      note: 'A juvenile from Taung, South Africa, the first australopith ever described (Dart, 1925). Its endocast is a natural one: sediment filled the braincase and turned to stone.',
      tris: 179230, mb: 4.5,
      L: [114.75, 114.89, 115.33], W: [59.83, 60.07, 60.08], H: [89.25, 88.79, 89.33],
      V: [285, 278.9, 280] },
    { slug: 'sts-60', name: 'STS 60', taxon: 'Australopithecus africanus',
      note: 'A natural endocast from Sterkfontein, South Africa.',
      tris: 182926, mb: 4.4,
      L: [108.55, 108.17, 107.90], W: [94.05, 93.17, 94.27], H: [62.33, 62.40, 62.58],
      V: [325, 320.2, 323] },
    { slug: 'la-quina-5', name: 'La Quina 5', taxon: 'Homo neanderthalensis',
      note: 'A Neanderthal from La Quina, France.',
      tris: 503782, mb: 12.5,
      L: [187.33, 189.44, null], W: [125.40, 128.92, null], H: [134.17, 134.04, null],
      V: [null, 1579.4, null] },
    { slug: 'jebel-irhoud-2', name: 'Jebel Irhoud 2', taxon: 'Homo sapiens',
      note: 'From Jebel Irhoud, Morocco, now counted among the earliest members of our own species.',
      tris: 520528, mb: 13.1,
      L: [171.20, 170.27, null], W: [141.60, 139.86, null], H: [114.00, 119.31, null],
      V: [null, 1033.4, null] },
    { slug: 'unknown-primate', name: 'Unknown primate', taxon: 'chimpanzee or macaque?', plain: true,
      note: 'An unlabelled cast in the collection. We believe it is a chimpanzee or a macaque, but it has not been identified. Scanned and printed alongside the hominins.',
      tris: 185884, mb: 4.5,
      L: [86.88, 86.96, 87.15], W: [72.40, 72.32, 72.03], H: [61.80, 61.04, 61.23],
      V: [178, 171.2, 174] }
  ];

  function pct(copy, cast) {
    if (copy == null || cast == null) return null;
    return (copy - cast) / cast * 100;
  }
  function fmtPct(v) {
    if (v == null) return '<span class="ec-na">&mdash;</span>';
    var s = (v > 0 ? '+' : v < 0 ? '&minus;' : '') + Math.abs(v).toFixed(1) + '%';
    var cls = Math.abs(v) >= 2 ? 'ec-warn' : '';
    return '<span class="' + cls + '">' + s + '</span>';
  }
  function taxon(s) { return s.plain ? s.taxon : '<i>' + s.taxon + '</i>'; }
  function num(v, d) { return v == null ? '&mdash;' : v.toFixed(d); }

  // ---- picker + viewer + card ------------------------------------------
  var picker = document.getElementById('ec-picker');
  var viewer = document.getElementById('ec-model');
  var card = document.getElementById('ec-card');

  function show(i) {
    var s = SPECIMENS[i];
    viewer.src = base + 'models/' + s.slug + '.glb';
    viewer.alt = '3D scan of the ' + s.name + ' endocast';
    Array.prototype.forEach.call(picker.children, function (b, j) {
      b.classList.toggle('active', j === i);
      b.setAttribute('aria-selected', j === i ? 'true' : 'false');
    });
    card.innerHTML =
      '<h3>' + s.name + '</h3>' +
      '<p class="ec-sub">' + taxon(s) + '</p>' +
      '<p>' + s.note + '</p>' +
      '<dl>' +
      '<dt>Length</dt><dd>' + num(s.L[1], 1) + ' mm</dd>' +
      '<dt>Width</dt><dd>' + num(s.W[1], 1) + ' mm</dd>' +
      '<dt>Height</dt><dd>' + num(s.H[1], 1) + ' mm</dd>' +
      '<dt>Volume</dt><dd>' + Math.round(s.V[1]).toLocaleString() + ' cm&sup3;</dd>' +
      '<dt>Full scan</dt><dd>' + s.tris.toLocaleString() + ' triangles</dd>' +
      '</dl>' +
      '<p class="ec-sub">Measured on the scan.</p>' +
      '<a class="ec-btn" href="' + base + 'downloads/' + s.slug + '_stl.zip" download>Download STL (' +
      s.mb.toFixed(1) + ' MB zip)</a>';
  }

  SPECIMENS.forEach(function (s, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ec-chip';
    b.setAttribute('role', 'tab');
    b.innerHTML = s.name + '<small' + (s.plain ? ' class="ec-plain"' : '') + '>' + s.taxon + '</small>';
    b.addEventListener('click', function () { show(i); });
    picker.appendChild(b);
  });
  show(0);

  // ---- results table -----------------------------------------------------
  var rows = [['L', 'Length'], ['W', 'Width'], ['H', 'Height'], ['V', 'Volume']];
  var h = '<thead><tr><th rowspan="2">Endocast</th>';
  rows.forEach(function (r) { h += '<th colspan="3" class="ec-group">' + r[1] + '</th>'; });
  h += '</tr><tr>';
  rows.forEach(function (r) {
    h += '<th>Cast</th><th>Scan</th><th>Print</th>';
  });
  h += '</tr></thead><tbody>';
  SPECIMENS.forEach(function (s) {
    h += '<tr><th scope="row">' + s.name + '</th>';
    rows.forEach(function (r) {
      var v = s[r[0]], unit = r[0] === 'V' ? 0 : 1;
      h += '<td class="ec-cast">' + num(v[0], unit) + '</td>' +
        '<td>' + fmtPct(pct(v[1], v[0])) + '</td>' +
        '<td>' + fmtPct(pct(v[2], v[0])) + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody>';
  document.getElementById('ec-table').innerHTML = h;

  // ---- downloads ----------------------------------------------------------
  var dl = document.getElementById('ec-dl');
  SPECIMENS.forEach(function (s) {
    var li = document.createElement('li');
    li.innerHTML = '<a href="' + base + 'downloads/' + s.slug + '_stl.zip" download>' + s.name +
      '</a> ' + taxon(s) + ' <span>' + s.tris.toLocaleString() + ' triangles · ' +
      s.mb.toFixed(1) + ' MB zip</span>';
    dl.appendChild(li);
  });
})();
