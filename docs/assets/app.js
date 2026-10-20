/* Cascadia Claim Integrity: review candidate interface.
   Reads the frozen synthetic snapshot bundle (data/bundle.json), the published cells (data/cells.json, keyed exactly as
   governance/published-measures.json), blocker lists and per-client record shards. It never recomputes a published
   number: every count on the page is a cell value or a record the engine wrote. Rates are computed only for display
   from the stored integers; a zero denominator reads "Not applicable". Interactive readouts supplement values labeled in place
   and every chart has its data table. */
(function () {
  'use strict';
  var S = { bundle: null, cells: null, blockers: null, shards: {}, extra: {}, st: null };
  var DEF = { view: 'a', client: 'ALL', period: 'FULL', pos: 'current_later', stage: 'encounter_submission', rec: '', story: '', field: '', basis: '' };
  var POS_LABEL = {
    known_then: 'Known then',
    restated_then: 'Restated then',
    current_later: 'Current later'
  };
  var POS_DESC = {
    known_then: 'T = K = 2026-07-14 23:59:59 UTC. What could be known at the original cutoff.',
    restated_then: 'T held at 2026-07-14 23:59:59 UTC; K advanced to 2026-07-21. Late evidence counts only if its business effect qualifies by T.',
    current_later: 'T = K = 2026-07-21 23:59:59 UTC. A deliberately later business position, not a correction of the earlier one.'
  };
  var STAGE_LABEL = { initial_preparation: 'Initial claim preparation', encounter_submission: 'Encounter submission', audit_submission: 'Audit submission (SYN-C02 only)' };
  var PERIOD_LABEL = { FULL: 'Full service period, 2026-04-01 to 2026-06-29', SP1: 'Subperiod 1, 2026-04-01 to 2026-04-30', SP2: 'Subperiod 2, 2026-05-01 to 2026-05-30', SP3: 'Subperiod 3, 2026-05-31 to 2026-06-29' };
  // Display aliases only. Cell keys, record identities, source files and exports retain their original codes.
  var CLIENT_NAMES = { 'SYN-C01': 'Cedar Harbor Health Plan', 'SYN-C02': 'Juniper Way Health Plan', 'SYN-C03': 'Alder Ridge Health Plan', 'SYN-C04': 'Willow Bay Health Plan', 'SYN-C05': 'Maple Vale Health Plan', 'SYN-C06': 'Cypress Grove Health Plan' };
  var CF_LABEL = Object.assign({ ALL: 'All six fictional health plans', 'P-A': 'Profile P-A · Cedar Harbor Health Plan / Juniper Way Health Plan', 'P-B': 'Profile P-B · Alder Ridge Health Plan / Willow Bay Health Plan', 'P-C': 'Profile P-C · Maple Vale Health Plan / Cypress Grove Health Plan' }, CLIENT_NAMES);
  var FIELD_LABEL = {
    vendor_payment_observation: 'Vendor-payment evidence', trip_verification_reference: 'Trip verification reference', subscriber_id: 'Subscriber reference',
    subscriber_relationship: 'Subscriber relationship', coverage_reference: 'Coverage reference', billing_party_reference: 'Billing party reference',
    transport_company_reference: 'Transport company reference', line_quantity: 'Supported line quantity', line_charge: 'Line charge (needs quantity)',
    service_start_at: 'Ride start time', service_end_at: 'Ride end time', service_date_utc: 'Service date', transport_category: 'Transport category',
    complete_explicit_service_line_allocation_membership: 'Complete line allocation', member_id: 'Member identity',
    '(grouped sibling not ready)': 'Grouped sibling not ready'
  };
  var M02_LABEL = {
    no_evidence: 'No usable outcome evidence', client_asserted_only: "Client's note only, not acceptance", rejected: 'A required component rejected',
    partial_required_components: 'Only some required components accepted', not_submitted: 'Not submitted by the horizon', unresolved: 'Evidence received, outcome unresolved',
    conflicted: 'Conflicting evidence', missing_claim: 'No claim constructed', voided: 'Coverage voided'
  };
  var BASIS_LABEL = { originating_structured: 'Originating structured response', forwarded_originating: 'Forwarded originating response',
    record_specific_client_assertion: 'Record-specific client assertion', aggregate_only_assertion: 'Aggregate-only note', no_usable_evidence: 'No usable evidence' };
  var SLOT_TYPES = ['supplier_cost', 'submitted_charge', 'allowed_amount', 'payer_paid', 'member_responsibility', 'member_collection', 'vendor_payment', 'refund_adjustment'];

  // ---------------------------------------------------------------- utilities
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(v) { return v === null || v === undefined ? 'Not available' : (typeof v === 'number' ? v.toLocaleString('en-US') : String(v)); }
  function pct(num, den) {
    // Display only; the stored cells are the integers. Never show 100.0% or 0.0% for a share that is not exactly whole or empty.
    if (!den) return 'Not applicable';
    var p = 100 * num / den;
    if (num > 0 && p < 0.1) return 'under 0.1%';
    if (num < den && p > 99.9) return 'over 99.9%';
    return p.toFixed(1) + '%';
  }
  // R1-13b finding 9: one hours format everywhere: one decimal place and "h".
  function hrs(v) { return v === null || v === undefined ? 'None' : (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h'; }
  function ts(v) { return v ? v.replace('T', ' ').replace('Z', ' UTC') : 'Not recorded'; }
  function cellKey(m, sub, pos, cf, per, stage) { return [m, sub, pos, cf, per, stage || '-'].join('|'); }
  function C(m, sub, o) {
    o = o || {}; var st = S.st;
    var k = cellKey(m, sub, o.pos || st.pos, o.client || st.client, o.period || st.period, o.stage);
    return Object.prototype.hasOwnProperty.call(S.cells, k) ? S.cells[k] : null;
  }
  function measureSupports(m, dim, value) { var mm = S.bundle.measures[m]; if (!mm) return false; var s = mm.supported; return s[dim].indexOf(value) >= 0; }
  function effPeriod(m) { return measureSupports(m, 'periods', S.st.period) ? S.st.period : 'FULL'; }
  function effClient(m) { return measureSupports(m, 'client_filters', S.st.client) ? S.st.client : 'ALL'; }
  function clientOf(id) { var m = /SYN-C0[1-6]/.exec(id || ''); return m ? m[0] : null; }
  // Positions listed in "a" have no value at all (for example a delivery submitted after T); they never inherit "b".
  function byPos(obj, pos) { if (!obj) return undefined; if (obj.a && obj.a.indexOf(pos) >= 0) return undefined; if (obj.d && Object.prototype.hasOwnProperty.call(obj.d, pos)) return obj.d[pos]; return obj.b; }
  function viewState() { var s = S.st; return CF_LABEL[s.client] || s.client; }
  function stripView(m) {
    var s = S.st, per = effPeriod(m), cf = effClient(m);
    // The position is already named, in words, by the strip's as-of segment.
    var bits = [(CF_LABEL[cf] || cf), per === 'FULL' ? 'full period' : lc(PERIOD_LABEL[per])];
    if (cf === 'ALL' && per === 'FULL') bits = ['unfiltered (all clients, full period)'];
    return bits.join(', ');
  }

  // ---------------------------------------------------------------- state and URL
  function parseHash() {
    var out = Object.assign({}, DEF);
    (location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf('='); var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)); var v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      if (Object.prototype.hasOwnProperty.call(DEF, k)) out[k] = v;
    });
    if (['a', 'b', 'c'].indexOf(out.view) < 0) out.view = 'a';
    if (S.bundle) {
      if (S.bundle.client_filters.indexOf(out.client) < 0) out.client = 'ALL';
      if (!S.bundle.periods[out.period]) out.period = 'FULL';
      if (!S.bundle.positions[out.pos]) out.pos = 'current_later';
      if (S.bundle.stages.indexOf(out.stage) < 0) out.stage = 'encounter_submission';
    }
    return out;
  }
  function hashOf(st) {
    return '#' + Object.keys(DEF).filter(function (k) { return st[k] && (st[k] !== DEF[k] || k === 'view'); })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(st[k]); }).join('&');
  }
  var pendingFocus = null;
  function go(patch) {
    var st = Object.assign({}, S.st, patch), h = hashOf(st);
    // Filter changes replace the current display while preserving its anchor and keyboard focus.
    var reading = S.st.view === 'a' && ['client', 'period', 'pos', 'stage'].some(function (key) { return Object.prototype.hasOwnProperty.call(patch, key); }) ? captureExplorerReading() : null;
    var active = document.activeElement;
    pendingFocus = active && active.id ? { id: active.id, x: window.scrollX, y: window.scrollY,
      drawerOpen: !!(document.querySelector('.filter-drawer') || {}).open,
      toolsOpen: !!(document.querySelector('.record-tools') || {}).open, reading: reading } : (reading ? { reading: reading, x: window.scrollX, y: window.scrollY } : null);
    if (h === location.hash) render(); else location.hash = h;
  }

  // ---------------------------------------------------------------- data loading
  function getJSON(path) { return fetch(path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); }); }
  function getOptional(path) { return fetch(path, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function getGz(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress the record shard (DecompressionStream unavailable).');
      return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
    });
  }
  function shard(client) {
    if (S.shards[client]) return Promise.resolve(S.shards[client]);
    return getGz('data/records/' + client + '.json.gz').then(function (d) { S.shards[client] = d; return d; });
  }

  // ---------------------------------------------------------------- exports
  function csvCell(v) { var s = v === null || v === undefined ? '' : (typeof Node !== 'undefined' && v instanceof Node ? (v.tagName === 'BUTTON' ? '' : v.textContent) : String(v)); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportManifest(tableId, rows, measures, filters, rowScopes) {
    var b = S.bundle, s = S.st, p = b.positions[s.pos];
    var m = { schema_version: 'cci-export-manifest-1', table: tableId, release: (S.extra.manifest || {}).release_id || null, build: b.snapshot.build,
      cells_sha256: b.snapshot.cells_sha256, rebuild_receipt_sha256: b.snapshot.rebuild_receipt_sha256, freezes: b.freezes || null,
      rule_version: b.snapshot.rule_version, population_version: b.snapshot.population_version, position: s.pos, T: p.T, K: p.K,
      filters: filters || { client: s.client, period: s.period, stage: s.stage }, row_count: rows.length, measure_ids: measures || [],
      note: 'Exported from the on-page table; totals equal the table shown. Synthetic data.' };
    if (rowScopes) { m.filters = { scope: 'mixed: see row_scopes' }; m.row_scopes = rowScopes; m.note = 'Rows have different scopes; each row names its exact registered cell keys. Synthetic data.'; }
    return m;
  }
  function exportButtons(tableId, header, rows, measures, filters, rowScopes) {
    var s = S.st;
    var base = 'cci-' + tableId + '-' + s.pos + '-' + (rowScopes ? 'mixed-scope' : (filters && filters.client ? filters.client : s.client) + '-' + (filters && filters.period ? filters.period : s.period));
    return el('div', { class: 'btn-row', style: 'margin-top:.6rem' }, [
      el('button', { class: 'btn', type: 'button', onclick: function () {
        var keep = header.map(function (h, i) { return !rows.length || !rows.every(function (r) { return r[i] instanceof Node && r[i].tagName === 'BUTTON'; }); });
        var pick = function (r) { return r.filter(function (v, i) { return keep[i]; }); };
        var lines = [pick(header).map(csvCell).join(',')].concat(rows.map(function (r) { return pick(r).map(csvCell).join(','); }));
        download(base + '.csv', lines.join('\n') + '\n', 'text/csv');
        download(base + '.manifest.json', JSON.stringify(exportManifest(tableId, rows, measures, filters, rowScopes), null, 1) + '\n', 'application/json');
      } }, ['Download CSV and manifest']),
      el('span', { class: 'small' }, [n(rows.length) + ' rows'])
    ]);
  }
  function table(opts) {
    // opts: {id, caption, header:[...], rows:[[...]], foot:[...], num:[colIdx], note, stack, wrapHead, measures, filters, maxRows}
    var shown = opts.maxRows && opts.rows.length > opts.maxRows ? opts.rows.slice(0, opts.maxRows) : opts.rows;
    var thead = el('thead', null, [el('tr', null, opts.header.map(function (h, i) { return el('th', { scope: 'col', class: (opts.num || []).indexOf(i) >= 0 ? 'num' : null }, [h]); }))]);
    function tr(r) {
      return el('tr', null, r.map(function (v, i) {
        var td = el('td', { class: (opts.num || []).indexOf(i) >= 0 ? 'num' : null, 'data-label': opts.header[i] });
        if (v instanceof Node) td.appendChild(v);
        else if (CLIENT_NAMES[v]) td.appendChild(el('span', { class: 'client-display', title: 'Fictional client; canonical reference ' + v }, [el('strong', null, [CLIENT_NAMES[v]]), el('span', { class: 'client-code' }, [v])]));
        else td.textContent = typeof v === 'number' ? v.toLocaleString('en-US') : (v === null || v === undefined ? '' : String(v));
        return td;
      }));
    }
    var tbody = el('tbody', null, shown.map(tr));
    var tfoot = opts.foot ? el('tfoot', null, [tr(opts.foot)]) : null;
    var cls = [opts.stack ? 'stack' : '', opts.wrapHead ? 'wrap-head' : '', opts.fit ? 'fit' : ''].join(' ').trim() || null;
    var t = el('table', { class: cls, id: opts.id ? 't-' + opts.id : null }, [el('caption', { class: 'visually-hidden' }, [opts.caption]), thead, tbody, tfoot]);
    var wrap = el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': opts.caption }, [t]);
    // R1-13 finding 4: a table wider than its container says so in place, not only through a scrollbar that may be hidden.
    var hint = el('p', { class: 'tbl-hint', hidden: true }, ['This table is wider than the page: scroll it sideways to see every column (' + opts.header.length + ' columns) →']);
    function fitCheck() {
      var over = wrap.scrollWidth > wrap.clientWidth + 1, tall = wrap.scrollHeight > wrap.clientHeight + 1;
      hint.hidden = !over && !tall;
      hint.textContent = (over ? 'Scroll sideways to see all ' + opts.header.length + ' columns. ' : '') + (tall ? 'Scroll inside this table; headers stay in view.' : '');
      wrap.classList.toggle('is-scrollable', over);
    }
    if (window.ResizeObserver) new ResizeObserver(fitCheck).observe(wrap);
    var kids = [el('p', { class: 'tcap', 'aria-hidden': 'true' }, [opts.caption]), hint, wrap];
    if (opts.maxRows && opts.rows.length > opts.maxRows) kids.push(el('p', { class: 'tbl-note' }, ['Showing ' + n(shown.length) + ' of ' + n(opts.rows.length) + ' rows. The download contains all ' + n(opts.rows.length) + '.']));
    if (opts.note) kids.push(el('p', { class: 'tbl-note' }, [opts.note]));
    if (opts.id) {
      var plain = opts.rows.concat(opts.foot ? [opts.foot] : []).map(function (r) { return r.map(function (v) { return v instanceof Node ? v.textContent : v; }); });
      kids.push(exportButtons(opts.id, opts.header, plain, opts.measures, opts.filters, opts.rowScopes));
    }
    return el('div', null, kids);
  }
  function lc(x) { return String(x).toLowerCase().replace(/\bsyn-c0(\d)\b/g, 'SYN-C0$1').replace(/\bp-([abc])\b/g, function (m, g) { return 'P-' + g.toUpperCase(); }); }
  function tag(text, kind) { return el('span', { class: 'tag ' + (kind || '') }, [text]); }
  // R1-13 finding 3: identifiers and hashes may break after a separator instead of one character per line.
  function brk(s) {
    var sp = el('span', { class: 'ident-wrap' });
    String(s === null || s === undefined ? '' : s).split(/(?<=[:|\-_.\/])/).forEach(function (part, i) { if (i) sp.appendChild(el('wbr')); sp.appendChild(document.createTextNode(part)); });
    return sp;
  }
  // R1-13 finding 14: prose names a position in words ("later date, as known then"), never by its key or control label.
  function posWords(p) { return PROV_POS[p] || p; }
  // The chronology (business attempts) is built once over the frozen horizon: the latest K of any position.
  function horizonK() { var P = S.bundle.positions; return Object.keys(P).map(function (k) { return P[k].K; }).sort().pop(); }
  function stateTag(s) {
    var ok = ['ready', 'accepted', 'constructed', 'satisfied_on_time', 'conforming', 'known', 'validly_bound', 'fully_due'];
    var bad = ['blocked', 'rejected', 'overdue', 'mismatch', 'conflicting', 'conflicted', 'satisfied_late', 'missing', 'unmatched', 'contradictory'];
    var kind = ok.indexOf(s) >= 0 ? 'ok' : (bad.indexOf(s) >= 0 ? 'bad' : (s === 'unknown' || s === 'unresolved' || s === 'unassessable' || s === 'no_usable_evidence' ? 'unk' : 'warn'));
    return tag(String(s === null || s === undefined ? 'none' : s).replace(/_/g, ' '), kind);
  }

  // ---------------------------------------------------------------- charts (Cascadia horizontal bars, direct labels, accessible readouts)
  function plotCount(value) {
    var scale = Math.abs(value) >= 1000 ? 1000 : 1;
    return Number((value / scale).toPrecision(3)).toLocaleString('en-US') + (scale === 1000 ? 'k' : '');
  }
  function hbar(opts) {
    // opts: {id, title, subtitle, rows:[{label, value, emph}], unit, annotation, summary, source, measure, maxValue}
    var rows = opts.rows.slice();
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([opts.maxValue || 0, 1]));
    // Drawn at the container's own width so text stays at 12 px; below 520 px each label sits above its bar.
    function draw(W) {
      var narrow = W < 520, valW = 64, barH = 22, gap = 10, top = 6, labH = narrow ? 18 : 0, noteH = 18;
      var longest = Math.max.apply(null, rows.map(function (r) { return r.label.length; }));
      var labW = narrow ? 0 : Math.min(Math.round(W * 0.45), Math.max(120, Math.ceil(longest * 6.8) + 16));
      // The mark note sits beside the emphasized bar's value (wide) or on its own line under that bar (narrow).
      // Its width is reserved out of the plot so it never overlaps a mark (K3).
      var noteW = opts.markNote && !narrow ? Math.ceil(opts.markNote.length * 6.6) + 14 : 0;
      var plotW = W - labW - valW - noteW - 12;
      var y = top, svg = [];
      rows.forEach(function (r, rowIndex) {
        var yb = y + labH, w = Math.max(r.value > 0 ? 2 : 0, plotW * r.value / max), x0 = narrow ? 0 : labW;
        var color = r.emph ? 'var(--evergreen)' : 'var(--rain)', cls = r.emph ? '' : 'lab-ctx';
        svg.push('<g class="chart-point" tabindex="0" role="button" data-row="' + rowIndex + '" aria-label="' + esc(r.label + ': ' + n(r.value) + (opts.measure === 'M02' ? ' completed legs' : ' units')) + '" aria-describedby="' + opts.id + '-tip">');
        if (narrow) svg.push('<text x="0" y="' + (yb - 5) + '" class="' + cls + '">' + esc(r.label) + '</text>');
        else {
          // A label longer than the reserved column wraps onto two lines at a word boundary, so it never leaves the SVG.
          var fit = Math.max(8, Math.floor((labW - 16) / 6.8)), lab = String(r.label);
          if (lab.length <= fit) svg.push('<text x="' + (labW - 8) + '" y="' + (yb + barH / 2 + 4) + '" text-anchor="end" class="' + cls + '">' + esc(lab) + '</text>');
          else {
            var cut = lab.lastIndexOf(' ', fit); if (cut < 1) cut = fit;
            svg.push('<text x="' + (labW - 8) + '" y="' + (yb + barH / 2 - 3) + '" text-anchor="end" class="' + cls + '"><tspan x="' + (labW - 8) + '">' + esc(lab.slice(0, cut).trim()) +
              '</tspan><tspan x="' + (labW - 8) + '" dy="13">' + esc(lab.slice(cut).trim()) + '</tspan></text>');
          }
        }
        svg.push('<rect x="' + x0 + '" y="' + yb + '" width="' + w.toFixed(1) + '" height="' + barH + '" fill="' + color + '"></rect>');
        if (narrow) svg.push('<line x1="0.5" x2="0.5" y1="' + (yb - 1) + '" y2="' + (yb + barH + 1) + '" stroke="var(--slate)" stroke-width="1"></line>');
        var vx = x0 + w + 6, vtxt = r.display || plotCount(r.value);
        svg.push('<text x="' + vx.toFixed(1) + '" y="' + (yb + barH / 2 + 4) + '" class="' + cls + '" font-weight="' + (r.emph ? 600 : 400) + '">' + esc(vtxt) + '</text>');
        y = yb + barH + gap;
        if (r.emph && opts.markNote) {
          if (narrow) {
            var words = opts.markNote.split(' '), lines = [''], maxCh = Math.floor(W / 7);
            words.forEach(function (wd) { var cur = lines[lines.length - 1]; if (cur && (cur + ' ' + wd).length > maxCh) lines.push(wd); else lines[lines.length - 1] = cur ? cur + ' ' + wd : wd; });
            lines.forEach(function (ln) { svg.push('<text x="0" y="' + (y + 4) + '" class="ann" style="fill:var(--evergreen)">' + esc(ln) + '</text>'); y += noteH; });
            y += 12;
          }
          else svg.push('<text x="' + (vx + vtxt.length * 7.2 + 10).toFixed(1) + '" y="' + (yb + barH / 2 + 4) + '" class="ann" style="fill:var(--evergreen)">' + esc(opts.markNote) + '</text>');
        }
        svg.push('<rect class="point-hit" x="0" y="' + (yb - labH) + '" width="' + W + '" height="' + (barH + labH + gap) + '" fill="transparent"></rect></g>');
      });
      var H = y + 4;
      if (!narrow) svg.push('<line x1="' + labW + '" x2="' + labW + '" y1="' + (top - 2) + '" y2="' + (H - 4) + '" stroke="var(--slate)" stroke-width="1"></line>');
      svg.unshift('<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-labelledby="' + opts.id + '-t ' + opts.id + '-s" focusable="false">');
      svg.push('</svg>');
      return svg.join('');
    }
    var fig = el('figure', { class: 'chart', id: 'chart-' + opts.id, 'data-chart-id': opts.id }, [
      // R1-13 finding 23: a shorter title at narrow widths (CSS swaps them; the full title stays the accessible name).
      opts.shortTitle ? el('p', { class: 'ctitle', id: opts.id + '-t' }, [el('span', { class: 't-long' }, [opts.title]), el('span', { class: 't-short' }, [opts.shortTitle])])
        : el('p', { class: 'ctitle', id: opts.id + '-t' }, [opts.title]),
      el('p', { class: 'csub' }, [opts.subtitle])
    ]);
    var holder = el('div', { class: 'chart-host', html: draw(720) });
    var lastW = 720;
    function fit() { var w = Math.floor(holder.clientWidth); if (w > 0 && w !== lastW) { lastW = w; holder.innerHTML = draw(w); } }
    if (window.ResizeObserver) new ResizeObserver(fit).observe(holder);
    fig.appendChild(holder);
    attachChartReadout(holder, fig, rows, opts);
    if (opts.note) fig.appendChild(el('p', { class: 'summary' }, [opts.note]));
    fig.appendChild(el('p', { class: 'summary', id: opts.id + '-s' }, [opts.summary]));
    fig.appendChild(el('div', { class: 'prov', 'data-segments': '4' }, [opts.source + ' · as of ' + S.bundle.positions[S.st.pos].K.slice(0, 10) + ' (' + PROV_POS[S.st.pos] + ') · ' + opts.flags + ' · ' + stripView(opts.measure)]));
    return fig;
  }
  // Readouts are capability-gated, never width-gated. Exact labels and tables stay visible.
  function attachChartReadout(holder, fig, rows, opts) {
    var tip = el('div', { class: 'chart-tooltip', role: 'tooltip', id: opts.id + '-tip', hidden: true });
    fig.appendChild(tip);
    var pinned = null, focusDismissed = false;
    function point(e) { return e.target.closest ? e.target.closest('.chart-point') : null; }
    function hide() { tip.hidden = true; pinned = null; }
    tip.dismissReadout = function () { focusDismissed = true;hide(); };
    function fine() { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
    function show(target, x, y) {
      var r = rows[Number(target.getAttribute('data-row'))];
      tip.textContent = '';
      tip.appendChild(el('strong', null, [r.label]));
      tip.appendChild(el('span', null, [n(r.value) + (opts.measure === 'M02' ? ' completed legs' : ' units')]));
      tip.appendChild(el('span', { class: 'tip-scope' }, [(CF_LABEL[S.st.client] || S.st.client) + ' · ' + posWords(S.st.pos) + ' · ' + lc(PERIOD_LABEL[S.st.period])]));
      tip.hidden = false;
      var bounds = holder.getBoundingClientRect(), vv = window.visualViewport;
      var vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
      var top = vv ? vv.offsetTop : 0, left = vv ? vv.offsetLeft : 0;
      var minX = Math.max(left + 8, bounds.left), maxX = Math.min(left + vw - 8, bounds.right);
      tip.style.maxWidth = Math.max(100, maxX - minX) + 'px';
      var box = tip.getBoundingClientRect();
      var tx = Math.min(Math.max(minX, x - box.width / 2), maxX - box.width);
      var ty = y - box.height - 14;
      if (ty < top + 8) ty = y + 16;
      ty = Math.max(top + 8, Math.min(ty, top + vh - box.height - 8));
      tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
    }
    function refreshFocused() {
      var target = holder.contains(document.activeElement) && point({ target: document.activeElement });
      if (!target || focusDismissed) return false;
      var bounds = target.getBoundingClientRect();show(target, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);return true;
    }
    tip.refreshForFocus = refreshFocused;
    holder.addEventListener('pointermove', function (e) { var p = point(e); if (fine() && !pinned && p) show(p, e.clientX, e.clientY); });
    holder.addEventListener('pointerleave', function () { if (!pinned && !refreshFocused()) hide(); });
    holder.addEventListener('click', function (e) { var p = point(e); if (!p) return; if (pinned === p) { focusDismissed = true;hide(); return; } focusDismissed = false;pinned = p; show(p, e.clientX, e.clientY); });
    holder.addEventListener('focusin', function (e) { var p = point(e); if (!p) return; focusDismissed = false;var b = p.getBoundingClientRect(); show(p, b.left + b.width / 2, b.top + b.height / 2); });
    holder.addEventListener('focusout', hide);
    holder.addEventListener('keydown', function (e) { var p = point(e); if (e.key === 'Escape') { focusDismissed = true;hide(); } else if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); focusDismissed = false;var b = p.getBoundingClientRect(); pinned = p; show(p, b.left + b.width / 2, b.top + b.height / 2); } });
    // Figure-scoped handlers avoid accumulating global listeners on every filter change.
    fig.addEventListener('pointerdown', function (e) { if (!holder.contains(e.target)) { focusDismissed = true;hide(); } });
  }
  var SOURCE = 'Synthetic Cascadia claims build, frozen inputs v1';
  var FIELD_NOTE = { vendor_payment_observation: 'Vendor-payment evidence is a sourced record of what the transport vendor was paid for the trip (a recorded payment of $0 counts). Clients SYN-C05 and SYN-C06 need it before encounter submission; while it is unknown, only that submission is held. The model expects a typed amount, service link, source reference and effective/received times. A payment-ledger entry could supply those fields; a bank transfer alone would still need a service allocation. This is a model example, not a real client documentation policy.' };
  var PROV_POS = { known_then: 'earlier date, as known then', restated_then: 'earlier date, restated with later knowledge', current_later: 'later date, as known then' };

  function dismissReadouts(e) {
    document.querySelectorAll('.chart-tooltip:not([hidden])').forEach(function (tip) {
      if (!e || !e.target.closest || !e.target.closest('.chart-host')) tip.dismissReadout();
    });
  }
  document.addEventListener('pointerdown', dismissReadouts);
  window.addEventListener('scroll', function () {
    document.querySelectorAll('.chart-tooltip').forEach(function (tip) { if (!tip.refreshForFocus || !tip.refreshForFocus()) tip.dismissReadout(); });
  }, { passive: true });
  window.addEventListener('resize', function () { dismissReadouts(); }, { passive: true });
  // ---------------------------------------------------------------- render shell
  function render() {
    S.st = parseHash();
    if (S.st.view === 'b' && !S.st.rec) {
      history.replaceState(null, '', hashOf(Object.assign({}, S.st, { rec: 'SYN-C01:S000001', story: 'DEMO01', pos: 'known_then' })));
      S.st = parseHash();
    }
    document.querySelectorAll('#view-nav a').forEach(function (a) { if (a.getAttribute('data-view') === S.st.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var app = $('#app'); app.setAttribute('aria-busy', 'true');
    app.className = 'container-x view-' + S.st.view;
    // Keep the original no-JavaScript notice intact; move its node after each view's hero.
    var note = document.querySelector('.synthetic-band');
    if (note) document.querySelector('main').insertBefore(note, app);
    app.innerHTML = '';
    try {
      if (S.st.view === 'a') renderA(app); else if (S.st.view === 'b') renderB(app); else renderC(app);
    } catch (e) { app.appendChild(el('p', { class: 'notice' }, ['This view failed to render: ' + e.message])); if (window.console) console.error(e); }
    installSummaryCard(app);
    var hero = app.querySelector('.hero');
    if (note && hero) {
      note.textContent = '';
      note.appendChild(el('div', { class: 'container-x' }, [el('strong', null, ['Synthetic demonstration. ']), 'Project records, people and client health plans are synthetic. Real organizations appear only as industry examples. Designed rates are not real-world prevalence.']));
      var copy = hero.querySelector('.hero-copy');
      if (copy) copy.insertBefore(note, copy.querySelector('.hero-actions'));
      else hero.insertAdjacentElement('afterend', note);
    }
    app.setAttribute('aria-busy', 'false');
    var head = document.querySelector('.site-head');
    document.documentElement.style.setProperty('--head-height', head.offsetHeight + 'px');
    var focus = pendingFocus; pendingFocus = null;
    if (focus) {
      var drawer = document.querySelector('.filter-drawer'), tools = document.querySelector('.record-tools');
      if (drawer && focus.drawerOpen) drawer.open = true;
      if (tools && focus.toolsOpen) tools.open = true;
      var target = document.getElementById(focus.id);
      if (target) target.focus({ preventScroll: true });
      window.scrollTo({ left: focus.x, top: focus.y, behavior: 'instant' });
      if (focus.reading) restoreExplorerReading(focus.reading);
    }
    var section = new URLSearchParams(location.hash.slice(1)).get('section');
    if (S.st.view === 'c' && ['methods-h', 'future-h'].indexOf(section) >= 0) {
      var destination = document.getElementById(section);
      if (destination) {
        if (destination.tagName === 'DETAILS') destination.open = true;
        requestAnimationFrame(function () { destination.scrollIntoView({ block: 'start', behavior: 'instant' }); });
      }
    }
  }

  function installSummaryCard(app) {
    var hero = app.querySelector('.hero'), guide = hero && hero.querySelector('aside');
    if (!guide) return;
    guide.className = 'intro-context';
    if (S.st.view === 'a' && window.CCI_READER_CONTEXT) {
      var shared = el('div', { html: window.CCI_READER_CONTEXT.service });
      var preferredService = shared.firstElementChild;
    }
    var full = S.bundle.populations.current_later;
    var facts = [['Status', 'Frozen synthetic snapshot'], ['Health plans', n(S.bundle.clients.length) + ' fictional clients'], ['Completed rides', n(full.C + full.C_unresolved)], ['Snapshot as of', 'July 21, 2026']];
    var card = el('aside', { class: 'hero-guide summary-card', 'aria-labelledby': 'summary-card-title' }, [
      el('div', { class: 'summary-card-head' }, [el('h2', { id: 'summary-card-title' }, ['Claim Integrity']), el('span', { class: 'summary-dot', 'aria-hidden': 'true' })]),
      el('p', null, ['Claims readiness and downstream encounter reporting.']),
      el('a', { class: 'btn btn-dark disc-link', href: 'case-study.html' }, ['Read the case study', el('span', { class: 'link-disc', 'aria-hidden': 'true' }, ['↗'])]),
      el('dl', { class: 'summary-facts' }, facts.map(function (f) { return el('div', null, [el('dt', null, [f[0]]), el('dd', null, [f[1]])]); })),
      el('p', { class: 'summary-scope' }, ['Full synthetic scenario · fixed scope'])
    ]);
    hero.replaceChild(card, guide); hero.insertAdjacentElement('afterend', typeof preferredService !== 'undefined' ? preferredService : guide);
  }

  function headerBlock(app, eyebrow, titleHtml, lede) {
    app.appendChild(el('section', { class: 'hero' }, [
      el('p', { class: 'eyebrow' }, [eyebrow]),
      el('h1', { html: titleHtml }),
      el('p', { class: 'lede', style: 'margin-top:1rem' }, [lede])
    ]));
  }

  function identityChips() {
    var b = S.bundle.snapshot;
    return el('div', { class: 'ident' }, [
      el('span', { class: 'chip' }, ['Snapshot ' + b.build]),
      el('span', { class: 'chip' }, ['Rule ' + b.rule_version]),
      el('span', { class: 'chip' }, ['Population ' + b.population_version]),
      el('span', { class: 'chip' }, ['Cells ' + b.cells_sha256.slice(0, 12)]),
      el('span', { class: 'chip' }, ['Code ' + (b.code_revision || '').slice(0, 10)])
    ]);
  }

  function healthStrip() {
    var h = S.extra.health;
    var kids = [el('strong', null, ['Run health'])];
    if (h && h.route_text) {
      // Derived from the operating receipts by the builder (RR-01): route decision, drills and timer runs are separate facts.
      kids.push(el('span', null, [h.route_text]));
      if (h.drill_text) kids.push(el('span', null, [h.drill_text]));
      kids.push(el('span', null, [h.timer_text]));
      kids.push(el('span', null, ['Status: ' + String(h.surface_status).replace(/_/g, ' ') + (h.genuine_runs ? '; evidence expires ' + ts(h.expires_at) + '.' : '. This page does not claim fresh certification.')]));
    } else if (!h || !h.genuine_runs) {
      kids.push(el('span', null, ['No operating receipts are in this bundle; no scheduled run is evidenced.']));
      kids.push(el('span', null, ['Snapshot built locally ' + ts(S.bundle.snapshot.rebuild_finished_at) + '; rebuild ' + S.bundle.snapshot.rebuild_status + '.']));
      kids.push(el('span', null, ['Status: ' + (h && h.served_status ? h.served_status : 'unknown') + '. This page does not claim fresh certification.']));
    } else {
      kids.push(el('span', null, ['Last successful run ' + ts(h.last_success) + '; latest attempt ' + h.latest_outcome + '.']));
      kids.push(el('span', null, ['Evidence expires ' + ts(h.expires_at) + '.']));
    }
    return el('div', { class: 'health', role: 'status' }, kids);
  }

  // ---------------------------------------------------------------- View A
  function renderA(app) {
    headerBlock(app, 'Healthcare analytics / What needs attention', '<span class="muted">Cascadia</span> Claim <span class="serif">Integrity</span><span class="stop">.</span>',
      'From ride evidence to encounter outcomes. Trace each claim from its supporting facts through preparation, correction and downstream reporting.');
    var hero = app.querySelector('.hero');
    hero.classList.add('hero-split');
    var intro = el('div', { class: 'hero-copy' });
    while (hero.firstChild) intro.appendChild(hero.firstChild);
    intro.querySelector('.lede').textContent = 'The ride is complete. Missing billing information can still delay payment, while a missing response can leave reporting unresolved. Find what needs attention before the next step.';
    intro.appendChild(el('ul', { class: 'readiness-points' }, [
      el('li', null, [el('strong', null, ['Find the gap: ']), 'see which required fact or response is missing.']),
      el('li', null, [el('strong', null, ['Choose the follow-up: ']), 'obtain support, correct the record or request the recipient’s response.'])
    ]));
    intro.appendChild(el('div', { class: 'btn-row hero-actions' }, [
      el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { document.querySelector('.explore-workspace').scrollIntoView({ block: 'start' }); } }, ['Explore the snapshot ↓']),
      el('a', { class: 'btn', href: '#view=c' }, ['Understand the data'])
    ]));
    hero.appendChild(intro);
    hero.appendChild(el('aside', { class: 'hero-guide', 'aria-label': 'Start with a claim' }, [
      el('p', { class: 'eyebrow' }, ['Picture the service']),
      el('h2', null, ['A ride to a medical appointment.']),
      el('ol', { class: 'hero-prompts' }, [
        el('li', null, ['A patient needs help reaching a scheduled medical appointment.']),
        el('li', null, ['A covered benefit arranges an appropriate ride, such as an authorized Uber or Lyft trip.']),
        el('li', null, ['The patient arrives. The billing and reporting records still need support.'])
      ]),
      el('p', { class: 'illustration-note' }, ['Illustrative example, not a record in the dataset.']),
      el('a', { class: 'btn btn-dark', href: '#view=b&pos=known_then&rec=SYN-C01%3AS000001&story=DEMO01' }, ['Inspect a model claim ↗'])
    ]));
    app.appendChild(el('details', { class: 'fold readiness-terms' }, [el('summary', null, ['New to claims and encounters? Three terms explained']), businessTerms()]));
    app.appendChild(readinessContext());
    var workspace = el('div', { class: 'explore-workspace' });
    workspace.appendChild(controls());
    var results = el('div', { class: 'explore-results', id: 'explore-results', 'aria-labelledby': 'primary' });
    results.appendChild(el('p', { class: 'eyebrow' }, ['Your selected scope']));
    results.appendChild(el('h2', { id: 'primary' }, ['What can move forward?']));
    results.appendChild(el('p', { class: 'selected-scope', role: 'status' }, [scopeWords()]));
    results.appendChild(el('p', { class: 'small' }, ['Read these as three different questions, not steps in a funnel. Each card keeps its own required population. A reporting unit is one service component for one recipient and purpose, not one ride or one claim.']));
    results.appendChild(el('div', { class: 'grid-3' }, [cardM14(), cardM15(), cardM16()]));
    results.appendChild(blockerSection());
    results.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['What do the cutoffs and counting units mean?']), el('p', { class: 'small' }, [POS_DESC[S.st.pos]]), termsLine()]));
    results.appendChild(downstreamSection());
    results.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['Compare partner routes and outcome visibility']), routesSection()]));
    results.appendChild(financialSection());
    results.appendChild(residualSection());
    workspace.appendChild(results); app.appendChild(workspace);
    app.appendChild(el('details', { class: 'fold reference-snapshot' }, [el('summary', null, ['Reference only: the full, unfiltered snapshot']), overview()]));
    app.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['Explore more worked examples']), storyIndex()]));
    app.appendChild(recommendations());
    app.appendChild(el('section', { class: 'run-section', 'aria-labelledby': 'run-h' }, [
      el('p', { class: 'eyebrow' }, ['Execution record']),
      el('h2', { id: 'run-h' }, ['Run health and release context']),
      el('p', { class: 'small' }, ['This module is a frozen synthetic snapshot with no live data edge. Schedules were removed under the owner acceptance of 2026-10-19; a successful scheduled-run receipt is not required. The historical run status below is retained, including its original timestamps. Acceptance does not turn it into a pass.']),
      el('p', { class: 'small' }, ['All 98 applicable known-answer variants pass; all 22,173 numerical cells match, and 20 browser checks pass. Scheduling is N/A. Evaluator custody is an accepted limitation, and public readback is a publication step.']),
      el('a', { class: 'btn', href: '#view=c' }, ['Read completed checks and remaining limits ↗']),
      el('details', { class: 'fold' }, [el('summary', null, ['Historical operating receipts (outside this build scope)']), healthStrip()])
    ]));
    finishReadinessCopy(app);
    readinessBusinessPass(app);
    guidedReadinessPass(app);
  }

  function readinessContext() {
    function item(label, text) { return el('li', null, [el('strong', null, [label + ': ']), text]); }
    return el('details', { class: 'fold readiness-context' }, [el('summary', null, ['Why do complete rides leave incomplete records?']),
      el('ul', { class: 'readiness-points' }, [
        item('Different jobs', 'The ride company records the trip; the health plan holds benefit information; a broker or billing team connects the facts to a claim.'),
        item('Different rules', 'State, plan and contract requirements vary. A trip receipt alone may not contain everything needed for a particular use.'),
        item('Different handoffs', 'References, payment observations and recipient responses can arrive separately or through an intermediary.')
      ]),
      el('p', { class: 'small' }, ['Non-emergency medical transportation helps eligible people reach care when they need transportation assistance. Some organizations already connect these records; this model focuses on situations where the complete supported record is unavailable.']),
      el('ul', { class: 'readiness-points' }, [
        item('Payment stakes', 'Required documentation supports reimbursement. A completed ride alone does not establish a payable claim.'),
        item('Coverage', 'This model illustrates Medicaid and Medicare Advantage transportation benefits. Required facts depend on the applicable plan and contract.'),
        item('Client names', 'Cedar Harbor Health Plan, Juniper Way Health Plan, Alder Ridge Health Plan, Willow Bay Health Plan, Maple Vale Health Plan and Cypress Grove Health Plan are fictional health-plan client accounts in this model. A client health plan engages the broker to manage transportation for its members. Original codes remain in record references and exports.')
      ]),
      el('a', { href: 'case-study.html#decision' }, ['Read the payment and coverage context, with sources ↗'])
    ]);
  }

  function finishReadinessCopy(app) {
    var meanings = { M14: 'Expected claim-preparation work stays visible, even when a claim is missing.', M15: 'A record can be ready for one use and still blocked for another.', M16: 'Confirmed outcomes include supported acceptances and rejections.' };
    ['M14', 'M15', 'M16'].forEach(function (id) {
      var card = app.querySelector('[aria-labelledby="c-' + id + '"]'), pop = card.querySelector('.pop');
      card.insertBefore(el('p', { class: 'card-meaning small' }, [meanings[id]]), card.querySelector('dl'));
      var rules = el('details', { class: 'card-counting' }, [el('summary', null, ['Counting rules']), pop]);
      card.insertBefore(rules, card.querySelector('.more'));
    });
    var down = app.querySelector('[aria-labelledby="down-h"]');
    down.querySelector('h2').textContent = 'What came back after submission?';
    var population = down.querySelector(':scope > p');
    down.insertBefore(el('p', { class: 'small' }, ['A ready claim can still be rejected, or its outcome can remain unconfirmed. These measures describe evidence coverage; designed routes and scenario choices affect the rates. They do not measure real-world client performance.']), population);
    down.insertBefore(el('details', { class: 'fold' }, [el('summary', null, ['Which records does each result count?']), population]), down.querySelector('.grid-3'));
    var titles = { M01: 'Rides accepted at every required destination', M03: 'Families accepted on their first submission', M05: 'Responses that have not arrived on time' };
    Object.keys(titles).forEach(function (id) { var title = down.querySelector('#c-' + id); if (title) title.textContent = titles[id]; });
    var context = app.querySelector('.blocker-context');
    if (context) {
      var paragraphs = Array.from(context.querySelectorAll(':scope > p'));
      var original = paragraphs.shift();
      var payment = original.textContent.indexOf('Vendor-payment evidence') === 0;
      context.insertBefore(el('ul', { class: 'readiness-points' }, payment ? [
        el('li', null, [el('strong', null, ['Missing: ']), 'evidence of what the transport vendor was paid.']),
        el('li', null, [el('strong', null, ['Next action: ']), 'check the payment record and its connection to the service.']),
        el('li', null, [el('strong', null, ['Interpretation: ']), 'unknown payment does not establish that the vendor is unpaid.'])
      ] : [el('li', null, [el('strong', null, ['Next action: ']), 'obtain source support for the required fact before treating this use as ready.'])]), original);
      var details = el('details', { class: 'fold' }, [el('summary', null, ['Required evidence and counting detail']), original]);
      paragraphs.forEach(function (node) { details.appendChild(node); }); context.appendChild(details);
      if (payment) context.insertBefore(el('p', { class: 'readiness-boundary small' }, ['This is a synthetic encounter-submission rule, not a universal Medicare or Medicaid payment requirement.']), details);
    }
    app.querySelectorAll('.recommendation-card').forEach(function (card) {
      var paragraphs = Array.from(card.querySelectorAll(':scope > p.small'));
      var method = el('details', { class: 'card-method' }, [el('summary', null, ['How to test this question'])]);
      paragraphs.forEach(function (node) { method.appendChild(node); }); card.appendChild(method);
    });
    var run = app.querySelector('.run-section'), record = el('details', { class: 'fold' }, [el('summary', null, ['Recorded checks, scope and historical receipts'])]);
    Array.from(run.children).filter(function (node) { return node.tagName !== 'H2' && !node.classList.contains('eyebrow'); }).forEach(function (node) { record.appendChild(node); });
    run.appendChild(el('p', { class: 'small' }, ['Frozen synthetic data, with no live feed. Test records retain their reviewed revisions and accepted limitations.']));
    run.appendChild(el('a', { href: 'evidence/summary-card-checks-2026-10-19.json' }, ['Current readability and interaction checks ↗']));
    run.appendChild(record);
    // Break up plain explanatory text. Chart copy, table cells, source clauses and exports are retained as written.
    Array.from(app.querySelectorAll('p')).forEach(function (p) {
      if (p.children.length || p.closest('.chart, .prov, .table-wrap')) return;
      var text = p.textContent, words = text.trim().split(/\s+/);
      if (words.length <= 45) return;
      var sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
      if (sentences.length < 2) return;
      var list = el('ul', { class: 'readiness-points ' + p.className }, sentences.map(function (s) { return el('li', null, [s]); }));
      if (p.id) list.id = p.id; p.replaceWith(list);
    });
  }


  // View A business explanations read the existing cells. No new analytical measure is calculated.
  function readinessBusinessPass(app) {
    var s = S.st, stage = s.stage;
    function p(text, cls) { return el('p', { class: cls || 'small' }, [text]); }
    function labeled(label, text, cls) { return el('p', { class: cls || 'reader-example' }, [el('strong', null, [label + ': ']), text]); }
    var hero = app.querySelector('.hero-copy');
    hero.parentElement.classList.add('opening-variant');
    hero.parentElement.setAttribute('data-opening', '2');
    hero.querySelector('.eyebrow').textContent = 'Cascadia Claim Integrity / What needs attention';
    hero.querySelector('h1').innerHTML = 'Find the missing fact.<br>Choose the <em>next action.</em>';
    hero.querySelector('.lede').textContent = 'The ride is complete. What needs attention before the record can move forward? Separate missing claim facts from missing reporting decisions, then follow the evidence to the right next step.';
    var points = hero.querySelector('.readiness-points');
    points.replaceChildren();
    [['Before submission', 'find the fact holding the record back.'], ['After submission', 'distinguish a rejection from a response that never came back.']].forEach(function (point) {
      points.appendChild(el('li', null, [el('strong', null, [point[0] + ': ']), point[1]]));
    });
    var guide = app.querySelector('.hero > aside');
    guide.textContent = '';
    guide.appendChild(el('p', { class: 'eyebrow' }, ['The business problem']));
    guide.appendChild(el('h2', null, ['A completed ride is not a complete claim.']));
    guide.appendChild(el('ol', { class: 'business-route', 'aria-label': 'How the report connects the service to billing and reporting' }, [
      ['1', 'Ride record', 'The ride company records the trip and its cost.'],
      ['2', 'Supported claim', 'NEMT connects ride facts, plan records and billing evidence.'],
      ['3', 'Encounter report', 'Service facts go to the health plan or reporting recipient.']
    ].map(function (x) { return el('li', null, [el('span', { class: 'route-number', 'aria-hidden': 'true' }, [x[0]]), el('strong', null, [x[1]]), p(x[2])]); })));
    guide.appendChild(el('a', { href: 'case-study.html#players' }, ['See who pays, who rides and where the records come from ↗']));
    var results = app.querySelector('.explore-results');
    results.querySelector('#primary').textContent = 'What needs attention in this selection?';
    var scope = results.querySelector('.selected-scope');
    scope.insertAdjacentElement('afterend', p({
      known_then: 'July 14, using only evidence available at that earlier cutoff. A later correction cannot make this earlier record ready.',
      restated_then: 'July 14 business position, examined with later-received evidence. A claim version first available July 16 still cannot be sent on July 14.',
      current_later: 'July 21 business position and evidence available by July 21. This is the later snapshot, not a live feed.'
    }[s.pos], 'snapshot-reading'));
    var early = results.querySelector(':scope > p.small');
    early.textContent = 'Read the cards as three questions: was the claim built, is it ready for this use, and did a supported decision come back? The use selector changes readiness and blockers; construction and outcome evidence still cover all applicable destinations.';
    var cardText = {
      M14: ['Has the claim been built?', 'One ride may need a base-service component and a mileage component. Each destination creates its own required units.', 'Find required components with no claim or an incomplete link. A built claim can still lack a fact needed to send it.'],
      M15: ['Can it move forward for this use?', stage === 'encounter_submission' ? 'For Maple Vale and Cypress Grove, the model requires vendor-payment evidence before encounter reporting. Other uses can have different requirements.' : stage === 'audit_submission' ? 'Juniper Way has a separate audit destination. Only its audit-purpose units belong in this stage.' : 'Initial preparation asks whether the supported claim can be prepared. It does not mean every later reporting requirement is satisfied.', 'Obtain the required fact or resolve the conflict, then check the same target again. Ready does not mean accepted or paid.'],
      M16: ['Did a supported decision come back?', 'A rejection with a supported source decision counts as known outcome evidence. A client note alone does not.', 'Follow up on absent source decisions separately from confirmed rejections. Do not assume that a missing response means rejection.']
    };
    Object.keys(cardText).forEach(function (id) {
      var card = app.querySelector('[aria-labelledby="c-' + id + '"]'), text = cardText[id];
      card.querySelector('.mtitle').textContent = text[0];
      card.querySelector('.card-meaning').textContent = text[1];
      card.insertBefore(labeled('Next decision', text[2], 'reader-action'), card.querySelector('.card-counting'));
      if (id === 'M15') card.querySelector('.frac').insertAdjacentElement('afterend', p('Selected use: ' + STAGE_LABEL[stage], 'reader-use'));
      var detail = card.querySelector('dl'), fold = card.querySelector('.card-counting');
      fold.querySelector('summary').textContent = 'Status breakdown and counting rules';
      fold.insertBefore(detail, fold.querySelector('.pop'));
      card.querySelector('.more').textContent = 'Definition and recorded checks ↗';
    });
    var enc = C('M15', 'denominator', { stage: 'encounter_submission' }), audit = C('M15', 'denominator', { stage: 'audit_submission' });
    var total = C('M14', 'denominator'), reporting = C('M16', 'required_units'), selected = C('M15', 'denominator', { stage: stage });
    var bridge = el('aside', { class: 'reader-denominators', 'aria-labelledby': 'reader-denom-h' }, [
      el('h3', { id: 'reader-denom-h' }, ['Why do the counts differ?']),
      el('div', { class: 'reader-count-bridge' }, [
        el('span', null, [el('strong', null, [n(enc)]), ' encounter units']),
        el('b', { 'aria-hidden': 'true' }, ['+']), el('span', null, [el('strong', null, [n(audit)]), ' audit units']),
        el('b', { 'aria-hidden': 'true' }, ['=']), el('span', null, [el('strong', null, [n(total)]), ' preparation units'])
      ]),
      p(audit > 0 ? 'Juniper Way Health Plan has an additional audit destination. The audit units are separate reporting obligations for the same rides, not missing rides or dropped records.' : 'No audit-purpose units apply to this client or group in the selected period. The encounter and preparation totals therefore match in this selection.'),
      p('The readiness card counts ' + n(selected) + ' units for ' + lc(STAGE_LABEL[stage]) + '. The construction card counts ' + n(total) + ' required preparation units; outcome evidence counts ' + n(reporting) + ' required reporting units. These answer different questions, not steps in a shrinking funnel.'),
      el('details', { class: 'fold' }, [el('summary', null, ['What is one unit?']), p('A ride with a base-service component and a mileage component contributes two units per destination. If the same ride also requires an audit report, that adds two audit units. Miles are a quantity on the mileage component, not the count of units. This illustrates the model’s counting rule.')])
    ]);
    // Emit the additive bridge only when the independently stored stage counts reconcile.
    if (enc !== null && audit !== null && enc + audit === total) results.querySelector(':scope > .grid-3').insertAdjacentElement('afterend', bridge);
    var blocker = app.querySelector('[aria-labelledby="blk-h"]'), focus = blocker.querySelector('.blocker-focus');
    blocker.querySelector('h2').textContent = 'Which missing fact is holding work?';
    blocker.insertBefore(labeled('Use this section', 'Start with the largest missing-fact group, inspect the affected records, then obtain the specific evidence. Categories can overlap, so their counts must not be added together.', 'reader-section-intro'), blocker.children[1] || null);
    if (focus) {
      var pay = focus.querySelector('h3').textContent === FIELD_LABEL.vendor_payment_observation;
      var field = Object.keys(FIELD_LABEL).filter(function (key) { return FIELD_LABEL[key] === focus.querySelector('h3').textContent; })[0];
      var examples = {
        billing_party_reference: 'A billing-party reference supplies the identifier for the party billing the service. It is not a ride receipt or proof of payment.',
        trip_verification_reference: 'A trip-verification record supports that the service took place. A driver accepting the ride assignment is not evidence that the trip was completed.',
        subscriber_id: 'A subscriber reference identifies the insurance policyholder. The patient’s member identifier cannot silently replace it.',
        subscriber_relationship: 'A supported relationship record distinguishes the patient from the policyholder. Do not assume the patient is the subscriber.',
        member_id: 'The member record must identify the patient for this service. Similar-looking identifiers from different health plans cannot be joined by their suffix.',
        coverage_reference: 'A coverage reference connects this service to the applicable plan record. The ride receipt does not establish coverage.',
        transport_company_reference: 'The transport-company reference identifies the company that performed the trip. It cannot automatically stand in for the billing party.',
        line_quantity: 'A mileage component needs a supported distance. A blank ride-distance field remains unknown rather than becoming zero miles.',
        line_charge: 'The component charge follows the supported quantity and the synthetic price rule. The ride supplier’s cost is a different amount.',
        complete_explicit_service_line_allocation_membership: 'Each required service component needs an explicit link to the correct claim line. A claim header alone does not establish those links.',
        '(grouped sibling not ready)': 'A grouped submission can be held by another required component. Inspect that component rather than treating this record in isolation.'
      };
      var explanation = el('div', { class: 'reader-evidence-example' }, [el('p', { class: 'eyebrow' }, [pay ? 'What would clear this evidence gap?' : 'What would support the missing fact?']),
        el('h3', null, [pay ? 'A payment record linked to the ride.' : 'A source record linked to this service.']),
        el('ol', { class: 'evidence-route' }, (pay ? [
          ['NEMT payment records', 'Obtain the entry showing how much the ride company was paid.'],
          ['Match the service', 'Keep the trip identifier, payment date, source reference and when the record arrived.'],
          ['Recheck this use', 'Reassess readiness under the same target rules. Other missing facts can still block it.']
        ] : [
          ['Find the source', 'Obtain the required member, billing, trip or other supporting reference.'],
          ['Check the link', 'Confirm the record belongs to this client, service and date.'],
          ['Recheck this use', 'Retain the earlier state and assess the supported version for this target.']
        ]).map(function (x) { return el('li', null, [el('strong', null, [x[0]]), p(x[1])]); })),
        labeled('Illustrative example', pay ? 'A ledger row says SAMPLE-TRIP was paid $18 to the ride company on July 8. A bank-transfer total covering many trips still needs a supported split by service. The example is not a new record in this frozen data; unknown payment is not proof of nonpayment.' : (examples[field] || 'Use the source record that supports the displayed missing fact for this service and date. A plausible value or a different record cannot substitute for that evidence.')),
        p('Illustrative follow-up, not a newly received record or completed outreach. The applicable evidence requirement is a synthetic model rule, not a universal Medicare or Medicaid payment rule.')]);
      focus.insertAdjacentElement('afterend', explanation);
    }
    var downstream = app.querySelector('[aria-labelledby="down-h"]');
    downstream.querySelector('h2').textContent = 'What happened after the records were sent?';
    var outcomeText = {
      M01: ['A whole ride counts only when every required component and destination has supported acceptance.', 'Inspect the missing component or destination before treating the ride as fully covered. This is evidenced acceptance, not a real-world success rate.'],
      M03: ['A family is a submitted claim grouping. Its first attempt can contain several service components or rides.', 'Use confirmed rejections to investigate the first submission. Missing responses belong to a different follow-up queue.'],
      M05: ['This counts promised response receipts, not paid claims. A reply can arrive on time and still say rejected or unresolved.', 'Chase overdue return evidence through the applicable route; a received response still needs its business outcome checked.']
    };
    Object.keys(outcomeText).forEach(function (id) {
      var card = downstream.querySelector('[aria-labelledby="c-' + id + '"]');
      card.insertBefore(labeled('What it counts', outcomeText[id][0], 'reader-example'), card.querySelector('dl'));
      card.insertBefore(labeled('Next decision', outcomeText[id][1], 'reader-action'), card.querySelector('dl'));
      var fold = el('details', { class: 'card-counting' }, [el('summary', null, ['Breakdown and exact population']), card.querySelector('dl'), card.querySelector('.pop')]);
      card.insertBefore(fold, card.querySelector('.more'));
    });
    var chart = downstream.querySelector('figure');
    if (chart) explainCoverageChart(downstream, chart);
    var workExample = el('section', { class: 'reader-worked-example', id: 'worked-action-example', 'data-explore-section': 'One record', 'aria-labelledby': 'reader-example-h' }, [
      el('p', { class: 'eyebrow' }, ['One record / Same distinction as the case study']), el('h2', { id: 'reader-example-h' }, ['A missing identifier and a rejection need different actions.']),
      el('span', { class: 'chip' }, ['Fixed scope · not changed by filters']),
      p('Follow one completed ride for Cedar Harbor Health Plan, record SYN-C01:S000001. Its base service and mileage need supported claim facts and a final reporting decision. The four states below call for four different actions.', 'worked-action-intro'),
      el('ol', { class: 'worked-actions' }, [
        { date: 'July 14 · blocked', title: 'Request the missing identifier',
          facts: ['The ride is complete, but claim version 1 has no supported billing-party identifier.', 'Both base service and mileage are blocked. A trip receipt cannot supply the billing identity.'],
          actions: ['Obtain the reference identifying the organization billing this service.', 'Confirm that the reference belongs to this health plan and ride before using it.'],
          why: 'The task is to complete the evidence needed to prepare the claim. There is no submission to investigate yet.' },
        { date: 'July 16 · corrected version available', title: 'Recheck the supported claim',
          facts: ['Version 2 becomes available at 12:00 UTC, with the supported billing reference.', 'Its model identifier is SYN-C01:BILLING. The claim is now ready for encounter submission.'],
          actions: ['Check the corrected version against its source evidence and all required facts.', 'Retain version 1 as the earlier record. The July 16 correction cannot make the July 14 claim ready.'],
          why: 'A newly supported fact changes readiness from its own availability. It does not rewrite what was known or sendable earlier.' },
        { date: 'July 16 · version 2 submitted', title: 'Send the exact version and track the decision',
          facts: ['The recorded submission uses version 2 and contains both base service and mileage.', 'Delivery and syntax acknowledgments arrive that day. They establish receipt and format handling, not final acceptance.'],
          actions: ['Keep the link between the submitted content, claim version and both required components.', 'Track the final recipient decision separately from those acknowledgments.'],
          why: 'Readiness answers whether the record can be sent. A successful handoff still needs a supported business outcome.' },
        { date: 'July 18 · rejection received', title: 'Request the rejection reason',
          facts: ['Base: rejected', 'Mileage: rejected', 'The originating final decision is received on July 18, effective July 17. No rejection reason is supplied.'],
          actions: ['Match the rejection to the sent version and its components.', 'Request the reason before deciding what to correct. Keep the rejection as the known outcome while the explanation is missing.'],
          why: 'The billing-reference gap is resolved. The next task is to explain the recipient’s rejection, rather than assume that the original missing field caused it.' }
      ].map(function (x, i) {
        return el('li', { class: 'worked-action-step', 'data-action-step': String(i + 1) }, [
          el('header', { class: 'worked-action-heading' }, [el('span', { class: 'worked-action-number', 'aria-hidden': 'true' }, [String(i + 1)]), el('div', null, [p(x.date, 'worked-action-date'), el('h3', null, [x.title])])]),
          el('div', { class: 'worked-action-columns' }, [
            el('div', { class: 'worked-recorded' }, [el('h4', null, ['What the record shows']), el('ul', null, x.facts.map(function (text) { return el('li', null, [text]); }))]),
            el('div', { class: 'worked-next-action' }, [el('h4', null, ['Action this state calls for']), el('ul', null, x.actions.map(function (text) { return el('li', null, [text]); }))])
          ]),
          el('p', { class: 'worked-action-why' }, [el('strong', null, ['Why this action: ']), x.why])
        ]);
      })),
      el('div', { class: 'worked-action-limit' }, [el('strong', null, ['Recorded states, suggested actions. ']), 'The dates, claim versions, submission and rejection come from the frozen synthetic record. The requests and follow-up steps are recommendations, not recorded outreach. No later explanation, successful resubmission or payment is established.']),
      el('div', { class: 'btn-row' }, [
        el('a', { class: 'btn', href: '#view=b&pos=known_then&rec=SYN-C01%3AS000001&story=DEMO01' }, ['Inspect the July 14 snapshot ↗']),
        el('a', { class: 'btn', href: '#view=b&pos=current_later&rec=SYN-C01%3AS000001&story=DEMO01' }, ['Inspect the later record and responses ↗'])
      ])
    ]);
    downstream.insertAdjacentElement('afterend', workExample);
    var folds = Array.from(results.querySelectorAll(':scope > details'));
    folds.forEach(function (fold) {
      var summary = fold.querySelector('summary'), text = summary.textContent;
      if (text.indexOf('Compare partner routes') === 0) {
        summary.textContent = 'Why can some health plans confirm outcomes while others cannot?';
        fold.insertBefore(labeled('Business distinction', 'An originating or supported forwarded decision can confirm an outcome. A client’s note can describe an assertion without proving the recipient’s decision. The synthetic routes are design choices, not a ranking of real clients.'), summary.nextSibling);
      } else if (text.indexOf('Typed financial') === 0) {
        summary.textContent = 'What do the cost, charge and payment amounts mean?';
        fold.insertBefore(labeled('Example', 'The ride company’s charge, the amount billed on a claim and the amount actually paid to the vendor are different records. A missing payment observation cannot be replaced with the ride cost or assumed to be $0.'), summary.nextSibling);
      } else if (text.indexOf('Accepted-payload') === 0) {
        summary.textContent = 'Could a record be accepted and still contain an error?';
        fold.insertBefore(labeled('Example', 'If a ride’s supported distance is copied incorrectly into the claim, correct construction. If the claim is right but the sent fields differ, correct submission mapping. Receiver acceptance does not replace either comparison.'), summary.nextSibling);
      }
    });
    var why = [
      ['Investment decision', 'If later payment evidence releases many holds, improving that data handoff may be more useful than repeatedly rebuilding supported claims.'],
      ['Partner decision', 'Separate missing response feeds from actual rejections so the right team and recipient receive the follow-up.'],
      ['Planning decision', 'Observed missing-field rates and timing are needed before ranking integrations or estimating staffing and savings.'],
      ['Work allocation', 'Deadline, dependency and effort can change which queue deserves attention first; queue size alone is not enough.'],
      ['Change control', 'A corrected claim must preserve which earlier version and components were accepted, so replacements do not hide or duplicate work.'],
      ['Future evaluation', 'An independently controlled evaluation could test whether new errors are detected before relying on those controls in a broader operating setting.']
    ];
    app.querySelectorAll('.recommendation-card').forEach(function (card, i) { card.insertBefore(labeled(why[i][0], why[i][1], 'reader-why'), card.querySelector('.experiment-question')); });
    var recommendations = app.querySelector('.recommendations'), cards = recommendations.querySelector('.recommendation-grid');
    var advanced = el('details', { class: 'fold' }, [el('summary', null, ['Further version-control and evaluation questions'])]), extra = el('div', { class: 'recommendation-grid' });
    Array.from(cards.children).slice(4).forEach(function (card) { extra.appendChild(card); }); advanced.appendChild(extra); cards.insertAdjacentElement('afterend', advanced);
    var run = app.querySelector('.run-section');
    run.querySelector('h2').textContent = 'How this frozen report is supported';
    run.querySelector(':scope > p.small').textContent = 'The underlying measure values were separately recalculated. Detailed fixture, browser and review records sit behind the business report, with their original scope and limitations.';
    run.querySelector(':scope > a').href = 'evidence/publication-preparation-2026-10-20.json';
    run.querySelector(':scope > a').textContent = 'Current presentation checks ↗';
    var newDrill = s.field && s.field !== readinessBusinessPass.lastField;
    readinessBusinessPass.lastField = s.field;
    if (newDrill) requestAnimationFrame(function () {
      var affected = document.getElementById('affected');
      if (affected) { affected.setAttribute('tabindex', '-1'); affected.focus({ preventScroll: true }); affected.scrollIntoView({ block: 'start', behavior: 'instant' }); }
    });
  }


  function explainCoverageChart(section, chart) {
    function p(text, cls) { return el('p', { class: cls || '' }, [text]); }
    var rules = {
      conflicted: ['B', 'Any required component has conflicting outcome evidence.', 'Base: incompatible decisions. Mileage: accepted.', 'Resolve the conflicting evidence before treating the ride’s outcome as settled.'],
      missing_claim: ['C', 'Any required component lacks claim construction.', 'Base + mileage: no constructed claim; neither sent.', 'Missing construction takes the ride before “not submitted,” so it is counted only once.'],
      not_submitted: ['D', 'Any required component has not been submitted by the selected business date.', 'Base: sent and accepted. Mileage: built but not sent.', 'The unsent component takes precedence over the accepted component.'],
      voided: ['E', 'All required components are accepted or voided, with at least one voided.', 'Base: acceptance voided. Mileage: acceptance still valid.', 'Prior acceptance no longer covers everything required. Voids are illustrated here; none occurs in the v1 bulk data.'],
      rejected: ['F', 'Any required component has a source-supported rejection.', 'Base: accepted. Mileage: rejected by the recipient.', 'Use rule 5 rather than rule 6: a confirmed rejection is more specific than “some accepted.”'],
      partial_required_components: ['G', 'Some required components are accepted, none is rejected, and no earlier rule applies.', 'Base: accepted. Mileage: sent, with no final decision.', 'There is supported acceptance for only part of the required work.'],
      client_asserted_only: ['H', 'A record-specific client assertion is the only outcome basis for at least one component, and no earlier rule applies.', 'Base + mileage: client says accepted; no source decision.', 'A client’s note is evidence of an assertion, not the recipient’s acceptance.'],
      no_evidence: ['I', 'Every required component has no usable outcome evidence, and no earlier rule applies.', 'Base + mileage: sent; no usable final-outcome evidence.', 'No source decision, individual assertion or other usable outcome context establishes what happened.'],
      unresolved: ['J', 'None of rules 1–8 fits; the outcome remains unresolved.', 'Base + mileage: only an aggregate batch note, not a decision for this ride.', 'Some context exists, but it cannot establish this ride’s required decisions. This is the remaining category.']
    };
    var clause = (((S.bundle.register || {}).measures || {}).M02 || {}).clauses || {};
    var order = [];
    (String(clause.Population || '').match(/`([a-z_]+)`/g) || []).forEach(function (v) { var k = v.replace(/`/g, ''); if (rules[k] && order.indexOf(k) < 0) order.push(k); });
    if (order.length !== 9) return;
    var flow = '<svg viewBox="0 0 1080 290" class="coverage-flow-wide" role="img" aria-label="A completed ride needs supported acceptance for every required component and destination. Ride A qualifies and is outside the uncovered chart. Rides B through J do not qualify and each takes its first matching rule.">' +
      '<defs><marker id="coverage-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#236b61"/></marker></defs>' +
      '<g fill="none" stroke="#236b61" stroke-width="2" marker-end="url(#coverage-flow-arrow)"><path d="M270 140H345"/><path d="M595 140H675V65H755"/><path d="M470 225V255H735V217H755"/></g>' +
      '<rect x="10" y="80" width="260" height="120" rx="16" fill="#e7f0ef" stroke="#75a8a0"/>' +
      '<text x="30" y="112" class="flow-strong">One completed ride</text><text x="30" y="143">Base service + mileage</text><text x="30" y="167">Both required in this example</text>' +
      '<path d="M470 55L595 140L470 225L345 140Z" fill="#153f3b"/>' +
      '<text x="470" y="119" text-anchor="middle" fill="white" class="flow-strong">Supported current</text><text x="470" y="143" text-anchor="middle" fill="white">acceptance for</text><text x="470" y="167" text-anchor="middle" fill="white">everything required?</text>' +
      '<text x="685" y="52" class="flow-strong">Yes</text><text x="490" y="246" class="flow-strong">No</text>' +
      '<rect x="765" y="15" width="300" height="100" rx="16" fill="#d8ed8d" stroke="#94af55"/>' +
      '<text x="785" y="44" class="flow-strong">Ride A · Covered</text><text x="785" y="70">Base accepted + mileage accepted</text><text x="785" y="94">Outside the uncovered chart</text>' +
      '<rect x="765" y="165" width="300" height="105" rx="16" fill="#fff4dc" stroke="#cfa65c"/>' +
      '<text x="785" y="195" class="flow-strong">Rides B–J · Uncovered</text><text x="785" y="222">Walk the nine rules below</text><text x="785" y="247">Stop at the first match for each ride</text></svg>';
    var guide = el('section', { class: 'reader-chart-guide', id: 'reading-chart', 'aria-labelledby': 'reading-chart-h' }, [
      el('p', { class: 'eyebrow' }, ['Reading the chart']), el('h3', { id: 'reading-chart-h' }, ['One completed ride. One explanation.']),
      el('ul', { class: 'coverage-start' }, [
        el('li', null, [el('strong', null, ['A leg is one completed one-way ride. ']), 'The outbound and completed replacement return in the earlier round-trip example are two legs. Its cancelled return request is not a completed leg.']),
        el('li', null, [el('strong', null, ['“Uncovered” means acceptance is not fully supported. ']), 'It does not mean the ride was unpaid, rejected or necessarily billed incorrectly.'])
      ]),
      p('Separate worked example: rides A–J each have base service and mileage required at one reporting destination. Every ride in this illustration is named below; none is an added record or a sample from the frozen data.', 'coverage-illustration-note'),
      el('figure', { class: 'coverage-flow' }, [el('div', { html: flow }),
        el('ol', { class: 'coverage-flow-narrow' }, [
          el('li', null, [el('strong', null, ['One completed ride']), p('Check every required component and reporting destination.')]),
          el('li', null, [el('strong', null, ['Supported current acceptance for everything?']), p('A receipt or a client’s acceptance note cannot substitute for a supported final decision.')]),
          el('li', { class: 'coverage-covered' }, [el('strong', null, ['Yes: Ride A is covered']), p('Base accepted + mileage accepted. Keep this ride outside the uncovered chart.')]),
          el('li', { class: 'coverage-uncovered' }, [el('strong', null, ['No: classify rides B–J below']), p('For each ride, walk rules 1–9 and stop at its first match.')])
        ])]),
      el('div', { class: 'coverage-rule-key' }, [el('h4', null, ['Why this order?']), el('ul', null, [
        el('li', null, ['A ride can satisfy more than one description. This fixed model order assigns it once, rather than counting it in several bars.']),
        el('li', null, ['For Ride C, no claim also means nothing was sent: rule 2 wins over rule 3. For Ride F, a rejection wins over partial acceptance: rule 5 wins over rule 6.']),
        el('li', null, ['These are classification positions, not a payment regulation, urgency ranking or claim about which problem is most common.'])
      ])]),
      el('div', { class: 'coverage-rule-groups' }, [
        ['Claim and submission', order.slice(0,3)], ['Current decisions', order.slice(3,6)], ['Strength of outcome evidence', order.slice(6,9)]
      ].map(function (group, g) {
        return el('section', { class: 'coverage-rule-group' }, [el('h4', null, [group[0]]), el('ol', { start: g * 3 + 1 }, group[1].map(function (key) {
          var row = rules[key], number = order.indexOf(key) + 1;
          return el('li', { 'data-coverage-rule': key, 'data-rule-order': number }, [
            el('div', { class: 'coverage-rule-heading' }, [el('span', { class: 'coverage-rule-number', 'aria-hidden': 'true' }, [String(number)]), el('h5', null, [M02_LABEL[key]])]),
            el('div', { class: 'coverage-example', 'data-example-ride': row[0] }, [el('strong', null, ['Ride ' + row[0]])].concat(row[2].split(/\. (?=Mileage:)/).map(function (text) { return p(text.replace(/\.$/, '')); }))),
            el('details', { class: 'coverage-rule-detail' }, [el('summary', null, ['Rule and reason']), p(row[1], 'coverage-rule-condition'), p(row[3], 'coverage-rule-why')])
          ]);
        }))]);
      })),
      p('In the frozen model, a health plan can require more than one destination, including Juniper Way’s audit destination. That adds requirements to the same ride, not extra legs. Reportability must be established first; unresolved applicability is kept outside this chart’s population.', 'coverage-scope-note')
    ]);
    chart.insertAdjacentElement('beforebegin', guide);
    chart.querySelector('.csub').textContent = 'Bars rank the ' + n(C('M02', 'uncovered')) + ' uncovered completed rides by count. Reason numbers follow the fixed rule sequence above. Readouts, the table and exports give exact counts; bar labels use three significant figures.';
    var t = section.querySelector('#t-m02');
    if (t) {
      var wrapper = t.closest('.table-wrap').parentElement;
      wrapper.insertBefore(el('div', { class: 'coverage-table-key' }, [el('h3', null, ['Why do the rule numbers jump in this table?']), el('ul', null, [
        el('li', null, ['Rows follow the chart’s size ranking. “First-applicable order” is the fixed rule position used to assign each ride.']),
        el('li', null, ['“8 of 9” means check 8, used only if checks 1–7 did not apply. It is not a score, a count of tests passed or eighth place by size.']),
        el('li', null, ['Zero-count reasons stay in the table, even though they have no bar. Open “Assignment rule” in any row for its condition.'])
      ])]), wrapper.firstChild);
      t.querySelectorAll('tbody tr').forEach(function (tr) {
        var rank = parseInt(tr.cells[1].textContent, 10), key = order[rank-1];
        if (!key) return;
        tr.cells[1].appendChild(el('details', { class: 'coverage-assignment' }, [el('summary', null, ['Assignment rule']), p(rules[key][1]), p(rank === 1 ? 'This is the first check.' : 'Earlier checks 1–' + (rank-1) + ' must not apply.'), p(rules[key][3])]));
      });
    }
  }

  function readerClientLabel(client) {
    return { 'P-A': 'Profile A · One ride per claim', 'P-B': 'Profile B · Grouped rides per claim', 'P-C': 'Profile C · Completed + cancelled' }[client] || CF_LABEL[client] || client;
  }

  function captureExplorerReading() {
    var app = document.querySelector('.view-a'), nav = document.getElementById('reader-section-nav');
    if (!app) return null;
    var saved = {
      open: Array.from(app.querySelectorAll('details[open][data-reader-detail]')).map(function (n) { return n.getAttribute('data-reader-detail'); }),
      tables: Array.from(app.querySelectorAll('.table-wrap')).map(function (n) { var t = n.querySelector('table'); return { id: t && t.id, x: n.scrollLeft, y: n.scrollTop }; })
    };
    var navBox = nav && nav.getBoundingClientRect(), head = document.querySelector('.site-head');
    var line = navBox && navBox.top < innerHeight && navBox.bottom > 0 ? navBox.bottom + 12 : Math.max(0, head.getBoundingClientRect().bottom) + 12;
    var sections = Array.from(app.querySelectorAll('[data-explore-section]'));
    var section = sections.filter(function (node) { var r = node.getBoundingClientRect(); return r.top <= line + 30 && r.bottom > line; }).pop();
    var anchors = Array.from((section || app).querySelectorAll('[data-reader-anchor]')).filter(function (n) { return n.getClientRects().length; });
    var near = anchors.filter(function (n) { return n.getBoundingClientRect().top >= line - 70; })[0];
    if (!near && section) near = section;
    if (near) { saved.section = section && section.id; saved.anchor = near.getAttribute('data-reader-anchor'); saved.offset = near.getBoundingClientRect().top; }
    return saved;
  }

  function restoreExplorerReading(saved) {
    document.querySelectorAll('.view-a details[data-reader-detail]').forEach(function (n) { n.open = saved.open.indexOf(n.getAttribute('data-reader-detail')) >= 0; });
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      (saved.tables || []).forEach(function (v) { var t = v.id && document.getElementById(v.id); if (t) { var w = t.closest('.table-wrap'); w.scrollLeft = v.x; w.scrollTop = v.y; } });
      var section = saved.section && document.getElementById(saved.section);
      var anchor = saved.anchor && Array.from(document.querySelectorAll('.view-a [data-reader-anchor]')).filter(function (n) { return n.getAttribute('data-reader-anchor') === saved.anchor; })[0];
      anchor = anchor || section;
      if (anchor && typeof saved.offset === 'number') window.scrollBy({ top: anchor.getBoundingClientRect().top - saved.offset, left: 0, behavior: 'instant' });
    }); });
  }

  function installDisclosureScopes(app) {
    var counts = {};
    app.querySelectorAll('details:not(.filter-drawer)').forEach(function (d) {
      var summary = d.querySelector(':scope > summary'), title = summary.textContent.trim();
      summary.setAttribute('data-reader-title', title);
      var section = d.closest('[data-explore-section]'), card = d.closest('.mcard'), row = d.closest('tr'), table = d.closest('table');
      var parent = d.parentElement.closest('details[data-reader-detail]'), base = d.id || ((parent ? parent.getAttribute('data-reader-detail') : section ? section.id : 'view-a') + '|' + title);
      if (card) base += '|' + card.getAttribute('aria-labelledby');
      if (row && table) {
        var rowKey = table.id === 't-m02' ? row.cells[1].firstChild.textContent : row.cells[0].firstChild.textContent;
        base += '|' + table.id + '|' + rowKey.trim();
      }
      if (d.closest('.recommendation-card')) base += '|' + d.closest('.recommendation-card').querySelector('h3').textContent;
      counts[base] = (counts[base] || 0) + 1;
      var key = base + '|' + counts[base]; d.setAttribute('data-reader-detail', key);
      summary.setAttribute('data-reader-anchor', 'disclosure|' + key);
      var kind = 'fixed', label = 'Fixed scope', note = 'Fixed explanation or reference. Changing the filters does not change this content.';
      function filtered(text) { kind = 'filtered'; label = 'Follows filters'; note = text; }
      function partial(text) { kind = 'partial'; label = 'Some filters apply'; note = text; }
      if (d.matches('.filter-help')) filtered('The Current selection summary follows all four filters. The instructions and date explanation stay fixed.');
      else if (d.id === 'explore-routes') partial('Service dates and snapshot update the evidence counts. All six health plans remain listed; the health-plan and readiness-use filters do not narrow this table.');
      else if (d.id === 'explore-money') filtered('Amounts and financial states follow health plan, service dates and snapshot. The readiness-use filter does not apply.');
      else if (d.id === 'explore-correctness') partial('Health plan and snapshot apply throughout. The claim-source comparison follows service dates; the first-submission measures retain their full cohort. Readiness use does not apply.');
      else if (card) {
        var id = card.getAttribute('aria-labelledby');
        if (id === 'c-M15') filtered('Counts follow health plan, service dates, snapshot and readiness use.');
        else if (id === 'c-M03' || id === 'c-M05') partial('Health plan and snapshot apply. The full first-submission cohort is retained; service dates and readiness use do not apply.');
        else filtered('Counts follow health plan, service dates and snapshot. Readiness use does not apply.');
      } else if (title === 'Required evidence and counting detail') filtered('The missing-fact context follows health plan, service dates, snapshot and readiness use.');
      else if (title === 'What do the cutoffs and counting units mean?') partial('The cutoff description follows the snapshot selection. Definitions of counting units stay fixed.');
      if (title === 'What is this fact?' || title === 'Rule and reason' || title === 'Assignment rule') {
        kind = 'fixed'; label = 'Fixed scope'; note = 'This definition stays fixed. The surrounding counts and which rows appear can change with the filters.';
      }
      d.setAttribute('data-filter-scope', kind);
      summary.appendChild(el('span', { class: 'disclosure-scope scope-' + kind, title: note }, [label]));
      summary.insertAdjacentElement('afterend', el('p', { class: 'disclosure-scope-note small' }, [note]));
    });
    var anchors = {};
    app.querySelectorAll('h2,h3,.tcap').forEach(function (n) {
      if (n.hasAttribute('data-reader-anchor')) return;
      var detail = n.closest('details[data-reader-detail]'), base = n.id || (detail ? detail.getAttribute('data-reader-detail') + '|' : 'view-a|') + n.textContent;
      anchors[base] = (anchors[base] || 0) + 1; n.setAttribute('data-reader-anchor', base + '|' + anchors[base]);
    });
  }

  function profileJourney() {
    function family(label, items, cancelled) {
      return el('div', { class: 'journey-family' + (cancelled ? ' cancellation-family' : '') }, [
        el('strong', null, [label]),
        el('div', { class: 'journey-members' }, items.map(function (x) { return el('span', { class: 'ride-token token-' + x[0] }, [x[1]]); })),
        el('small', null, ['Corrections stay in this family'])
      ]);
    }
    return el('figure', { class: 'profile-journey', 'aria-labelledby': 'profile-journey-h' }, [
      el('p', { class: 'eyebrow' }, ['One patient / Same day / Three rule sets']),
      el('h3', { id: 'profile-journey-h' }, ['One round trip. How many claim families?']),
      el('ol', { class: 'journey-events' }, [
        el('li', { class: 'event-outbound' }, [el('span', { class: 'ride-token token-outbound' }, ['A · Completed']), el('strong', null, ['Outbound ride']), el('span', null, ['Home → medical appointment'])]),
        el('li', { class: 'event-cancelled' }, [el('span', { class: 'ride-token token-cancelled' }, ['B · Cancelled']), el('strong', null, ['Original return request']), el('span', null, ['Cancellation reason and time recorded'])]),
        el('li', { class: 'event-return' }, [el('span', { class: 'ride-token token-return' }, ['C · Completed']), el('strong', null, ['Replacement return ride']), el('span', null, ['Rebooked: appointment → home'])])
      ]),
      el('div', { class: 'journey-rule-arrow', 'aria-hidden': 'true' }, ['↓ Apply the contract rules ↓']),
      el('div', { class: 'journey-results' }, [
        el('section', { 'aria-label': 'Profile A illustration' }, [el('h4', null, ['Profile A']), el('p', { class: 'family-total' }, ['2 claim families']),
          family('Family 1', [['outbound', 'A · Outbound']]), family('Family 2', [['return', 'C · Return']]),
          el('p', { class: 'journey-exclusion' }, ['B is excluded: cancelled requests are not reportable under this profile.'])]),
        el('section', { 'aria-label': 'Profile B illustration' }, [el('h4', null, ['Profile B']), el('p', { class: 'family-total' }, ['1 claim family']),
          family('Family 1 · Grouped', [['outbound', 'A · Outbound'], ['return', 'C · Return']]),
          el('p', { class: 'journey-exclusion' }, ['A + C share the same member, client and UTC service date. B is excluded.'])]),
        el('section', { 'aria-label': 'Profile C illustration' }, [el('h4', null, ['Profile C']), el('p', { class: 'family-total' }, ['3 claim families']),
          family('Family 1', [['outbound', 'A · Outbound']]), family('Family 2 · $0 cancellation', [['cancelled', 'B · Cancelled']], true), family('Family 3', [['return', 'C · Return']]),
          el('p', { class: 'journey-exclusion' }, ['B records the documented cancellation. It is not another completed ride or an extra payment.'])])
      ]),
      el('figcaption', null, ['Illustrative application of the frozen synthetic rules, not a trip drawn from the dataset. Assumes supported member, ride and billing facts, with a documented reason and time for cancellation. Each family contains one claim’s versions; the boxes do not assert that a correction actually occurred.'])
    ]);
  }

  function guidedReadinessPass(app) {
    function p(text, cls) { return el('p', { class: cls || 'small' }, [text]); }
    function points(items) { return el('ul', null, items.map(function (text) { return el('li', null, [text]); })); }
    function detail(title, text) { return el('details', { class: 'fold' }, [el('summary', null, [title]), p(text)]); }
    var s = S.st, terms = el('div', { html: window.CCI_READER_CONTEXT.terms }).firstElementChild;
    app.querySelector('.readiness-terms').replaceWith(terms);
    var context = app.querySelector('.readiness-context'); context.textContent = '';
    context.appendChild(el('summary', null, ['Why do complete rides leave incomplete records?']));
    context.appendChild(el('div', { class: 'context-tiles' }, [
      ['plan', 'Different records', 'The health plan holds member and benefit facts. The ride company records the trip. NEMT connects those sources to billing and payment records.'],
      ['document', 'Different requirements', 'A trip receipt shows a ride. A claim also needs supported billing identifiers, quantities and the facts required for its particular use.'],
      ['handoff', 'Separate handoffs', 'Billing references, payment evidence and recipient decisions can arrive later or through another organization. Missing evidence stays visible.']
    ].map(function (x) { return el('article', null, [readerIcon(x[0]), el('h3', null, [x[1]]), p(x[2])]); })));
    context.appendChild(p('The client names are fictional health plans, not ride companies. Their contract rules and return routes are deliberately varied in this model.'));
    context.appendChild(el('a', { href: 'case-study.html#fragmentation' }, ['See the source-record diagram and payment context ↗']));
    var fixed = { pos: 'current_later', period: 'FULL' };
    function scenario(client, title, text, record) {
      var o = Object.assign({}, fixed, { client: client }), ready = C('M15', 'ready', Object.assign({}, o, { stage: 'encounter_submission' })), den = C('M15', 'denominator', Object.assign({}, o, { stage: 'encounter_submission' }));
      return el('article', { class: 'scenario-card', 'data-scenario-client': client }, [
        el('p', { class: 'eyebrow' }, [CLIENT_NAMES[client]]), el('h3', null, [title]), p(text),
        el('dl', null, [el('dt', null, ['Ready for encounter reporting']), el('dd', null, [n(ready) + ' of ' + n(den) + ' units']), el('dt', null, ['Source-supported outcomes']), el('dd', null, [n(C('M16', 'source_evidenced_outcomes', o)) + ' of ' + n(C('M16', 'required_units', o)) + ' reporting units'])]),
        p(client === 'SYN-C01' ? 'Even this simpler route has missing outcome evidence. Ready is not the same as accepted.' : n(C('M15', 'blocked', Object.assign({}, o, { stage: 'encounter_submission' }))) + ' units are blocked and ' + n(C('M15', 'unassessable', Object.assign({}, o, { stage: 'encounter_submission' }))) + ' cannot be assessed. No final-return route does not establish rejection.'),
        el('a', { class: 'btn', href: '#view=b&pos=current_later&rec=' + encodeURIComponent(record) }, [client === 'SYN-C01' ? 'Inspect a supported accepted record ↗' : 'Inspect a record held for payment evidence ↗']),
        el('button', { type: 'button', class: 'btn', onclick: function () { go({ client: client, period: 'FULL', pos: 'current_later', stage: 'encounter_submission', field: '', basis: '' }); requestAnimationFrame(function () { requestAnimationFrame(function () { document.getElementById('explorer-h').scrollIntoView({ block: 'start', behavior: 'instant' }); }); }); } }, ['Explore this health plan ↓'])
      ]);
    }
    var comparison = el('section', { class: 'scenario-comparison', 'aria-labelledby': 'scenario-comparison-h' }, [
      el('p', { class: 'eyebrow' }, ['Start with the difference']), el('h2', { id: 'scenario-comparison-h' }, ['Two evidence paths. Two different follow-ups.']),
      p('These fixed examples show the full service period at July 21. They do not respond to the filters below. The differences are synthetic design choices, not a ranking of real health plans.'),
      el('div', { class: 'scenario-grid' }, [
        scenario('SYN-C01', 'A simpler path to a supported decision', 'One ride per claim; required claim facts can be supported, and an originating response route exists.', 'SYN-C01:S000005'),
        scenario('SYN-C06', 'Payment holds and no final-return route', 'The contract requires vendor-payment evidence before encounter submission. Missing payment observations hold work; the configured return route cannot establish a final source decision.', 'SYN-C06:S000001')
      ])
    ]);
    var workspace = app.querySelector('.explore-workspace');workspace.insertAdjacentElement('beforebegin', comparison);
    var profiles = el('section', { class: 'profile-explainer', 'aria-labelledby': 'profile-explainer-h' }, [el('h2', { id: 'profile-explainer-h' }, ['Why are some health plans grouped together?']),
      el('ul', { class: 'profile-definitions' }, [
        el('li', null, [el('strong', null, ['Profile: ']), 'a shared set of synthetic contract rules for forming claims and deciding which services must be reported. Plans are grouped by these rules, not by performance.']),
        el('li', null, [el('strong', null, ['Claim family: ']), 'one claim record and its version history. A correction adds a version within that family, not another family. Several rides can share a claim when the profile allows it.']),
        el('li', null, [el('strong', null, ['Still counted separately: ']), 'each required service component, such as base fare or mileage. Plans in one profile can also have different reporting destinations and response routes.'])
      ]),
      profileJourney(),
      el('div', { class: 'profile-grid' }, [
        ['Profile A', 'One ride per claim', 'Cedar Harbor and Juniper Way', 'Each completed ride gets its own claim. Cancelled requests are excluded from this profile’s reporting population.'],
        ['Profile B', 'Grouped rides per claim', 'Alder Ridge and Willow Bay', 'Up to eight completed rides for the same member, client and UTC service date can share a claim. Cancelled requests are excluded.'],
        ['Profile C', 'Completed + cancelled reporting', 'Maple Vale and Cypress Grove', 'Each completed ride and documented cancelled request gets its own claim. Completed encounters also require vendor-payment evidence before submission.']
      ].map(function (x) { return el('article', null, [el('p', { class: 'eyebrow' }, [x[0] + ' · Contract rule group']), el('h3', null, [x[1]]), p(x[2], 'profile-clients'), p(x[3])]); }))
    ]);
    profiles.appendChild(detail('Juniper Way’s audit destination is a separate reporting obligation', 'Juniper Way follows Profile A when forming claims, but also sends required components to an audit destination. That creates additional reporting units, not another claim family for the same ride. This is the source of the 4,000-unit difference explained in the count bridge below.'));
    comparison.insertAdjacentElement('afterend', profiles);
    var heading = el('header', { class: 'explorer-intro' }, [el('p', { class: 'eyebrow' }, ['Interactive model / Change a selection and inspect the effect']), el('h2', { id: 'explorer-h' }, ['Explore the frozen model']),
      p('Choose a health plan or contract rule group, service-date window, information cutoff and reporting use. The results below update together. The section title follows the results being read as the page scrolls.')]);
    workspace.insertBefore(heading, workspace.firstChild);
    var help = el('details', { class: 'fold filter-help' }, [el('summary', null, ['How do the filters work?']), el('div', { class: 'filter-help-grid' }, [
      el('article', null, [el('h3', null, ['Health plan or rule group']), points(['Choose one fictional plan for its own results.', 'Choose a named contract rule group to combine plans with shared claim and reporting rules.', 'A shared rule group does not imply the same response visibility.'])]),
      el('article', null, [el('h3', null, ['Service dates, not calendar months']), points(['The frozen dataset covers 90 days, April 1–June 29.', 'The three 30-day windows are demo slices, not monthly accounting periods or a year-round 13-period calendar.', 'This build demonstrates no business reason to prefer them over calendar months.', 'Calendar-month reporting would require a separate calculation; the frozen periods are retained here.'])]),
      el('article', null, [el('h3', null, ['Information available']), points(['July 14 · known then: use only evidence available by July 14.', 'July 14 · with later evidence: revisit that business date using later-arriving historical evidence. A new claim version cannot be backdated.', 'July 21 · later snapshot: inspect the later business position and knowledge cutoff. “Later” is July 21, not today.', 'Separate per-service deadlines: 24 hours for preparation and 48 hours for reporting. These are synthetic rules for this build, not universal payer requirements.']), el('p', { class: 'snapshot-date-note' }, [el('strong', null, ['Why July 14? ']), 'It is the selected comparison date in this demonstration, 15 days after the June 29 service-window end. That gap is not a filing deadline or a requirement to wait 15 days. The pack does not establish a further business reason for choosing it.'])]),
      el('article', null, [el('h3', null, ['Ready for which use?']), points(['Initial preparation checks whether required claim facts are supported.', 'Encounter submission checks that reporting use.', 'Audit submission covers Juniper Way’s separate audit purpose.', 'A record can pass one stage and still lack a fact for another.'])])
    ])]); heading.appendChild(help);
    var filterState = app.querySelector('#filter-state');
    if (filterState) {
      filterState.remove();
      help.appendChild(el('section', { id: 'filter-state', class: 'filter-selection-summary' }, [el('h3', null, ['Current selection']), points([
        'Health plan or group: ' + readerClientLabel(s.client), 'Service dates: ' + PERIOD_LABEL[s.period],
        'Snapshot: ' + POS_LABEL[s.pos], 'Use: ' + STAGE_LABEL[s.stage],
        'Preparation units in view: ' + n(C('M14', 'denominator')) + ' of ' + n(C('M14', 'denominator', { client: 'ALL', period: 'FULL' })) + '.'
      ])]));
    }
    var reset = app.querySelector('#f-reset'); reset.textContent = 'Reset filters';
    var results = app.querySelector('.explore-results'), overview = el('section', { id: 'explore-overview', class: 'reader-primary', 'data-explore-section': 'Claim readiness' });
    var blocker = results.querySelector('[aria-labelledby="blk-h"]');
    while (results.firstChild && results.firstChild !== blocker) overview.appendChild(results.firstChild);
    results.insertBefore(overview, blocker);
    var down = results.querySelector('[aria-labelledby="down-h"]');
    blocker.id = 'explore-blockers';blocker.setAttribute('data-explore-section', 'Missing facts');
    down.id = 'explore-outcomes';down.setAttribute('data-explore-section', 'After submission');
    Array.from(results.querySelectorAll(':scope > details')).forEach(function (d) {
      var title = d.querySelector('summary').textContent;
      if (title.indexOf('Why can some') === 0) { d.id = 'explore-routes'; d.setAttribute('data-explore-section', 'Partner routes'); }
      if (title.indexOf('What do the cost') === 0) { d.id = 'explore-money'; d.setAttribute('data-explore-section', 'Financial records'); }
      if (title.indexOf('Could a record') === 0) { d.id = 'explore-correctness'; d.setAttribute('data-explore-section', 'Accepted-record checks'); }
    });
    var sections = Array.from(results.querySelectorAll('[data-explore-section]'));
    var bar = el('div', { class: 'reader-section-nav', id: 'reader-section-nav' }, [el('strong', { id: 'reader-section-title', 'data-section': 'explore-overview' }, ['Claim readiness']), el('span', { class: 'reader-section-separator' }, [' - ']), el('span', { id: 'reader-subsection-title' }, ['Overview'])]);
    app.querySelector('.controls').insertAdjacentElement('afterend', bar);
    overview.querySelector('.selected-scope').textContent = readerClientLabel(s.client) + ' · ' + PERIOD_LABEL[s.period] + ' · ' + POS_LABEL[s.pos] + ' · ' + STAGE_LABEL[s.stage];
    var rules = {
      M14: { 'Missing claim': 'No claim version links this expected component.', 'Partially allocated': 'The claim exists, but its component links or quantity support are incomplete.', 'Conflicting': 'Competing claim or allocation evidence prevents one supported construction.', 'Applicability unresolved': 'The source has not established which component requirement applies. The expected work stays visible.', 'Claim families': 'Distinct claim records with their version histories. A grouped claim can hold several rides, so families and units are not equal.' },
      M15: { 'Blocked': 'A required fact is missing for this use.', 'Conflicting': 'Required evidence disagrees, so readiness cannot be established.', 'Missing construction': 'The required component has no constructed claim version.', 'Unassessable': 'The applicable requirement cannot be determined from the source evidence.' },
      M16: { 'Accepted, source-evidenced': 'A traceable recipient decision confirms acceptance of the component and destination.', 'Rejected, source-evidenced': 'A traceable recipient decision confirms rejection. It may not supply the reason.', "Client's own outcome note only": 'An individual client assertion is recorded, but it is not the originating decision.', 'Aggregate note only': 'A batch summary cannot establish each record’s decision.', 'No usable evidence': 'No usable final-outcome support is available. A receipt acknowledgment alone is not a final decision.' }
    };
    ['M14','M15','M16'].forEach(function (id) {
      var card = overview.querySelector('[aria-labelledby="c-' + id + '"]');
      card.querySelectorAll('dl dt').forEach(function (dt) { var label = dt.textContent; if (rules[id][label]) dt.appendChild(el('span', { class: 'status-definition' }, [rules[id][label]])); });
      var text = id === 'M14' ? 'Constructed means the required component has a supported link into the current assembled claim. It does not mean the ride was paid.' : id === 'M15' ? 'Ready means the required component meets this use’s rules. It is a component count, not the percentage of whole encounters accepted or paid.' : 'A source-supported outcome is a decision traceable to the recipient, directly or in a supported forwarded copy, for the exact submitted record and scope. Acceptance and rejection both provide evidence of an outcome.';
      card.querySelector('.card-meaning').textContent = text;
    });
    var readiness = overview.querySelector('[aria-labelledby="c-M15"]');
    var den = C('M15','denominator',{stage:s.stage}), builtDen = C('M14','denominator');
    if (s.stage === 'encounter_submission' && den < builtDen) readiness.querySelector('.frac').insertAdjacentElement('afterend', p(n(builtDen-den) + ' audit-purpose units are counted separately; see the count bridge below.', 'inline-denominator-note'));
    var focus = blocker.querySelector('.blocker-focus');
    if (focus) {
      var field = Object.keys(FIELD_LABEL).filter(function (key) { return FIELD_LABEL[key] === focus.querySelector('h3').textContent; })[0];
      var meanings = { vendor_payment_observation: 'A source record of what the ride company was paid for this service. Missing evidence does not establish nonpayment.', line_charge: 'The amount billed for one component. In this model it depends on supported quantity × unit price; missing mileage can prevent a mileage charge from being calculated.', line_quantity: 'The supported quantity, such as miles, on a claim component. Blank mileage is not zero.', billing_party_reference: 'The supported identifier for the party billing the service, separate from the transport company and the ride receipt.', trip_verification_reference: 'A supporting reference that the trip took place; a driver accepting an assignment is not trip completion.', subscriber_id: 'The insurance policyholder identifier, which cannot be assumed from the patient’s member ID.', subscriber_relationship: 'The supported relationship between the patient and the policyholder.', coverage_reference: 'The plan or coverage reference applicable to the service.', transport_company_reference: 'The identity of the company that performed the ride.', complete_explicit_service_line_allocation_membership: 'The explicit links showing which required service components belong to which claim lines.', '(grouped sibling not ready)': 'Another required component in the grouped submission is not ready. The group must be checked together.' };
      Object.assign(meanings, { service_start_at: 'The supported time the ride started, rather than its assignment or booking time.', service_end_at: 'The supported time the ride ended. Independent expected work stays visible even if this ride observation is missing.', service_date_utc: 'The service date supported by the ride record, using the model’s UTC calendar.', transport_category: 'The transportation category recorded for the service. No clinical category is invented when the source is absent.', member_id: 'The supported identity of the patient or plan member associated with this service.' });
      var fact = el('p', { class: 'missing-fact-definition' }, [el('strong', null, ['What this fact means: ']), meanings[field] || 'Source support for the displayed service fact, at the applicable date and cutoff.']);
      focus.querySelector('h3').insertAdjacentElement('afterend', fact);
      blocker.querySelectorAll('table[id^="t-m15-missing"] tbody tr').forEach(function (row) {
        var label = row.cells[0].textContent, key = Object.keys(FIELD_LABEL).filter(function (k) { return FIELD_LABEL[k] === label; })[0];
        row.cells[0].appendChild(detail('What is this fact?', meanings[key] || 'Source support for this required fact at the applicable service date and cutoff.'));
      });
      var affected = blocker.querySelector('#affected');
      if (affected && meanings[s.field]) affected.querySelector('h3').insertAdjacentElement('afterend', p(meanings[s.field], 'missing-fact-definition'));
      var blocked = C('M15','blocked',{stage:s.stage}), conflicting = C('M15','conflicting',{stage:s.stage}), both = C('M15','distinct_blocked_units',{stage:s.stage}), unassessable = C('M15','unassessable',{stage:s.stage});
      var explanation = el('div', { class: 'blocked-count-explanation' }, [el('h3', null, ['Where does the blocked / conflicting total come from?']),
        p(n(blocked) + ' units are blocked by missing facts; ' + n(conflicting) + ' have conflicting evidence.' + (blocked+conflicting===both ? ' Together that is ' + n(both) + ' distinct blocked or conflicting units in this selection.' : ' The stored distinct total is ' + n(both) + '; overlapping states are not added twice.')),
        p(n(unassessable) + ' units are unassessable because their requirement is unresolved. They are counted separately from this blocked / conflicting group.')]);
      if (field === 'vendor_payment_observation') {
        var list = ((S.blockers[s.pos] || {})[s.stage] || {})[field] || [], dates = S.bundle.periods[s.period];
        var matches = list.filter(function (row) { var client = clientOf(row[0]); return (s.client==='ALL'||client===s.client||(S.bundle.profiles_by_filter[s.client]||[]).indexOf(client)>=0)&&row[1]>=dates[0]&&row[1]<=dates[1]; });
        var unique = new Set(matches.map(function (row) { return row[0].split('|')[1]; })).size, units = C('M15','units_missing_field:'+field,{stage:s.stage});
        if (matches.length===units) explanation.appendChild(p('The affected list links these ' + n(units) + ' component obligations to ' + n(unique) + ' distinct services. One missing service-level payment record can hold both its base and mileage components. This is not a count of ' + n(units) + ' separate payments.'));
      }
      focus.insertAdjacentElement('beforebegin', explanation);
    }
    // Track meaningful result blocks, with individual cards when their layout stacks vertically.
    function track(node, label, key, heading) {
      if (!node) return;
      node.setAttribute('data-explore-subsection', label);
      node.setAttribute('data-reader-subsection', key);
      if (heading) heading.setAttribute('data-reader-subsection-heading', key);
    }
    sections.forEach(function (section) {
      Array.from(section.children).forEach(function (node, i) {
        if (node.matches('.grid-3')) {
          track(node, section === overview ? 'Claim built? · Ready for use? · Supported decision?' : 'Acceptance · First-attempt outcomes · Response timing', section.id + '-cards');
          node.querySelectorAll(':scope > .mcard').forEach(function (card) {
            var h = card.querySelector('.mtitle');
            track(card, h.textContent, card.getAttribute('aria-labelledby'), h);
            card.setAttribute('data-subsection-card', 'true');
          });
          return;
        }
        if (node.matches('h2,summary,p,.prov')) return;
        var h = node.querySelector('h2,h3,summary,.tcap');
        if (h) track(node, h.textContent, section.id + '-block-' + i, h);
        if (node.matches('figure')) track(node, 'Why completed rides lack supported acceptance', section.id + '-chart');
      });
    });
    var bridgeNode = overview.querySelector('.reader-denominators');
    if (bridgeNode) track(bridgeNode, 'Why do the counts differ?', 'readiness-counts', bridgeNode.querySelector('h3'));
    var totalsNode = blocker.querySelector('.blocked-count-explanation');
    if (totalsNode) track(totalsNode, 'Where does the blocked / conflicting total come from?', 'blocked-total', totalsNode.querySelector('h3'));
    if (focus) track(focus, 'Largest evidence gap', 'largest-evidence-gap', focus.querySelector('h3'));
    var exampleNode = blocker.querySelector('.reader-evidence-example');
    if (exampleNode) track(exampleNode, exampleNode.querySelector('h3').textContent, 'supporting-record-example', exampleNode.querySelector('h3'));
    var factsCaption = blocker.querySelector('table[id^="t-m15-missing"]');
    if (factsCaption) {
      var factsNode = factsCaption.closest('.table-wrap').parentElement;
      track(factsNode, 'Required facts behind blocked or conflicting units', 'required-facts', factsNode.querySelector('.tcap'));
    }
    var affectedNode = blocker.querySelector('#affected');
    if (affectedNode) track(affectedNode, 'Affected records · ' + (FIELD_LABEL[s.field] || s.field), 'affected-records', affectedNode.querySelector('h3'));
    var chartGuide = down.querySelector('#reading-chart');
    if (chartGuide) track(chartGuide, 'Reading the chart', 'reading-the-chart', chartGuide.querySelector('h3'));
    var coverageTable = down.querySelector('#t-m02');
    if (coverageTable) {
      var coverageTableNode = coverageTable.closest('.table-wrap').parentElement;
      track(coverageTableNode, 'Rule order and exact counts', 'coverage-rule-table', coverageTableNode.querySelector('h3'));
    }
    app.querySelectorAll('.worked-action-step').forEach(function (node) { track(node, node.querySelector('h3').textContent, 'worked-action-' + node.getAttribute('data-action-step'), node.querySelector('h3')); });
    // Stable section/detail keys preserve the reader's location and expanded explanations on filter changes.
    sections.forEach(function (section) {
      var keys = {};
      section.querySelectorAll('details').forEach(function (d) { var card=d.closest('.mcard'), base=(card?card.getAttribute('aria-labelledby')+'|':'')+d.querySelector('summary').textContent; keys[base]=(keys[base]||0)+1;d.setAttribute('data-reader-detail',section.id+'|'+base+'|'+keys[base]); });
      var counts = {};
      section.querySelectorAll('h2,h3,details > summary,.tcap').forEach(function (a) { var base=a.getAttribute('data-reader-subsection-heading') || (a.parentElement.tagName==='DETAILS' ? a.parentElement.getAttribute('data-reader-detail') : a.id || a.textContent);counts[base]=(counts[base]||0)+1;a.setAttribute('data-reader-anchor',base+'|'+counts[base]); });
    });
    app.querySelectorAll('.run-section a').forEach(function(a){ if (a.getAttribute('href')==='evidence/readiness-business-checks-2026-10-20.json') a.href='evidence/publication-preparation-2026-10-20.json'; });
    installDisclosureScopes(app);
  }

  function readerIcon(kind) {
    var paths = { plan: '<path d="M7 27V5h18v22M4 27h24M12 11h8M12 17h8M12 23h8"/>', document: '<path d="M8 3h12l6 6v20H8zM20 3v7h6M12 16h10M12 22h10"/>', handoff: '<circle cx="7" cy="16" r="4"/><circle cx="25" cy="7" r="4"/><circle cx="25" cy="25" r="4"/><path d="m11 14 10-5m-10 9 10 5"/>' };
    return el('span', { class: 'reader-icon', 'aria-hidden': 'true', html: '<svg viewBox="0 0 32 32">'+paths[kind]+'</svg>' });
  }

  function scopeWords() {
    var s = S.st;
    return (CF_LABEL[s.client] || s.client) + ' · ' + PERIOD_LABEL[s.period] + ' · ' + POS_LABEL[s.pos] + ' · ' + STAGE_LABEL[s.stage];
  }

  function businessTerms() {
    return el('section', { class: 'business-terms', 'aria-labelledby': 'business-terms-h' }, [
      el('p', { class: 'eyebrow' }, ['Start here / Three terms']),
      el('h2', { id: 'business-terms-h' }, ['From a completed ride to a usable record']),
      el('div', { class: 'term-grid' }, [
        ['Ride record', 'What service happened?', 'The record of a transportation service. It may lack information needed for billing or reporting.'],
        ['Claim', 'What supports payment?', 'A structured record supporting a request for payment. This build assembles claim facts from ride records and supporting evidence.'],
        ['Encounter', 'What must be reported?', 'A record of a service used for health plan or state reporting. This build models that reporting downstream of claim preparation.']
      ].map(function (x) { return el('article', null, [el('p', { class: 'eyebrow' }, [x[0]]), el('h3', null, [x[1]]), el('p', null, [x[2]])]); })),
      el('p', { class: 'scope-note' }, ['A recipient can accept a submission without establishing payment or proving every fact correct. These are model explanations, not a claim of actual payer submission or standards certification.'])
    ]);
  }

  function readingGuide() {
    return chapter(el('section', null, [el('h2', { id: 'meaning-h' }, ['Read the result, then choose the action']),
      el('div', { class: 'term-grid' }, [
        ['Assembled is not ready', 'A claim can exist and still lack a required fact. Readiness depends on the particular billing or reporting use.', 'Next action: obtain the missing source information.'],
        ['Unknown is not rejected', 'A missing response or a client note may leave the recipient outcome unconfirmed. Supported rejection is an evidenced outcome, but is not acceptance.', 'Next action: request the originating response or follow up on the return route.'],
        ['Unknown is not unpaid', 'Cost, charge, payer payment, vendor payment and cash collection are different facts. A missing payment observation is not a zero balance.', 'Next action: obtain the appropriate payment evidence before drawing a financial conclusion.']
      ].map(function (x) { return el('article', null, [el('h3', null, [x[0]]), el('p', null, [x[1]]), el('p', { class: 'next-action' }, [x[2]])]); })),
      el('details', { class: 'fold' }, [el('summary', null, ['Why do the counts differ?']),
        el('p', null, ['One ride can have several service components and reporting destinations, while two rides can share one claim header. Preparation units, reporting units, completed rides and submitted families therefore have different denominators. The main cards are not a funnel.']),
        relationTable({ pos: S.st.pos, client: 'ALL', period: 'FULL' })]),
      el('details', { class: 'fold' }, [el('summary', null, ['What do Known then, Restated then and Current later mean?']),
        el('p', null, ['Known then asks what was supported at the original cutoff. Restated then uses later information to examine that earlier business date, without backdating a claim version that did not yet exist. Current later asks what is supported at the later date.']), termsLine()])
    ]), 'reading-guide', 'Interpretation / Business meaning');
  }

  function recommendations() {
    var ideas = [
      ['01 / Evidence lifecycle', 'Let payment evidence arrive later', 'Add matched scenarios with later vendor-payment observations, explicit unknowns and conflicting revisions.', 'Which targets become ready when the payment evidence arrives, and which still lack other required facts?', 'Keep source facts and target rules fixed; compare readiness before and after each revision. Unknown must remain distinct from unpaid.'],
      ['02 / Return visibility', 'Separate an outcome from its visibility', 'Vary return routes and receipt timing while holding the underlying synthetic business decision fixed.', 'How much does evidenced coverage change because the response is missing, delayed or only a client assertion?', 'Use declared synthetic ground truth for the experiment. An unavailable real response does not establish acceptance or rejection.'],
      ['03 / Scenario realism', 'Calibrate the mix with observed evidence', 'Replace equal coverage buckets with separately documented scenario mixes if suitable partner evidence becomes available.', 'Which findings persist across different payment lags, missing-field patterns and return-route mixes?', 'Establish suitable field and timing distributions first. Current frozen v1 buckets guarantee case coverage; they do not estimate prevalence.'],
      ['04 / Operational choices', 'Compare follow-up strategies', 'Simulate queues ordered by deadline, missing fact or return route, with explicit assumptions about effort and response time.', 'Does earlier collection of the required evidence reduce overdue work without changing the underlying business outcomes?', 'Compare matched workloads and retain unresolved cases. Any predicted benefit is a hypothesis until tested against suitable evidence.'],
      ['05 / Claim lineage', 'Exercise more corrections and replacements', 'Expand scenarios with multiple deliveries, authoritative retractions, voids and accepted or rejected replacements.', 'Can a correction preserve the right predecessor coverage while showing exactly which submitted bytes were accepted?', 'Specify expected version and unit states before execution, then compare the full event chain across business and knowledge cutoffs.'],
      ['06 / Build-forward candidate', 'Detection evaluation', 'Use independent evaluator custody, broader fault-class representation and current chart and operating checks appropriate to the next build.', 'Do the controls detect new timing, authority and lineage defects while leaving matched clean cases quiet?', 'Retain misses and unrepresented classes. The historical unblinded evaluation does not establish effectiveness of the final controls.']
    ];
    return el('section', { class: 'recommendations', 'aria-labelledby': 'recommendations-h' }, [
      el('p', { class: 'eyebrow' }, ['Build forward / proposed experiments']),
      el('h2', { id: 'recommendations-h' }, ['What the next iteration could answer']),
      el('p', { class: 'lede' }, ['Start with payment-evidence timing and return visibility. Matched scenarios can isolate why a claim stays blocked or an outcome remains unevidenced.']),
      el('p', { class: 'small' }, ['These are recommendations for the next iteration, not completed capabilities, forecasts or measured improvements from frozen v1.']),
      el('div', { class: 'recommendation-grid' }, ideas.map(function (r) { return el('article', { class: 'recommendation-card' }, [
        el('p', { class: 'eyebrow' }, [r[0]]), el('h3', null, [r[1]]), el('p', { class: 'small' }, [r[2]]),
        el('div', { class: 'experiment-question' }, [el('span', { class: 'eyebrow' }, ['Question to test']), el('p', null, [r[3]])]),
        el('p', { class: 'small' }, [el('strong', null, ['Evidence needed. ']), r[4]])
      ]); })),
      el('a', { class: 'btn', href: '#view=c' }, ['Read the current evidence and its limits ↗'])
    ]);
  }

  function jumpButton(id, label, extraClass) {
    return el('button', { type: 'button', class: 'btn ' + (extraClass || ''), onclick: function () {
      var target = document.getElementById(id);
      if (target) {
        if (window.CCI_PAGE_CONTENTS && window.CCI_PAGE_CONTENTS.jumpTo(target)) return;
        var node = target;
        while (node) { if (node.tagName === 'DETAILS') node.open = true; node = node.parentElement; }
        target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' });
      } else if (id === 'story-h') {
        go({ view: 'b', rec: 'SYN-C01:S000001', story: 'DEMO01', pos: 'known_then' });
      }
    } }, [label]);
  }

  function explanatoryHero(app, config) {
    var hero = app.querySelector('.hero'), copy = el('div', { class: 'hero-copy' });
    hero.classList.add('hero-split', 'explanatory-hero');
    while (hero.firstChild) copy.appendChild(hero.firstChild);
    copy.appendChild(el('div', { class: 'btn-row hero-actions' }, config.actions));
    hero.appendChild(copy);
    hero.appendChild(el('aside', { class: 'hero-guide', 'aria-label': config.label }, [
      el('p', { class: 'eyebrow' }, [config.label]), el('h2', null, [config.title]),
      el('ol', { class: 'hero-prompts' }, config.prompts.map(function (p) { return el('li', null, [p]); }))
    ]));
  }

  function readingNav(items, label) {
    return el('nav', { class: 'reading-nav', 'aria-label': label }, [el('p', { class: 'eyebrow' }, [label]),
      el('div', { class: 'btn-row' }, items.map(function (r) { return jumpButton(r[0], r[1]); }))]);
  }

  function chapter(node, id, label) {
    node.classList.add('reading-chapter'); node.id = id;
    node.insertBefore(el('p', { class: 'eyebrow' }, [label]), node.firstChild);
    return node;
  }

  function overview() {
    // Fixed, unfiltered: frozen synthetic snapshot (current later, all clients, full period). Never responds to the controls below.
    var o = { pos: 'current_later', client: 'ALL', period: 'FULL' };
    var P = C('M14', 'denominator', o), built = C('M14', 'numerator', o), hdr = C('M14', 'claim_headers', o);
    var encDen = C('M15', 'denominator', Object.assign({ stage: 'encounter_submission' }, o)), encReady = C('M15', 'ready', Object.assign({ stage: 'encounter_submission' }, o));
    var encBlocked = C('M15', 'blocked', Object.assign({ stage: 'encounter_submission' }, o)), encConf = C('M15', 'conflicting', Object.assign({ stage: 'encounter_submission' }, o));
    var encUna = C('M15', 'unassessable', Object.assign({ stage: 'encounter_submission' }, o));
    var vp = C('M15', 'units_missing_field:vendor_payment_observation', Object.assign({ stage: 'encounter_submission' }, o));
    var vpSlots = C('M17', 'vendor_payment:unknown', Object.assign({}, o, { client: 'P-C' }));
    var initReady = C('M15', 'ready', Object.assign({ stage: 'initial_preparation' }, o)), initDen = C('M15', 'denominator', Object.assign({ stage: 'initial_preparation' }, o));
    var U = C('M16', 'required_units', o), se = C('M16', 'source_evidenced_outcomes', o), none = C('M16', 'basis:no_usable_evidence', o);
    var m01n = C('M01', 'numerator', o), m01d = C('M01', 'denominator', o), cun = C('M01', 'C_unresolved', o);
    var p = S.bundle.populations ? S.bundle.populations.current_later : null;
    var lead = (p ? n(p.C + p.C_unresolved) + ' completed legs and ' + n(p.cancelled_units_requests) + ' documented cancellations' : 'The completed legs and documented cancellations') +
      ' require ' + n(P) + ' claim preparation units; ' + n(built) + ' are constructed into ' + n(hdr) + ' claim families. ' +
      'Initial preparation is ready for ' + n(initReady) + ' of ' + n(initDen) + ' units, but encounter submission is ready for only ' + n(encReady) + ' of ' + n(encDen) + ': ' +
      n(encBlocked) + ' are blocked, ' + n(encConf) + ' conflicting and ' + n(encUna) + ' unassessable. ' +
      n(vp) + ' of the blocked units (' + n(vpSlots) + ' P-C services, two components each) lack the known vendor payment that target requires; after the 14-day window that payment is unknown, not unpaid.';
    var down = 'Downstream, ' + n(se) + ' of ' + n(U) + ' required reporting units have source-evidenced outcomes (acceptances and supported rejections); ' + n(none) + ' have no usable evidence. ' +
      n(m01n) + ' of ' + n(m01d) + ' reportable completed legs have source-evidenced acceptance at every required target (' + pct(m01n, m01d) + '); ' + n(cun) + ' leg with unresolved applicability is held apart.';
    function insight(label, value, detail, text) {
      return el('article', { class: 'snapshot-card' }, [el('p', { class: 'eyebrow' }, [label]),
        el('p', { class: 'snapshot-value' }, [n(value)]), el('p', { class: 'snapshot-den' }, [detail]), el('p', { class: 'small' }, [text])]);
    }
    return el('section', { class: 'overview snapshot', 'aria-labelledby': 'ov-h' }, [
      el('div', { class: 'snapshot-heading' }, [el('h2', { id: 'ov-h' }, ['The snapshot at a glance']),
        el('span', { class: 'chip' }, ['Fixed scope · not changed by filters'])]),
      el('p', { class: 'small' }, ['Frozen synthetic snapshot · ' + posWords('current_later') + ' · all clients · full service period']),
      el('div', { class: 'grid-3 snapshot-grid' }, [
        insight('01 / Claim construction', built, 'of ' + n(P) + ' preparation units constructed', n(hdr) + ' claim families. Missing claims remain in the denominator.'),
        insight('02 / Submission readiness', encReady, 'of ' + n(encDen) + ' encounter submission units ready', n(encBlocked) + ' blocked · ' + n(encConf) + ' conflicting · ' + n(encUna) + ' unassessable.'),
        insight('03 / Outcome evidence', se, 'of ' + n(U) + ' reporting units with source-evidenced outcomes', 'Includes acceptances and supported rejections. ' + n(none) + ' units have no usable evidence.')
      ]),
      el('p', { class: 'scope-note' }, ['These counts have different grains and scopes. They are not a funnel. Outcome mixes and client differences are synthetic design choices, not real-world performance or prevalence.']),
      el('details', { class: 'fold snapshot-detail' }, [
        el('summary', null, ['Snapshot scope, populations and full context']),
        el('p', { class: 'small' }, [lead]), el('p', { class: 'small' }, [down]),
        relationTable(o), identityChips(),
        el('p', { class: 'small' }, ['Rule basis: synthetic contract ' + S.bundle.snapshot.rule_version + '.'])
      ])
    ]);
  }

  // R1-13b finding 14: T, K and the population letters are defined in one line at first use, in the register's own words
  // (shared availability rule and population members, trimmed to their first clause), linked to the definitions view.
  function termsLine() {
    var reg = S.bundle.register || {}, pops = reg.populations || {};
    var clean = function (t) { return String(t).replace(/\*[^*]*\*:?\s*/g, '').replace(/`/g, '').split(/ \(|\. /)[0].trim(); };
    var avail = (reg.shared_rules || []).filter(function (r) { return /^Availability\./.test(r); })[0];
    var tk = 'T is the business horizon and K the knowledge cutoff' + (avail ? ': ' + clean(avail.replace(/^Availability\.\s*/, '')).replace(/^A /, 'a ').replace(/<=/g, '≤').replace(/received_at/, 'its received time').replace(/effective_at/, 'its effective time') : '') + '. ';
    var syms = ['C', 'P', 'U', 'S'].filter(function (k) { return pops[k]; });
    var popText = syms.length ? 'Populations, as the register names them: ' + syms.map(function (k) { return k + ', ' + clean(pops[k].members); }).join('; ') + '. ' : '';
    return el('p', { class: 'small', id: 'terms' }, [el('strong', null, ['Terms. ']), tk + popText,
      el('a', { href: hashOf(Object.assign({}, S.st, { view: 'c', rec: '' })) }, ['Open Understand the data']), '.']);
  }

  function relationTable(o) {
    var p = S.bundle.populations ? S.bundle.populations[o.pos] : null;
    if (!p) return el('p', { class: 'small' }, ['Population table unavailable.']);
    var rows = [
      ['Requests retained (R)', p.R, 'request', 'Every request, including ' + n(p.R - p.C - p.C_unresolved) + ' cancelled, no-show or unknown.'],
      ['Completed legs, reportable (C)', p.C, 'completed leg', 'Plus ' + n(p.C_unresolved) + ' completed leg with unresolved applicability, held apart.'],
      ['Preparation units (P)', p.P, 'component × target', 'One per required component per recipient and purpose; includes ' + n(p.cancelled_units) + ' P-C cancelled-report units outside C.'],
      ['Claim families (headers)', C('M14', 'claim_headers', o), 'claim family', 'Grouping (P-B) puts up to two legs on one claim; headers never shrink P.'],
      ['Reporting units (U)', p.U, 'component × target', 'Same keys as P under this contract; outcome evidence is read here.'],
      ['First-submitted families (S)', C('M03', 'families', o), 'encounter family', 'Families first submitted by T and known by K; the M03 cohort.'],
      ['Financial items (F)', p.F, 'service or cancelled request', 'Each carries typed slots: cost, charge, allowed, paid, responsibility, collection, vendor payment, refund.']
    ];
    return table({ caption: 'Populations and how they relate (counts differ by design; this is not a funnel)', header: ['Population', 'Count', 'Grain', 'Relationship'], rows: rows, num: [1], stack: true });
  }

  function storyIndex() {
    var stories = (S.extra.stories || {}).stories || [];
    var sec = el('section', { 'aria-labelledby': 'stories-h' }, [el('h2', { id: 'stories-h' }, ['Five guided routes'])]);
    if (!stories.length) { sec.appendChild(el('p', { class: 'small' }, ['Story bindings are not in this bundle.'])); return sec; }
    sec.appendChild(el('p', { class: 'small' }, ['Each route opens real records from the frozen population, or a labeled public miniature where the population has no such case.']));
    sec.appendChild(el('div', { class: 'story-list' }, stories.map(function (s) {
      return el('article', { class: 'story' }, [el('span', { class: 'sid' }, [s.id.replace('DEMO', '0')]), el('h3', null, [s.title]), el('p', { class: 'small' }, [s.teaser]),
        el('a', { href: storyHref(s, s.steps[0], Object.assign({}, S.st, { view: 'b' })) }, ['Open route ' + s.id])]);
    })));
    return sec;
  }

  function controls() {
    var s = S.st, b = S.bundle;
    function sel(id, label, value, options, onch) {
      return el('div', null, [el('label', { for: id }, [label]), el('select', { id: id, onchange: onch }, options.map(function (o) { return el('option', { value: o[0], selected: o[0] === value }, [o[1]]); }))]);
    }
    var form = el('form', { onsubmit: function (e) { e.preventDefault(); } }, [
      sel('f-client', 'Health plan or contract rule group', s.client, b.client_filters.map(function (c) { return [c, readerClientLabel(c)]; }), function (e) { go({ client: e.target.value }); }),
      sel('f-period', 'Service dates · fixed demo windows', s.period, Object.keys(b.periods).map(function (p) { return [p, { FULL: 'All dates · Apr 1–Jun 29', SP1: 'Days 1–30 · Apr 1–30', SP2: 'Days 31–60 · May 1–30', SP3: 'Days 61–90 · May 31–Jun 29' }[p]]; }), function (e) { go({ period: e.target.value }); }),
      el('div', null, [sel('f-pos', 'Which snapshot?', s.pos, Object.keys(POS_LABEL).map(function (p) { return [p, { known_then: 'July 14 · known then', restated_then: 'July 14 · with later evidence', current_later: 'July 21 · later snapshot' }[p]]; }), function (e) { go({ pos: e.target.value }); }),
        el('p', { class: 'pos-desc' }, [POS_DESC[s.pos]])]),
      sel('f-stage', 'Ready for which use?', s.stage, b.stages.map(function (x) { return [x, STAGE_LABEL[x]]; }), function (e) { go({ stage: e.target.value }); }),
      el('p', { class: 'state', id: 'filter-state' }, ['Showing ' + (CF_LABEL[s.client] || s.client) + ', ' + lc(PERIOD_LABEL[s.period]) + ', ' + posWords(s.pos) + ', readiness stage ' + lc(STAGE_LABEL[s.stage]) + '. ' +
        'Preparation units in view: ' + n(C('M14', 'denominator')) + ' of ' + n(C('M14', 'denominator', { client: 'ALL', period: 'FULL' })) + '.']),
      el('div', { class: 'btn-row' }, [el('button', { class: 'btn', id: 'f-reset', type: 'button', onclick: function () { go({ client: 'ALL', period: 'FULL', pos: 'current_later', stage: 'encounter_submission', field: '', basis: '' }); } }, ['Reset to the declared defaults'])])
    ]);
    return el('section', { class: 'controls', 'aria-labelledby': 'ctl-h' }, [
      el('details', { class: 'filter-drawer', open: window.innerWidth >= 768 }, [el('summary', null, [el('span', { id: 'ctl-h' }, ['Explore · Edit filters']), el('span', { class: 'filter-brief' }, [(CF_LABEL[s.client] || s.client) + ' · ' + POS_LABEL[s.pos] + ' · ' + STAGE_LABEL[s.stage]])]), form,
        el('button', { class: 'btn mobile-results-button', type: 'button', onclick: function () {
          var drawer = document.querySelector('.filter-drawer'); drawer.open = false;
          drawer.querySelector('summary').focus({ preventScroll: true });
          document.getElementById('primary').scrollIntoView({ block: 'start' });
        } }, ['Show selected results ↓'])]),
      el('p', { class: 'filter-instruction small' }, ['Results below use this selection. Each table identifies any scope restriction.'])
    ]);
  }

  function card(id, title, value, frac, dl, pop, link) {
    return el('article', { class: 'mcard', 'aria-labelledby': 'c-' + id }, [
      el('span', { class: 'mid' }, [id]), el('h3', { class: 'mtitle', id: 'c-' + id }, [title]), el('div', { class: 'value' }, [value]), el('div', { class: 'frac' }, [frac]),
      el('dl', null, [].concat.apply([], dl.map(function (r) { return [el('dt', null, [r[0]]), el('dd', null, [n(r[1])])]; }))),
      el('p', { class: 'pop' }, [pop]),
      link ? el('a', { class: 'more', href: link }, ['Definition and verification']) : null
    ]);
  }
  function cardM14() {
    var d = C('M14', 'denominator'), nn = C('M14', 'numerator');
    return card('M14', 'Has the claim record been assembled?', pct(nn, d), n(nn) + ' of ' + n(d) + ' preparation units constructed',
      [['Missing claim', C('M14', 'missing')], ['Partially allocated', C('M14', 'partially_allocated')], ['Conflicting', C('M14', 'conflicting')], ['Applicability unresolved', C('M14', 'applicability_unresolved')], ['Claim families', C('M14', 'claim_headers')]],
      'Population P: expected units by component and target, including units with no claim.', hashOf(Object.assign({}, S.st, { view: 'c', rec: 'M14' })));
  }
  function cardM15() {
    var st = S.st.stage, o = { stage: st };
    var d = C('M15', 'denominator', o), r = C('M15', 'ready', o);
    return card('M15', 'Is it ready for ' + lc(STAGE_LABEL[st]) + '?', pct(r, d), n(r) + ' of ' + n(d) + ' units ready for this target',
      [['Blocked', C('M15', 'blocked', o)], ['Conflicting', C('M15', 'conflicting', o)], ['Missing construction', C('M15', 'missing_construction', o)], ['Unassessable', C('M15', 'unassessable', o)]],
      'Population P at this stage. A unit can be ready for one target and blocked for another; unknown payment blocks only targets that require it.', hashOf(Object.assign({}, S.st, { view: 'c', rec: 'M15' })));
  }
  function cardM16() {
    var U = C('M16', 'required_units'), se = C('M16', 'source_evidenced_outcomes');
    return card('M16', 'Is the reporting outcome confirmed?', pct(se, U), n(se) + ' of ' + n(U) + ' units have a source-evidenced outcome',
      [['Accepted, source-evidenced', C('M16', 'outcome:accepted') === null ? null : countBasisOutcome('accepted')], ['Rejected, source-evidenced', countBasisOutcome('rejected')],
       ["Client's own outcome note only", C('M16', 'basis:record_specific_client_assertion')], ['Aggregate note only', C('M16', 'basis:aggregate_only_assertion')], ['No usable evidence', C('M16', 'basis:no_usable_evidence')]],
      'Population U. A supported rejection is outcome evidence, not acceptance; this is not another acceptance rate.', hashOf(Object.assign({}, S.st, { view: 'c', rec: 'M16' })));
  }
  function countBasisOutcome(outcome) {
    // Source-evidenced outcomes split: accepted and rejected units carry originating or forwarded basis by construction in this contract.
    var v = C('M16', 'outcome:' + outcome);
    return v;
  }

  function blockerSection() {
    var s = S.st, o = { stage: s.stage };
    var sec = el('section', { 'aria-labelledby': 'blk-h' }, [el('h2', { id: 'blk-h' }, ['What blocks ' + lc(STAGE_LABEL[s.stage])])]);
    var prefix = 'units_missing_field:';
    var subs = (S.bundle.measures.M15.submeasures || []).filter(function (x) { return x.indexOf(prefix) === 0; });
    var rows = subs.map(function (x) { var f = x.slice(prefix.length); return { field: f, label: FIELD_LABEL[f] || f, value: C('M15', x, o) || 0 }; }).filter(function (r) { return r.value > 0; });
    rows.sort(function (a, b) { return b.value - a.value || (a.label < b.label ? -1 : 1); });
    var blocked = C('M15', 'distinct_blocked_units', o) || 0;
    if (!rows.length) {
      var den = C('M15', 'denominator', o) || 0;
      sec.appendChild(el('p', { class: 'notice' }, [den === 0 ? 'No unit in this view is required at this stage: ' + lc(STAGE_LABEL[s.stage]) + '. Nothing can be blocked here; choose a client the stage applies to, or reset the filters.' :
        'No unit is blocked or conflicting at this stage in this view: ' + n(den) + ' units, ' + n(C('M15', 'ready', o)) + ' ready, ' + n(C('M15', 'unassessable', o)) + ' unassessable.']));
      return sec;
    }
    rows[0].emph = true;
    var top = rows[0];
    // R1-13 finding 18: split the blocked-or-conflicting total from the cells, never assume there are no conflicts.
    var nBlk = C('M15', 'blocked', o), nConf = C('M15', 'conflicting', o);
    var split = nBlk === null || nConf === null ? '' : (nConf === 0 ? 'None of the ' + n(blocked) + ' is conflicting in this view: all ' + n(nBlk) + ' are blocked by a missing fact.'
      : 'Of the ' + n(blocked) + ', ' + n(nBlk) + ' are blocked (a required fact is missing) and ' + n(nConf) + ' conflicting (sources disagree on a required fact)' + (nBlk + nConf === blocked ? '.' : '; a unit can be both, so these overlap.'));
    var title = top.value === blocked ? 'Every one of the ' + n(blocked) + ' blocked or conflicting ' + lc(STAGE_LABEL[s.stage]) + ' units lacks ' + top.label.toLowerCase()
      : top.label + ' is missing for ' + n(top.value) + ' of the ' + n(blocked) + ' blocked or conflicting ' + lc(STAGE_LABEL[s.stage]) + ' units';
    // Replace the long-tail graphic with the same exact counts and an action.
    // No new measure, percentage target, scale break or inferred "other" bucket.
    sec.appendChild(el('div', { class: 'blocker-focus' }, [
      el('div', null, [el('p', { class: 'eyebrow' }, ['Largest evidence gap · M15']),
        el('h3', null, [top.label]),
        el('p', { class: 'blocker-value' }, [n(top.value)]),
        el('p', null, ['of ' + n(blocked) + ' blocked or conflicting units lack this required fact']),
        el('p', { class: 'small' }, [n(C('M15', 'denominator', o)) + ' required units at ' + lc(STAGE_LABEL[s.stage]) + '. A unit can lack several facts; rows below overlap.']),
        el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { go({ field: top.field }); } }, ['Inspect affected units ↗'])]),
      el('div', { class: 'blocker-context' }, [el('h4', null, ['What to investigate']),
        el('p', null, [FIELD_NOTE[top.field] || 'Obtain source support for the required fact before treating this target as ready.']),
        el('p', { class: 'small' }, [split]),
        el('p', { class: 'small' }, [rows.length > 1 ? 'Next largest gap: ' + rows[1].label.toLowerCase() + ', ' + n(rows[1].value) + ' units. Every remaining fact is listed below.' : 'This is the only required-fact gap in this view.']),
        el('p', { class: 'small' }, ['Owner role: claims operations. Unknown payment is not evidence of nonpayment.'])])
    ]));
    sec.appendChild(el('div', { class: 'prov', 'data-segments': '4' }, [SOURCE + ' · as of ' + S.bundle.positions[s.pos].K.slice(0, 10) + ' (' + PROV_POS[s.pos] + ') · distinct units; missing facts are never filled · ' + stripView('M15')]));
    var trows = rows.map(function (r) {
      var b = el('button', { class: 'btn', type: 'button', onclick: function () { go({ field: r.field }); } }, ['Affected units']);
      return [r.label, r.value, pct(r.value, blocked), b];
    });
    sec.appendChild(table({ id: 'm15-missing-' + s.stage, caption: 'Required facts behind blocked or conflicting units (M15 explanatory submeasures)', header: ['Required fact', 'Units', 'Share of blocked / conflicting', 'Drill'],
      rows: trows, num: [1, 2], measures: ['M15'], stack: true, filters: { client: s.client, period: s.period, stage: s.stage },
      note: 'All blocked or conflicting units at this stage: ' + n(blocked) + ' of ' + n(C('M15', 'denominator', o)) + '. ' + (split ? split + ' ' : '') + 'Rows overlap because a unit can lack several facts.' }));
    if (s.field) sec.appendChild(affectedUnits(s.field));
    return sec;
  }

  function affectedUnits(field) {
    var s = S.st, list = ((S.blockers[s.pos] || {})[s.stage] || {})[field] || [];
    var lo = S.bundle.periods[s.period][0], hi = S.bundle.periods[s.period][1];
    var inView = list.filter(function (x) { var c = clientOf(x[0]); return (s.client === 'ALL' || c === s.client || (S.bundle.profiles_by_filter[s.client] || []).indexOf(c) >= 0) && x[1] >= lo && x[1] <= hi; });
    var box = el('div', { class: 'panel', id: 'affected' }, [el('h3', null, ['Units blocked by: ' + (FIELD_LABEL[field] || field)]),
      el('p', { class: 'small' }, ['Owner role: claims operations. Suggested next action, not recorded outreach: obtain source support for ' + (FIELD_LABEL[field] || field).toLowerCase() + '. Each stage has its own governed deadline (initial preparation 24 h, submission 48 h from its trigger). Open a unit to inspect its applicable due time and due state at the selected business and knowledge cutoffs. A missing fact alone does not establish lateness.'])]);
    var rows = inView.map(function (x) {
      var parts = x[0].split('|');
      return [el('a', { href: hashOf(Object.assign({}, s, { view: 'b', rec: parts[1], field: '' })) }, [parts[1]]), parts[0], parts[2], parts[3] + ' / ' + parts[4], x[1]];
    });
    box.appendChild(table({ id: 'affected-' + field, caption: 'Showing ' + n(inView.length) + ' of ' + n(list.length) + ' affected units at this position (the remainder are outside the current client or period filter)',
      header: ['Source item', 'Client', 'Component', 'Recipient / purpose', 'Service date'], rows: rows, maxRows: 60, measures: ['M15'], stack: true }));
    box.appendChild(el('button', { class: 'btn', type: 'button', onclick: function () { go({ field: '' }); } }, ['Close the affected-unit list']));
    return box;
  }

  function downstreamSection() {
    var s = S.st;
    var sec = el('section', { 'aria-labelledby': 'down-h' }, [el('h2', { id: 'down-h' }, ['Downstream consequences'])]);
    // R1-13 finding 12: name where M13 and M16 are, and link their definitions, rather than pointing at something off this section.
    var defLink = function (m, label) { return el('a', { href: hashOf(Object.assign({}, s, { view: 'c', rec: m })) }, [label]); };
    sec.appendChild(el('p', { class: 'small' }, ['Three different populations follow: completed legs (M01, M02, M04 and M07, in this section), first-submitted encounter families (M03 and M05 in this section; ',
      defLink('M13', 'M13'), ' in the residual panel at the foot of this view) and required reporting units (', defLink('M16', 'M16'), ', the third card under “What needs attention in this selection?”). Their counts are not meant to equal one another.']));
    var m01n = C('M01', 'numerator'), m01d = C('M01', 'denominator'), cu = C('M01', 'C_unresolved');
    var cf = effClient('M03');
    var m03 = function (k) { return C('M03', k, { period: 'FULL', client: cf }); };
    var grid = el('div', { class: 'grid-3' }, [
      card('M01', 'Source-evidenced accepted completed-leg coverage', pct(m01n, m01d), n(m01n) + ' of ' + n(m01d) + ' reportable completed legs',
        [['Unresolved applicability, held apart', cu], ['Uncovered', C('M02', 'uncovered')]],
        'Population C. Every required target and component must have originating or forwarded acceptance; client assertions never count. Evidenced coverage, not an estimate of unseen outcomes.', hashOf(Object.assign({}, s, { view: 'c', rec: 'M01' }))),
      card('M03', 'First-pass acceptance, first-submission cohort', pct(m03('accepted'), m03('families')), n(m03('accepted')) + ' of ' + n(m03('families')) + ' first-submitted families',
        [['Rejected', m03('rejected')], ['Unresolved', m03('unresolved')], ['Conflicted', m03('conflicted')]],
        'Population S: families first submitted by T and known by K. The service-period filter does not apply to this cohort.', hashOf(Object.assign({}, s, { view: 'c', rec: 'M03' }))),
      card('M05', 'Timed receipt obligations', n(C('M05', 'receipt:overdue', { period: 'FULL', client: cf })) + ' overdue',
        'of ' + n(C('M05', 'expected_timed_receipts', { period: 'FULL', client: cf })) + ' expected timed receipts',
        // R1-13 finding 11: the headline count is its own row, and follow-ups are a different object (client follow-up obligations, not receipts).
        [['Receipts on time', C('M05', 'receipt:satisfied_on_time', { period: 'FULL', client: cf })], ['Receipts late', C('M05', 'receipt:satisfied_late', { period: 'FULL', client: cf })], ['Receipts pending', C('M05', 'receipt:pending', { period: 'FULL', client: cf })],
         ['Receipts overdue', C('M05', 'receipt:overdue', { period: 'FULL', client: cf })]]
          .concat(C('M05', 'receipt:justifiably_cancelled', { period: 'FULL', client: cf }) ? [['Receipts justifiably cancelled', C('M05', 'receipt:justifiably_cancelled', { period: 'FULL', client: cf })]] : [])
          .concat([['No return promise (untimed; not in the total)', C('M05', 'untimed:no_return_promise', { period: 'FULL', client: cf })],
         ['Client follow-up obligations overdue (not receipts; of ' + n(C('M05', 'follow_up:expected', { period: 'FULL', client: cf })) + ' follow-ups, not in the total)', C('M05', 'follow_up:overdue', { period: 'FULL', client: cf })]]),
        'Receipt obligations of first-submitted deliveries' + (['satisfied_on_time', 'satisfied_late', 'pending', 'overdue', 'justifiably_cancelled'].reduce(function (a, k) { return a + (C('M05', 'receipt:' + k, { period: 'FULL', client: cf }) || 0); }, 0) === C('M05', 'expected_timed_receipts', { period: 'FULL', client: cf }) ? '; the receipt rows sum to the expected timed receipts' : '') + '. Timeliness uses received time; an unavailable route creates no receipt promise. Follow-up obligations ask the client for a record-specific answer and are counted separately.', hashOf(Object.assign({}, s, { view: 'c', rec: 'M05' })))
    ]);
    sec.appendChild(grid);
    if (s.period !== 'FULL') sec.appendChild(el('p', { class: 'restricted' }, ['M03 and M05 show the full first-submission cohort: ' + S.bundle.measures.M03.supported.restriction]));
    // M02 partition chart
    var keys = ['no_evidence', 'client_asserted_only', 'rejected', 'partial_required_components', 'not_submitted', 'unresolved', 'conflicted', 'missing_claim', 'voided'];
    var horizon = S.bundle.positions[s.pos].T.slice(0, 10);
    // R1-13 finding 22: the first-applicable order is read from the register's own M02 population clause (backticked states, in order).
    var precClause = ((((S.bundle.register || {}).measures || {}).M02 || {}).clauses || {}).Population || '';
    var prec = []; (precClause.match(/`([a-z_]+)`/g) || []).forEach(function (t) { var k = t.replace(/`/g, ''); if (keys.indexOf(k) >= 0 && prec.indexOf(k) < 0) prec.push(k); });
    var hasPrec = prec.length === keys.length;
    var allRows = keys.map(function (k) { var base = k === 'not_submitted' ? 'Not submitted by ' + horizon : M02_LABEL[k]; return { k: k, base: base, order: hasPrec ? prec.indexOf(k) + 1 : null, label: (hasPrec ? (prec.indexOf(k) + 1) + '. ' : '') + base, cell: C('M02', k), value: C('M02', k) || 0 }; });
    var rows = allRows.filter(function (r) { return r.value > 0; });
    // R1-13b finding 2: reasons whose published cell is exactly 0 are named as zero (never assumed from a missing bar);
    // a reason with no published cell is not called zero.
    var zeroRows = allRows.filter(function (r) { return r.cell === 0; });
    zeroRows.sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    var unc = C('M02', 'uncovered');
    rows.sort(function (a, b) { return b.value - a.value; });
    if (rows.length) {
      rows[0].emph = true;
      var one = zeroRows.length === 1;
      var zeroText = zeroRows.length ? (one ? 'One reason has no legs, so no bar: ' : n(zeroRows.length) + ' reasons have no legs, so no bar: ') +
        zeroRows.map(function (r) { return (r.order ? r.order + ' ' : '') + lc(r.base); }).join(', ') + (one ? ' (its published cell is 0). It is listed as a zero row' : ' (each published cell is 0). They are listed as zero rows') + ' in the table below.' : null;
      var precText = hasPrec ? 'Each uncovered leg is counted once, under the first reason that applies; the number before each reason is its place in that order (' + prec.map(function (k, i) { return (i + 1) + ' ' + lc(M02_LABEL[k]); }).join(', ') + ')'
        : 'Each uncovered leg is counted once, under the first reason that applies (order in the definitions view)';
      var fig = hbar({ id: 'uncovered', measure: 'M02', title: rows[0].base + ' is the largest reason these completed legs lack source-evidenced acceptance',
        // R1-13b finding 1: the short title keeps the part-of-whole.
        shortTitle: rows[0].base + ' is the largest reason these completed legs are uncovered',
        markNote: pct(rows[0].value, C('M02', 'uncovered')) + ' of uncovered legs',
        subtitle: 'A leg is one completed ride in the source census. Each uncovered leg is counted once, under the first reason that applies. Numbered labels show the rule order; the table below includes every reason, including zeros. The bars sum to ' + n(unc) + ' of the ' + n(m01d) + ' reportable completed legs. Bar labels are rounded to three significant figures; readouts, the table and exports retain exact counts.',
        note: zeroText,
        rows: rows.map(function (r) { return { label: r.label, value: r.value, emph: r.emph }; }),
        summary: 'Horizontal bar chart of ' + rows.length + ' mutually exclusive explanation states for uncovered completed legs, from ' + n(rows[rows.length - 1].value) + ' to ' + n(rows[0].value) + ' legs; total ' + n(C('M02', 'uncovered')) + '.',
        source: SOURCE, flags: 'synthetic data: the outcome mix is set by design, not a measured real-world rate' });
      sec.appendChild(fig);
      sec.appendChild(table({ id: 'm02', caption: 'Uncovered completed legs by explanation (M02)', header: ['Explanation state', 'First-applicable order', 'Legs', 'Share of uncovered', 'Share of reportable'], stack: true,
        rows: rows.concat(zeroRows).map(function (r) { return [r.base, r.order === null ? 'see definitions' : r.order + ' of ' + prec.length, r.value, pct(r.value, unc), pct(r.value, m01d)]; }), num: [2, 3, 4], measures: ['M01', 'M02'],
        note: 'Covered (source-evidenced acceptance at every required target): ' + n(m01n) + ' legs; uncovered ' + n(unc) + '; unresolved applicability held apart: ' + n(cu) + '.' }));
    }
    sec.appendChild(el('details', { class: 'fold', id: 'evidence-follow-up-guide' }, [
      el('summary', null, ['Turn an evidence gap into a follow-up']),
      el('p', null, ['Use the client filter to narrow these counts, then match that client to its recipient and return route in the routes table below. Counts for a client with two targets do not identify which target is missing; open the record to inspect each delivery.']),
      el('p', { class: 'small' }, ['For source-response routes, encounter operations would request the originating final decision, its supported effective time and its delivery/component identity. For client-note or unavailable routes, the client contact would need to obtain that source evidence or establish a stronger return route. A note alone never becomes receiver acceptance. These are suggested actions, not recorded outreach or a promise that a recipient can supply a result.']),
      el('p', { class: 'small' }, ['Record-level examples are available in Follow a claim. Full frozen lists of uncovered legs and receipt obligations are available under Evidence files in Understand the data. No personal contacts or real-world escalation agreements exist in this synthetic pack.']),
      el('div', { class: 'btn-row' }, [jumpButton('rt-h', 'Match client to route ↓'), el('a', { class: 'btn', href: hashOf(Object.assign({}, s, { view: 'b', rec: 'SYN-C03:S000001', story: 'DEMO04' })) }, ['Inspect a delivery ↗']), el('a', { class: 'btn', href: 'index.html?jump=evidence-files#view=c' }, ['Open evidence files ↗'])])
    ]));
    // M04, M07 table
    sec.appendChild(table({ id: 'm04-m07', caption: 'Coverage at each deadline (M04) and time to first valid acceptance (M07)', header: ['Measure', 'Value', 'Population and note'], num: [1], measures: ['M04', 'M07'], stack: true,
      rows: [['M04 covered at every own deadline', n(C('M04', 'numerator')) + ' of ' + n(C('M04', 'denominator')), 'Fully due completed legs; each component judged at its own deadline. Partly due ' + n(C('M04', 'partly_due')) + ', not yet due ' + n(C('M04', 'not_yet_due')) + ', timing undetermined ' + n(C('M04', 'timing_undetermined')) + '.'],
             ['M07 legs ever fully accepted', n(C('M07', 'accepted')) + ' of ' + n(C('M07', 'population')), 'Never yet accepted ' + n(C('M07', 'never_yet_accepted')) + '. Median ' + hrs(C('M07', 'median_hours')) + ', 90th percentile ' + hrs(C('M07', 'p90_hours')) + ' from completion, over accepted legs only.' + m04m07Note()]] }));
    return sec;
  }

  // R1-13 finding 13: M04 and M07 are different measures (metric_register.md): M04 counts fully due legs covered at their own
  // deadline, M07 counts legs ever fully accepted. They can coincide only when every leg is fully due and no leg was first
  // accepted after its deadline; the note says so from the cells, and says nothing when they differ.
  function m04m07Note() {
    var a = C('M04', 'numerator'), b = C('M07', 'accepted'), d4 = C('M04', 'denominator'), d7 = C('M07', 'population');
    if (a === null || a !== b) return '';
    return ' M04 and M07 both read ' + n(a) + ' in this population, but not by definition: ' +
      (d4 === d7 ? 'every one of the ' + n(d7) + ' legs is fully due, and no accepted leg was first fully accepted after its deadline. ' : 'the two measures have different populations (' + n(d4) + ' and ' + n(d7) + '). ') +
      'A leg accepted late would count in M07 but not in M04.';
  }

  function routesSection() {
    var s = S.st;
    var sec = el('section', { 'aria-labelledby': 'rt-h' }, [el('h2', { id: 'rt-h' }, ['Profile, evidence route and target are separate attributes'])]);
    sec.appendChild(el('p', { class: 'small' }, ['Rows follow client order, not rank. Each client’s evidence route is a disclosed synthetic policy; Willow Bay Health Plan, Maple Vale Health Plan and Cypress Grove Health Plan cannot establish source-evidenced acceptance through their configured v1 routes. Differences between rows are design choices, not performance findings.']));
    // R1-13 finding 10: M16 is published per client, not per target. A client with several targets prints its counts once, on its
    // first row, attributed to all of its targets; its other rows point back to that row. The total row reads the all-clients
    // cells, so each unit is counted once.
    var subs = ['required_units', 'source_evidenced_outcomes', 'basis:record_specific_client_assertion', 'basis:aggregate_only_assertion', 'basis:no_usable_evidence'];
    var rows = [], multi = [];
    S.bundle.clients.forEach(function (c) {
      var o = { client: c.client_id }, many = c.targets.length > 1;
      if (many) multi.push(c);
      c.targets.forEach(function (t, i) {
        var counts = i === 0 ? subs.map(function (k) { return C('M16', k, o); }) : subs.map(function () { return 'see above'; });
        var cover = !many ? 'this target' : (i === 0 ? (c.targets.length === 2 ? 'both' : 'all ' + c.targets.length) + ' ' + c.client_id + ' targets' : 'in the row above');
        rows.push([c.client_id, c.profile_id, t.recipient + ' / ' + t.purpose, t.route.replace(/_/g, ' '), BASIS_LABEL[t.evidence_basis] || t.evidence_basis, t.stage_expectations.encounter_decision.replace(/_/g, ' '), cover].concat(counts));
      });
    });
    var all = { client: 'ALL' };
    var foot = ['All clients', '', '', '', '', '', 'each unit once'].concat(subs.map(function (k) { return C('M16', k, all); }));
    var sumsUp = subs.every(function (k) { return S.bundle.clients.reduce(function (a, c) { return a + (C('M16', k, { client: c.client_id }) || 0); }, 0) === C('M16', k, all); });
    // Whether a multi-target client's targets share units: each unit is one component for one recipient and purpose, so they never
    // do; the per-stage split comes from the M15 denominators and is printed only when it adds up to the client's M16 units.
    var stageOf = { encounter: 'encounter_submission', audit: 'audit_submission' };
    var shareNote = multi.map(function (c) {
      var o = { client: c.client_id }, req = C('M16', 'required_units', o);
      var parts = c.targets.map(function (t) { return { t: t, v: stageOf[t.purpose] ? C('M15', 'denominator', { client: c.client_id, stage: stageOf[t.purpose] }) : null }; });
      var sum = parts.reduce(function (a, p) { return a + (p.v || 0); }, 0), ok = parts.every(function (p) { return p.v !== null; }) && sum === req;
      return c.client_id + '’s ' + c.targets.length + ' rows do not share units: a unit is one service component for one recipient and purpose, so its ' + n(req) + ' required units are divided between its targets' +
        (ok ? ' (' + parts.map(function (p) { return n(p.v) + ' ' + p.t.recipient + ' ' + p.t.purpose; }).join(', ') + ', from the M15 stage denominators)' : '') + '. When the same claim version is sent to both recipients, both deliveries carry the same payload hash; units are counted per target, never per payload.';
    }).join(' ');
    // R1-13b finding 11: the total counts required units at every target; the blocking chart counts one stage. The audit
    // count that makes the difference is read from the M15 stage denominators and printed only when the arithmetic holds.
    var reqAll = C('M16', 'required_units', all), encAll = C('M15', 'denominator', { client: 'ALL', stage: 'encounter_submission' }), audAll = C('M15', 'denominator', { client: 'ALL', stage: 'audit_submission' });
    var audClients = S.bundle.clients.filter(function (c) { return c.targets.some(function (t) { return t.purpose === 'audit'; }); }).map(function (c) { return c.client_id; });
    var stageNote = reqAll !== null && encAll !== null && audAll !== null && encAll + audAll === reqAll && audAll > 0 ?
      ' The total of ' + n(reqAll) + ' required units counts every target, encounter and audit; the “What blocks” panel above counts one readiness stage, and for all clients at ' + lc(STAGE_LABEL.encounter_submission) + ' (its default) that is ' + n(encAll) + ' units. The difference is the ' + n(audAll) + ' audit submission units' + (audClients.length ? ' (' + audClients.join(', ') + ')' : '') + ': ' + n(encAll) + ' + ' + n(audAll) + ' = ' + n(reqAll) + '.' : '';
    sec.appendChild(table({ id: 'routes', caption: 'Clients, profiles, routes and reporting-unit evidence (M16 counts are published per client)', stack: true, wrapHead: true,
      header: ['Client', 'Profile', 'Recipient / purpose', 'Evidence route', 'Route’s strongest basis', 'Final-decision return', 'Counts cover', 'Required units', 'Source-evidenced outcomes', 'Client assertion', 'Aggregate note', 'No usable evidence'],
      rows: rows, foot: foot, num: [7, 8, 9, 10, 11], measures: ['M16'], filters: { client: 'per row', period: s.period },
      note: 'The total row reads the all-clients cells, so each unit is counted once' + (sumsUp ? '; with each client’s counts printed once, the client rows add up to it' : '') + '.' + stageNote + ' ' + shareNote }));
    var composition = (S.bundle.reporting_unit_composition || {})[s.pos] || {};
    var cancellationNotes = S.bundle.clients.map(function (c) {
      var counts = (composition[c.client_id] || {})[s.period];
      if (!counts || !counts.documented_cancelled_units) return '';
      if (counts.completed_units + counts.documented_cancelled_units !== counts.required_units || counts.required_units !== C('M16', 'required_units', { client: c.client_id })) return '';
      return c.client_id + ': ' + n(counts.completed_units) + ' completed-service units + ' + n(counts.documented_cancelled_units) + ' documented-cancellation units = ' + n(counts.required_units) + ' required units. Profile ' + c.profile_id + ' requires the cancellation disposition to be reported.';
    }).filter(Boolean);
    if (cancellationNotes.length) sec.appendChild(el('p', { class: 'small', id: 'route-unit-composition' }, [cancellationNotes.join(' ')]));
    return sec;
  }

  function financialSection() {
    var s = S.st;
    var det = el('details', { class: 'fold' }, [el('summary', null, ['Typed financial evidence and allocation (M17)'])]);
    det.appendChild(el('p', { class: 'small' }, ['Each amount keeps its own type, party and source. Unknown is never zero; a later payment would be new evidence, not a repair. No universal charge-minus-payment balance is claimed.']));
    var rows = SLOT_TYPES.map(function (t) {
      return [t.replace(/_/g, ' '), C('M17', t + ':expected_slots'), C('M17', t + ':known'), C('M17', t + ':evidenced_derived_zero'), C('M17', t + ':unknown'), C('M17', t + ':not_yet_expected'), C('M17', t + ':not_applicable'), C('M17', t + ':conflicting')];
    });
    det.appendChild(table({ id: 'm17-slots', caption: 'Expected financial slots by type and state', header: ['Type', 'Expected slots', 'Known', 'Evidenced zero', 'Unknown', 'Not yet expected', 'Not applicable', 'Conflicting'], rows: rows, num: [1, 2, 3, 4, 5, 6, 7], measures: ['M17'], stack: true }));
    det.appendChild(table({ id: 'm17-settlements', caption: 'Settlement events and their allocation (USD)', header: ['Settlement events', 'Balanced', 'Event total', 'Allocated', 'Unapplied'], num: [0, 1, 2, 3, 4], measures: ['M17'],
      rows: [[C('M17', 'settlements:count'), C('M17', 'settlements:balanced'), C('M17', 'settlements:event_total'), C('M17', 'settlements:allocated_total'), C('M17', 'settlements:unapplied_total')]] }));
    return det;
  }

  function residualSection() {
    var s = S.st, cf11 = effClient('M11'), cf18 = effClient('M18'), per18 = effPeriod('M18');
    var sec = el('details', { class: 'fold' }, [el('summary', null, ['Accepted-payload conformance, out-of-scope residuals and rejection reasons (M11, M12, M13, M18)'])]);
    var o = { period: 'FULL', client: cf11 }, o18 = { period: per18, client: cf18 };
    function scopeOf(m, oo) { return (CF_LABEL[oo.client] || oo.client) + ', ' + (oo.period === 'FULL' ? 'full period' : lc(PERIOD_LABEL[oo.period])) + ', ' + posWords(s.pos); }
    function keys(m, subs, oo) { return subs.map(function (x) { return cellKey(m, x, s.pos, oo.client, oo.period, '-'); }); }
    var defs = [
      ['M11', o, ['conforming', 'definitively_active', 'mismatch', 'unassessable'], 'M11 accepted payloads conforming to the bound claim and source', n(C('M11', 'conforming', o)) + ' of ' + n(C('M11', 'definitively_active', o)), 'Accepted, definitively active payloads of first-submitted families; mismatch ' + n(C('M11', 'mismatch', o)) + ', unassessable ' + n(C('M11', 'unassessable', o)) + '.'],
      ['M12', o, ['explicitly_nonreportable_families', 'active_accepted_families', 'unknown_scope_families'], 'M12 accepted families outside any reporting requirement', n(C('M12', 'explicitly_nonreportable_families', o)), 'Of ' + n(C('M12', 'active_accepted_families', o)) + ' accepted families; unknown scope ' + n(C('M12', 'unknown_scope_families', o)) + '. Required cancelled reports are in U and are never over-reporting.'],
      ['M13', o, ['reason:other_terminal_rejection', 'denominator', 'stage:encounter_decision'], 'M13 first-attempt rejections, other terminal rejection', n(C('M13', 'reason:other_terminal_rejection', o)) + ' of ' + n(C('M13', 'denominator', o)), 'The synthetic receiver emits no reason text, so the actual stage is kept: encounter decision ' + n(C('M13', 'stage:encounter_decision', o)) + '.'],
      ['M18', o18, ['conforming', 'versions', 'mismatch', 'unassessable', 'fields_compared'], 'M18 claim versions conforming to source', n(C('M18', 'conforming', o18)) + ' of ' + n(C('M18', 'versions', o18)), 'Latest version per family at T; mismatch ' + n(C('M18', 'mismatch', o18)) + ', unassessable ' + n(C('M18', 'unassessable', o18)) + '. Fields compared ' + n(C('M18', 'fields_compared', o18)) + '.']];
    var mixed = defs.some(function (d) { return d[1].period !== defs[0][1].period || d[1].client !== defs[0][1].client; });
    if (mixed) sec.appendChild(el('p', { class: 'restricted' }, ['Mixed scope: M11, M12 and M13 are measured on the full first-submission cohort (the service-period filter does not apply to them), while M18 follows the selected period. Each row states its own scope, and the CSV manifest lists every row\'s exact cell keys.']));
    sec.appendChild(table({ id: 'residuals', caption: 'Accepted content and residual populations' + (mixed ? ' (mixed scope: see the Scope column)' : ''), header: ['Measure', 'Count', 'Population', 'Scope'], num: [1], measures: ['M11', 'M12', 'M13', 'M18'], stack: true,
      rows: defs.map(function (d) { return [d[3], d[4], d[5], scopeOf(d[0], d[1])]; }),
      rowScopes: defs.map(function (d) { return { measure: d[0], client: d[1].client, period: d[1].period, position: s.pos, cell_keys: keys(d[0], d[2], d[1]) }; }) }));
    return sec;
  }

  // ---------------------------------------------------------------- View B
  function renderB(app) {
    headerBlock(app, 'Cascadia Claim Integrity / Follow a claim', 'Follow one claim.<br>See why the action <span class="serif">changes.</span>',
      'A missing billing fact and a rejected report need different follow-ups. Trace the supporting records, see what changed and inspect the evidence behind the next action.');
    explanatoryHero(app, {
      label: 'The analyst’s job', title: 'Find the fact. Explain the consequence.',
      prompts: ['What information is missing?', 'Does the new information make this record ready?', 'Is the reporting outcome confirmed, rejected or still unknown?'],
      actions: [jumpButton('story-h', 'Follow the example ↓', 'btn-dark'), el('a', { class: 'btn', href: '#view=b&rec=SYN-C03%3AS000001&story=DEMO04' }, ['Try the grouped claim ↗'])]
    });
    followClaimEntry(app);
    var s = S.st;
    var input = el('input', { id: 'rec-q', type: 'search', value: s.rec, 'aria-label': 'Record identifier', placeholder: 'SYN-C01:S000001, SYN-C05:Q002001, SYN-C03:CL001, a P unit id or a delivery id' });
    var searchSection = el('section', { class: 'record-search', 'aria-labelledby': 'record-search-h' }, [
      el('p', { class: 'eyebrow' }, ['Optional / Detailed record explorer']), el('h2', { id: 'record-search-h' }, ['Open a record']),
      el('p', { class: 'small' }, ['Search by request or service, preparation unit, claim family or version, or encounter family and delivery. Fields retain their observed, joined, derived or missing support.']),
      el('form', { class: 'search', onsubmit: function (e) { e.preventDefault(); go({ rec: input.value.trim(), story: '' }); } }, [input, el('button', { class: 'btn btn-dark', type: 'submit' }, ['Open record'])])
    ]);
    var recordTools = el('details', { class: 'fold record-tools' }, [el('summary', null, ['Find another record or compare cutoffs']), searchSection, browse()]);
    app.appendChild(recordTools);
    app.appendChild(el('p', { class: 'small position-strip' }, ['Position: ', el('strong', null, [POS_LABEL[s.pos]]), ' (' + posWords(s.pos) + '). ' + POS_DESC[s.pos] + ' ',
      el('a', { href: hashOf(Object.assign({}, s, { pos: 'known_then' })) }, ['Known then']), ' · ', el('a', { href: hashOf(Object.assign({}, s, { pos: 'restated_then' })) }, ['Restated then']), ' · ',
      el('a', { href: hashOf(Object.assign({}, s, { pos: 'current_later' })) }, ['Current later'])]));
    followClaimSnapshots(app);
    var story = s.story ? ((S.extra.stories || {}).stories || []).filter(function (x) { return x.id === s.story; })[0] : null;
    if (story) { var storyNode = storyPanel(story);followStoryBusiness(storyNode);app.appendChild(storyNode); }
    var holder = el('div', { id: 'rec-holder' }, [el('p', { class: 'loading' }, [s.rec ? 'Loading record…' : ''])]);
    app.appendChild(holder);
    recordTools.id = 'follow-record-tools';app.appendChild(recordTools);
    if (!s.rec) { holder.innerHTML = ''; holder.appendChild(browse()); return; }
    if (s.rec.indexOf('MINI:') === 0) {
      holder.innerHTML = '';var mini = miniature(s.rec);mini.id = 'follow-selected';holder.appendChild(mini);
      mini.insertBefore(el('p', { class: 'follow-mini-note' }, ['This labeled test example isolates a business rule. It is outside the operational population and does not add to the report’s counts.']), mini.querySelector(':scope > .restricted'));
      if (s.story === 'DEMO02') {
        var scope = el('div', { class: 'follow-mini-note' });mini.querySelector('.follow-mini-note').replaceWith(scope);
        scope.replaceChildren(el('strong', null, ['Why this example has fewer sections']),
          el('p', null, ['These focused test cases and a labeled submission copy isolate how an accepted record can still be wrong. They do not contain a complete ride history.']),
          el('ul', null, [
            el('li', null, [el('strong', null, ['Included: ']), 'the evidence and comparisons needed for each check, followed by the walkthrough.']),
            el('li', null, [el('strong', null, ['Intentionally absent: ']), 'the full ride summary, next action and expandable chapters for source facts, claim versions, readiness and response, financial details, evidence arrival and snapshot comparisons.'])]));
        mini.insertBefore(scope, mini.querySelector('h2').nextSibling);
      }
      if (storyNode) holder.insertAdjacentElement('afterend', storyNode);
      return;
    }
    var client = clientOf(s.rec);
    if (!client) { holder.innerHTML = ''; holder.appendChild(el('p', { class: 'notice' }, ['No record matches "' + s.rec + '". Identifiers carry their client prefix, for example SYN-C01:S000001.'])); return; }
    shard(client).then(function (sh) {
      holder.innerHTML = '';
      var record = recordView(sh, s.rec);
      holder.appendChild(record);
      var context = record.querySelector('.record-context');
      if (context) {
        var detail = el('details', { class: 'fold record-inspector' }, [el('summary', null, ['Inspect source facts, claim versions, financial details and timeline'])]);
        Array.from(record.children).filter(function (node) { return node !== context; }).forEach(function (node) { detail.appendChild(node); });
        record.appendChild(detail);
        followRecordBusiness(app, record, sh, s.rec);
      }
    }).catch(function (e) { holder.innerHTML = ''; holder.appendChild(el('p', { class: 'notice' }, ['The record shard could not be loaded: ' + e.message])); });
  }

  // Presentation-only View B guidance reads the existing selected-position record states.
  var followOpenSections = null;
  function followStoryBusiness(story) {
    story.id = 'follow-story';story.classList.add('follow-story');
    var names = { DEMO01: 'Walk through the missing identifier and the later rejection.', DEMO02: 'Find where an accepted record became wrong.', DEMO03: 'Compare what each response route can establish.', DEMO04: 'Follow the grouping and reporting requirements.', DEMO05: 'Trace costs, charges and payments separately.' };
    if (names[S.st.story]) story.querySelector('#story-h').textContent = names[S.st.story];
    var focused = S.st.story === 'DEMO02', testCase = S.st.rec.indexOf('MINI:') === 0;
    story.querySelector('#story-h').insertAdjacentElement('afterend', el('div', { class: 'follow-walkthrough-scope' }, [
      el('span', { class: 'follow-scope' }, [focused ? 'Fixed test sequence · snapshot does not change these cases' : testCase ? 'Fixed walkthrough · selected test case is not snapshot-filtered' : 'Fixed walkthrough · summary follows the snapshot']),
      el('p', null, [focused ? 'These focused cases stay fixed when the snapshot changes. Select a step to open its named test case or the submission copy at its stated snapshot.' : testCase ? 'This guide keeps its full sequence. The selected test case is not filtered by snapshot; use a step link to open that step’s named record and snapshot.' : 'The summary below follows the snapshot selector. This guide keeps its full sequence; select a step to open its named record and snapshot. Focused test cases stay fixed.'])
    ]));
    story.querySelectorAll('.steps > li > p.small').forEach(function (paragraph) {
      var points = paragraph.textContent.split(/(?<=[.!?])\s+(?=[A-Z])/);
      paragraph.replaceWith(el('ul', { class: 'small follow-step-points' }, points.map(function (point) { return el('li', null, [point]); })));
    });
    if (S.st.story === 'DEMO01') story.insertBefore(el('p', { class: 'follow-step-note' }, ['The July 21 snapshot contains both the corrected claim’s readiness and the returned rejection. Those steps inspect the same later record from two different business questions.']), story.querySelector('.steps'));
    Array.from(story.querySelectorAll(':scope > p')).forEach(function (p) {
      if (p.textContent.indexOf('Every step\'s binding') !== 0) return;
      var detail = el('details', { class: 'fold follow-route-proof' }, [el('summary', null, ['How the example steps connect to the frozen records'])]);
      p.replaceWith(detail);detail.appendChild(p);
    });
  }
  function followClaimEntry(app) {
    var hero = app.querySelector('.hero');hero.classList.add('follow-hero');
    var copy = hero.querySelector('.hero-copy');
    copy.insertBefore(el('ul', { class: 'follow-hero-points' }, [
      el('li', null, [el('strong', null, ['Before sending: ']), 'find the missing support or conflicting fact.']),
      el('li', null, [el('strong', null, ['After sending: ']), 'separate the recipient’s decision from a missing response.'])
    ]), copy.querySelector('.hero-actions'));
    var guide = hero.querySelector('aside');guide.id = 'follow-how';guide.replaceChildren();
    guide.appendChild(el('p', { class: 'eyebrow' }, ['How to read the record']));
    guide.appendChild(el('h2', null, ['Four handoffs. Four different checks.']));
    guide.appendChild(el('ol', { class: 'follow-chain', 'aria-label': 'The evidence chain and the question at each handoff' }, [
      ['1', 'Source facts', 'What do the ride, health-plan and billing records actually say?'],
      ['2', 'Claim version', 'Were those facts connected correctly, with missing support still visible?'],
      ['3', 'Sent record', 'Which exact version and components went to this recipient?'],
      ['4', 'Recipient decision', 'Is there a supported acceptance or rejection, or is the outcome still unknown?']
    ].map(function (x) { return el('li', null, [el('span', { class: 'follow-node', 'aria-hidden': 'true' }, [x[0]]), el('h3', null, [x[1]]), el('p', null, [x[2]])]); })));
    guide.appendChild(el('p', { class: 'small' }, ['A claim supports a payment request. An encounter reports the service downstream. Ready, accepted and paid remain different conclusions.']));
    var titles = {
      DEMO01: ['A missing fact, then a rejection', 'See why obtaining a billing identifier and requesting a rejection reason are different jobs.'],
      DEMO02: ['Accepted, but still wrong', 'Find whether an error entered during claim assembly or when the sent record was created.'],
      DEMO03: ['The decision is hard to confirm', 'Compare an originating decision, a relayed response and a client’s note.'],
      DEMO04: ['One claim, several obligations', 'See grouped rides, a second reporting destination and cancellation rules.'],
      DEMO05: ['The amounts mean different things', 'Keep ride cost, claim charge and actual payments separate.']
    };
    var stories = ((S.extra.stories || {}).stories || []);
    // Reading order only: retain the frozen story identifiers, steps and evidence bindings.
    stories = stories.filter(function (story) { return story.id !== 'DEMO02'; }).concat(stories.filter(function (story) { return story.id === 'DEMO02'; }));
    var routes = el('section', { id: 'follow-routes', class: 'follow-routes' }, [el('p', { class: 'eyebrow' }, ['Choose a business question']), el('h2', null, ['Start with the gap, then inspect the record.'])]);
    var cards = el('div', { class: 'follow-route-grid' });
    stories.forEach(function (story, i) {
      var text = titles[story.id] || [story.title, story.teaser];
      var link = el('a', { id: 'follow-example-' + story.id, class: 'follow-route', href: storyHref(story, story.steps[0], Object.assign({}, S.st, { view: 'b' })), onclick: function (event) {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();link.focus({ preventScroll: true });
        var next = { view: 'b', rec: story.steps[0].rec || '', story: story.id }, position = stepPos(story.steps[0]);
        if (position) next.pos = position;
        go(next);
      } }, [el('span', { class: 'eyebrow' }, ['Example ' + (i + 1)]), el('h3', null, [text[0]]), el('p', null, [text[1]]), el('span', { class: 'follow-route-action' }, ['Open this example ↗'])]);
      if (story.id === 'DEMO02') {
        var description = link.querySelector(':scope > p'), copy = el('div', { class: 'follow-route-copy' });
        description.replaceWith(copy);copy.appendChild(description);
        copy.appendChild(el('div', { class: 'follow-route-scope' }, [el('strong', null, ['Focused test cases']), el('p', null, ['Full ride-record sections are intentionally absent.'])]));
      }
      if (S.st.story === story.id) link.setAttribute('aria-current', 'true');
      cards.appendChild(link);
    });
    routes.appendChild(cards);app.appendChild(routes);
  }

  function followClaimSnapshots(app) {
    var labels = { known_then: 'July 14 · information known then', restated_then: 'July 14 · with later evidence', current_later: 'July 21 · later snapshot' };
    var meanings = {
      known_then: 'Read the earlier business position using only information available by July 14.',
      restated_then: 'Keep the business date at July 14, but inspect evidence received by July 21. A claim version first available July 16 still cannot be sent on July 14.',
      current_later: 'Move both the business date and the information cutoff to July 21. Later claim versions and recipient decisions can now qualify.'
    };
    var original = app.querySelector('.position-strip');
    var select = el('select', { id: 'follow-position', onchange: function (event) {
      followOpenSections = { record: S.st.rec, keys: Array.from(app.querySelectorAll('details[data-follow-key][open]')).map(function (d) { return d.getAttribute('data-follow-key'); }) };
      go({ pos: event.target.value });
    } }, Object.keys(labels).map(function (key) { return el('option', { value: key, selected: key === S.st.pos }, [labels[key]]); }));
    var section = el('section', { id: 'follow-snapshot', class: 'follow-snapshot', 'aria-labelledby': 'follow-snapshot-h' }, [
      el('div', null, [el('p', { class: 'eyebrow' }, ['Inspect a point in the story']), el('h2', { id: 'follow-snapshot-h' }, ['Which information was available?']), el('label', { for: 'follow-position' }, ['Snapshot for the selected record']), select]),
      el('div', { class: 'follow-snapshot-meaning' }, [el('strong', null, [labels[S.st.pos]]), el('p', null, [meanings[S.st.pos]]), el('p', { class: 'small' }, ['These are fixed demonstration cutoffs, not filing deadlines or a 15-day submission rule.'])])
    ]);
    var exact = el('details', { class: 'fold follow-clock-details' }, [el('summary', null, ['Exact cutoffs and alternative snapshot links']), original]);
    app.appendChild(section);section.appendChild(exact);
    var story = app.querySelector('[aria-labelledby="story-h"]');
    if (story) story.id = 'follow-story';
  }

  function followRecordBusiness(app, record, sh, id) {
    var resolved = resolveRecord(sh, id);if (!resolved) return;
    var source = resolved.kind === 'leg' ? sh.legs[resolved.key] : sh.requests[resolved.key];
    var context = record.querySelector('.record-context');context.id = 'follow-selected';
    context.querySelector('#rec-h').textContent = resolved.kind === 'leg' ? 'What does this ride’s record establish?' : 'What does this request’s record establish?';
    context.querySelector('.rec-head').appendChild(el('p', { class: 'follow-record-key' }, [resolved.key + ' · service date ' + (source.sd || 'unknown')]));
    var client = S.bundle.clients.filter(function (c) { return c.client_id === sh.client; })[0];
    var identityTags = context.querySelectorAll('.rec-head .tag');
    if (client && identityTags[1]) identityTags[1].textContent = readerClientLabel(client.profile_id);
    context.querySelector('.record-summary-intro').textContent = 'Selected record · ' + ({ known_then: 'July 14, known then', restated_then: 'July 14, with later evidence', current_later: 'July 21, later snapshot' }[S.st.pos]) + '. These are three questions, not steps in a numerical funnel.';
    var original = context.querySelector('.record-summary-list');
    var oldDetail = el('details', { class: 'fold follow-original-summary', 'data-follow-key': 'component-status' }, [el('summary', null, ['Exact component statuses and recorded work-item text'])]);
    original.replaceWith(oldDetail);oldDetail.appendChild(original);
    var rows = (source.units || []).map(function (uid) { var unit = sh.units[uid];return { unit: unit, state: byPos(unit.st, S.st.pos) || {} }; });
    function textState(value) { return String(value || 'not established').replace(/_/g, ' '); }
    function rowLabel(row) { return (row.unit.comp === 'base' ? 'Base service' : row.unit.comp === 'mileage' ? 'Mileage' : textState(row.unit.comp)) + ' · ' + textState(row.unit.pur) + ' · recipient ' + row.unit.rec; }
    function stateList(kind) {
      return el('ul', { class: 'follow-state-list' }, rows.length ? rows.map(function (row) {
        var st = row.state, stage = row.unit.pur === 'audit' ? 'audit_submission' : 'encounter_submission', ready = (st.r || {})[stage];
        var status, explanation;
        if (kind === 'construction') {
          status = (st.c || [])[0] === 'constructed' ? 'Linked to a claim' : textState((st.c || [])[0]);explanation = (st.c || [])[1] ? 'Linked claim version: ' + st.c[1] : 'No supported claim-version link is recorded for this required component.';
        } else if (kind === 'ready') {
          status = textState(ready && ready[0]);
          var missing = ready ? (ready[2] || []).concat(ready[3] || []) : [];
          explanation = missing.length ? 'Required support: ' + missing.map(function (f) { return FIELD_LABEL[f] || textState(f); }).join(', ') : (ready && ready[0] === 'ready' ? 'Meets the model’s rules for this reporting use.' : 'Inspect applicability, construction and support for this target.');
        } else {
          status = !st.d ? 'Not submitted at this snapshot' : st.o === 'unresolved' ? (st.ao ? 'Client reports ' + st.ao + '; not confirmed' : 'Outcome not established') : textState(st.o);
          explanation = 'Evidence: ' + (BASIS_LABEL[st.b] || textState(st.b));
        }
        status = status.charAt(0).toUpperCase() + status.slice(1);
        return el('li', null, [el('span', { class: 'follow-component' }, [rowLabel(row)]), el('strong', { class: 'follow-record-state', 'data-record-state': kind }, [status]), el('p', null, [explanation])]);
      }) : [el('li', null, ['No required reporting unit is attached. Check the request’s disposition and contract rules before treating this as unfinished work.'])]);
    }
    var cards = el('div', { class: 'follow-state-grid' });
    [['construction', 'Has the claim been assembled?', 'A linked claim can still be missing a fact required before sending it.'], ['ready', 'Can it move forward for this use?', 'Base service and mileage are separate components. Each destination has its own requirements.'], ['outcome', 'What does the recipient’s response establish?', 'The recipient is the organization receiving this report. Acceptance does not prove payment or accuracy.']].forEach(function (x) {
      var card = el('section', { class: 'follow-state-card' }, [el('h3', null, [x[1]]), stateList(x[0]), el('p', { class: 'follow-card-meaning' }, [x[2]])]);
      if (x[0] === 'ready') {
        var missingFacts = {}, meanings = { billing_party_reference: 'The supported identifier for the party billing this service. It is separate from the ride receipt and proof of payment.', vendor_payment_observation: 'A source record showing what the ride company was paid for this service. Missing payment evidence does not establish that the vendor is unpaid.', line_quantity: 'A supported quantity, such as miles, for a service component. Blank mileage is not zero.', line_charge: 'The amount billed for a component, based on supported quantity and unit price.', subscriber_id: 'The insurance policyholder identifier. It cannot be assumed from the patient’s member identifier.', subscriber_relationship: 'The supported relationship between the patient and the insurance policyholder.', trip_verification_reference: 'Evidence that the trip happened, rather than only a booking or driver assignment.', coverage_reference: 'The health-plan coverage reference applicable to this service.' };
        rows.forEach(function (row) { var ready = (row.state.r || {})[row.unit.pur === 'audit' ? 'audit_submission' : 'encounter_submission'];if (ready) (ready[2] || []).concat(ready[3] || []).forEach(function (f) { missingFacts[f] = true; }); });
        Object.keys(missingFacts).forEach(function (f) { if (meanings[f]) card.appendChild(el('p', { class: 'follow-missing-meaning' }, [el('strong', null, [(FIELD_LABEL[f] || textState(f)) + ': ']), meanings[f]])); });
      }
      if (x[0] === 'outcome' && rows.some(function (row) { return /assertion|aggregate/.test(row.state.b || ''); })) card.appendChild(el('p', { class: 'follow-missing-meaning' }, [el('strong', null, ['Why not confirmed? ']), 'A client note can report an acceptance without the originating recipient’s record-specific decision and decision time. This model retains the note as an assertion rather than giving it source-evidenced acceptance credit.']));
      cards.appendChild(card);
    });
    context.insertBefore(cards, oldDetail);
    if (source.fam && sh.families[source.fam].items.length > 1) context.insertBefore(el('p', { class: 'follow-step-note' }, ['This claim groups multiple services. These cards cover only the selected service’s components; the claim-version evidence names the other members and their own records.']), cards);
    var work = [], seen = {};
    rows.forEach(function (row) { (row.state.wi || []).forEach(addWork); });
    var deliveries = {};rows.forEach(function (row) { if (row.state.d) deliveries[row.state.d] = true; });
    Object.keys(deliveries).forEach(function (did) { (byPos(sh.deliveries[did].wi, S.st.pos) || []).forEach(addWork); });
    function addWork(w) { var key = w[1] + '|' + w[2];if (!seen[key]) { seen[key] = true;work.push(w); } }
    var action = el('section', { id: 'follow-next-action', class: 'follow-next-action' }, [el('p', { class: 'eyebrow' }, ['The business follow-up']), el('h3', null, ['What needs to happen next?'])]);
    if (work.length) action.appendChild(el('ul', null, work.map(function (w) { return el('li', null, [el('strong', null, [textState(w[1]) + ': ']), w[2]]); })));
    else action.appendChild(el('p', null, [rows.some(function (row) { return row.state.d && row.state.o === 'unresolved'; }) ? 'No open unit or delivery work item is recorded. Suggested follow-up: ask the reporting recipient or intermediary for a record-specific resolved decision and supported decision time. A response can have arrived while its business outcome remains unknown.' : 'No open unit or delivery work item is recorded at this snapshot. Inspect the source disposition, reporting requirements and comparisons before assuming that the record is complete or paid.']));
    var T = S.bundle.positions[S.st.pos].T, K = S.bundle.positions[S.st.pos].K;
    var bareRejection = Object.keys(deliveries).some(function (did) { return sh.deliveries[did].resp.some(function (rid) { var r = sh.responses[rid];return r.out === 'rejected' && !r.text && r.rec <= K && r.eff && r.eff <= T; }); });
    if (bareRejection) action.appendChild(el('p', { class: 'follow-reason-note' }, ['The source supplies no rejection reason. Request that reason before choosing a correction; the cause is not established in the frozen record.']));
    action.appendChild(el('p', { class: 'small' }, ['Recorded actions above are deduplicated for reading, not a new work-item count. Guidance does not establish that outreach occurred. Nothing is resubmitted automatically.']));
    if (rows.some(function (row) { return row.state.ret === 'structurally_unavailable'; })) action.appendChild(el('p', { class: 'follow-reason-note' }, ['This contract has no final-response return route. That is a visibility limit, not a missed promised response. Reporting duties remain; a usable evidence route would be needed to establish a confirmed outcome.']));
    context.insertBefore(action, oldDetail);
    var chapters = [
      ['record-source', 'Which source facts support the record?', 'The ride company supplies trip facts, the health plan supplies member and benefit information, and billing systems supply supporting references. A row received after the knowledge cutoff remains later context.'],
      ['record-claim', 'What changed in the claim?', 'A claim family groups versions of the same claim. A version is a preserved copy with its own availability time. A grouped claim can include several rides; each keeps its own component lines. Later versions never rewrite what was already sent.'],
      ['record-readiness', 'Could it be sent, and what came back?', 'Read readiness first, then the exact sent record and the recipient’s response. A component is one part of a service, such as base service or mileage, for one recipient and purpose. A received response is not necessarily an acceptance or a resolved decision.'],
      ['record-financial', 'What do the amounts actually establish?', 'Compare different types of money facts, not just totals. Payment to a ride company and payment by a health plan need their own evidence. Unknown is never zero.'],
      ['record-timeline', 'When did the evidence arrive?', 'Compare when a fact became known with when it applied to the business. Later events remain visible as context and are marked when they were not yet known at the selected cutoff.'],
      ['record-bridge', 'What changes between snapshots?', 'This comparison separates late-arriving evidence about the earlier position from a genuine later business state. It helps distinguish an information handoff problem from a decision made with facts already available.']
    ];
    var inspector = record.querySelector('.record-inspector');inspector.setAttribute('data-follow-key', 'inspector');
    inspector.querySelector('summary').textContent = 'Inspect the evidence behind this record';
    var repeatedNav = record.querySelector('.reading-nav');if (repeatedNav) repeatedNav.remove();
    chapters.forEach(function (x) {
      var section = record.querySelector('#' + x[0]);if (!section) return;
      if (x[0] === 'record-claim' && !source.fam && !rows.length && section.querySelector('.notice')) section.querySelector('.notice').textContent = 'No claim family exists for this request, and no preparation unit is attached. Inspect its source disposition and contract profile before treating the absence of a claim as missing construction.';
      var heading = section.querySelector(':scope > h3');if (heading) heading.textContent = x[1];
      var intro = el('p', { class: 'follow-chapter-intro' }, [x[2]]);section.insertBefore(intro, heading ? heading.nextSibling : section.firstChild);
      if (x[0] === 'record-financial') intro.insertAdjacentElement('afterend', el('div', { class: 'follow-amount-types', 'aria-label': 'Cost, charge and payment are separate facts' }, [
        ['Ride cost', 'The supplier’s charge for providing the service.'], ['Claim charge', 'The amount requested for billing on the claim.'], ['Payment', 'A separately supported amount paid to a named party.']
      ].map(function (fact) { return el('div', null, [el('strong', null, [fact[0]]), el('p', null, [fact[1]])]); })));
      var fold = el('details', { class: 'fold follow-evidence-fold', 'data-follow-key': x[0] }, [el('summary', null, [x[1], el('span', { class: 'follow-scope' }, ['Selected record + snapshot'])])]);
      section.replaceWith(fold);fold.appendChild(section);
    });
    var story = app.querySelector('[aria-labelledby="story-h"]');
    if (story) {
      record.insertBefore(story, inspector);
      var snapshotLabel = { known_then: 'July 14 · information known then', restated_then: 'July 14 · with later evidence', current_later: 'July 21 · later snapshot' }[S.st.pos];
      var compact = el('section', { id: 'follow-walkthrough-record', class: 'follow-walkthrough-record', 'aria-labelledby': 'follow-walkthrough-record-h' }, [
        el('div', { class: 'follow-walkthrough-record-head' }, [el('h3', { id: 'follow-walkthrough-record-h' }, ['Selected record at this snapshot']), el('span', { class: 'follow-scope' }, ['Changes with snapshot'])]),
        el('p', { class: 'follow-walkthrough-record-identity' }, [el('strong', null, [CF_LABEL[sh.client] || sh.client]), ' · ' + resolved.key + ' · service date ' + (source.sd || 'unknown')]),
        el('p', { class: 'follow-walkthrough-record-position' }, [snapshotLabel])
      ]);
      // Reuse the full record's display states, including separate audit and encounter targets.
      var kinds = ['construction', 'ready', 'outcome'];
      var displayRows = kinds.map(function (kind) { return Array.from(stateList(kind).children); });
      if (rows.length) compact.appendChild(el('ul', { class: 'follow-snapshot-components' }, rows.map(function (row, index) {
        var facts = el('dl', { class: 'follow-snapshot-facts' });
        kinds.forEach(function (kind, column) {
          var displayed = displayRows[column][index], value = displayed.querySelector('.follow-record-state').textContent;
          var field = el('div', { 'data-snapshot-field': kind }, [el('dt', null, [{ construction: 'Claim', ready: 'Readiness', outcome: 'Outcome' }[kind]]), el('dd', null, [value])]);
          if (kind === 'outcome' || (kind === 'ready' && value !== 'Ready')) field.appendChild(el('p', null, [displayed.querySelector('p').textContent]));
          facts.appendChild(field);
        });
        return el('li', null, [el('strong', { class: 'follow-component' }, [rowLabel(row)]), facts]);
      })));
      else compact.appendChild(el('p', { class: 'small' }, ['No required reporting unit is attached. Check the request’s disposition and contract rules before treating this as unfinished work.']));
      compact.appendChild(el('p', { class: 'follow-walkthrough-record-limit' }, ['Readiness applies to each named reporting use. Acceptance does not establish payment or accuracy.']));
      story.querySelector('.follow-walkthrough-scope').insertAdjacentElement('afterend', compact);
    }
    if (followOpenSections && followOpenSections.record === S.st.rec) {
      record.querySelectorAll('details[data-follow-key]').forEach(function (d) { d.open = followOpenSections.keys.indexOf(d.getAttribute('data-follow-key')) >= 0; });
    }
    followOpenSections = null;
    record.setAttribute('data-follow-ready', 'true');
  }

  // A step's bound position (R1-14): an operational or diagnostic step's binding names its Q, and the step link always
  // opens the record at that Q, never at the visitor's current position. Public golden miniatures have no position.
  function stepPos(st) { return st && st.binding && st.binding.Q ? st.binding.Q.position : null; }
  function storyHref(story, st, s) {
    var p = stepPos(st);
    return hashOf(Object.assign({}, s, { rec: st.rec || '', story: story.id }, p ? { pos: p } : {}));
  }

  function storyPanel(story) {
    var s = S.st;
    var box = el('section', { class: 'panel', 'aria-labelledby': 'story-h' }, [el('p', { class: 'eyebrow' }, [story.id + ' · guided route']), el('h2', { id: 'story-h', style: 'margin-top:.2rem' }, [story.title]),
      el('p', { class: 'small' }, [story.teaser])]);
    var here = story.steps.filter(function (st) { return st.rec === s.rec && stepPos(st); });
    if (here.length && !here.some(function (st) { return stepPos(st) === s.pos; }))
      box.appendChild(el('p', { class: 'notice' }, ['You are viewing ' + s.rec + ' at ' + lc(POS_LABEL[s.pos]) + '. This route\'s steps for it are bound to ' +
        here.map(function (st) { return lc(POS_LABEL[stepPos(st)]); }).join(' and ') + '; their narrative and evidence bindings describe that position. ',
        el('a', { href: storyHref(story, here[0], s) }, ['Open it at ' + lc(POS_LABEL[stepPos(here[0])])])]));
    var plain = story.id === 'DEMO01' ? [
      ['The ride happened. The claim still needs a billing reference.', 'At the original cutoff the reference is missing, so both required components are blocked. The appropriate follow-up is to obtain that reference.'],
      ['Later information cannot make the earlier version ready.', 'A corrected claim becomes available on July 16. Looking back with that information does not make the corrected version available on July 14.'],
      ['The corrected claim can move forward at the later date.', 'Once version 2 and its supporting facts exist, the claim is ready. The submission uses that exact version.'],
      ['Ready to send does not mean accepted.', 'The recipient rejects the submitted components. The response confirms the reporting outcome, but does not count as acceptance.'],
      ['Compare a record with confirmed acceptance.', 'This second record has originating acceptance for every required component. It shows the difference between a confirmed outcome and an accepted outcome.']
    ] : null;
    var ol = el('ol', { class: 'steps' });
    story.steps.forEach(function (st, i) {
      var p = stepPos(st);
      var link = st.rec ? el('a', { href: storyHref(story, st, s) }, [(plain ? plain[i][0] : st.label) + (p ? ' (' + lc(POS_LABEL[p]) + ')' : '')]) : el('span', null, [st.label]);
      if (st.rec === s.rec && (!p || p === s.pos)) link.setAttribute('aria-current', 'step');
      ol.appendChild(el('li', null, [link, el('p', { class: 'small', style: 'margin:.2rem 0 0' }, [plain ? plain[i][1] : st.text]),
        el('details', { class: 'fold' }, [el('summary', null, ['Inspect this step’s evidence']), el('p', { class: 'small' }, [st.text]), bindingSummary(st)])]));
    });
    box.appendChild(ol);
    box.appendChild(el('p', { class: 'small' }, ['Every step\'s binding is re-checked independently against the frozen inputs, committed lineage, published cells and golden records (', el('a', { href: 'evidence/story-bindings-verification.json' }, ['binding verification']), ').']));
    if (story.limits) box.appendChild(el('p', { class: 'restricted' }, ['Limits: ' + story.limits]));
    box.appendChild(el('a', { class: 'btn', href: hashOf(Object.assign({}, s, { story: '' })) }, ['Close the route']));
    return box;
  }

  // The exact evidence a guided step stands on (R1-14): Q, claims, deliveries with payload hashes, responses, notes, units.
  function bindingSummary(st) {
    var b = st.binding;
    if (!b) return el('p', { class: 'notice' }, ['No binding recorded for this step.']);
    var q = b.Q;
    if (!b.operational && b.golden) {
      var g = b.golden;
      return el('details', { class: 'fold binding' }, [el('summary', null, ['Binding: public golden ' + g.case + ' / ' + g.variant + ' (not the operational population)']),
        el('pre', { class: 'mono small' }, [JSON.stringify({ query: g.query, input_changes: g.input_changes, expected_intermediate: g.expected_intermediate, expected_final: g.expected_final, specification_sha256: g.specification_sha256 }, null, 1)])]);
    }
    if (!b.operational) {
      if (!b.input) return el('p', { class: 'notice' }, ['No input and output receipt recorded for this diagnostic step.']);
      var drows = [['Position', posWords(q.position) + ' (T ' + ts(q.T) + ', K ' + ts(q.K) + ')'],
        ['Isolated input', b.input.delivery_id + ' payload ' + b.input.payload_sha256 + ' (' + b.input.source + ')'],
        ['Unmodified twin', b.operational_twin.delivery_id + ' payload ' + b.operational_twin.payload_sha256],
        ['Output rows', b.responses.map(function (r) { return r[0].slice(0, 16) + '… ' + r[1] + ' ' + r[2] + (r[5] ? '' : ', received after K'); }).join('; ') + ' (' + b.responses_source + ')'],
        ['Claim-to-payload mismatch', b.mismatch_fields.join(', ')],
        ['Final acceptance bound to these bytes', String(b.final_acceptance_bound_to_input)]];
      return el('details', { class: 'fold binding' }, [el('summary', null, ['Binding: labeled diagnostic copy, exact input and output receipt (not the operational population)']),
        table({ caption: 'Diagnostic receipt for ' + st.rec + ' at ' + posWords(q.position), header: ['Item', 'Value'], rows: drows, stack: true })]);
    }
    var rows = [['Position', posWords(q.position) + ' (T ' + ts(q.T) + ', K ' + ts(q.K) + '; ' + q.population_version + '; ' + q.rule_version + ')'],
      ['Claim versions', b.claim_versions.map(function (c) { return c[0] + ' (' + c[1].slice(0, 12) + '…)'; }).join('; ') || 'none'],
      ['Lines and allocations', b.lines.length + ' lines, ' + b.allocations.length + ' allocations'],
      ['Deliveries submitted by T', b.deliveries.map(function (d) { return d[0] + ' payload ' + d[1].slice(0, 12) + '…'; }).join('; ') || 'none'],
      ['Bound responses', b.responses.map(function (r) { return r[1] + ' ' + r[2] + ' (' + r[3].replace(/_/g, ' ') + (r[5] ? '' : ', received after K') + ')'; }).join('; ') || 'none'],
      ['Client notes', b.client_notes.map(function (n) { return Array.isArray(n) ? n[0] + (n[1] ? '' : ' (received after K)') : n; }).join('; ') || 'none'],
      ['Units and states', b.units.length + ' units' + (b.excluded_from_P ? '; explicitly excluded from P (no unit)' : '')],
      ['Financial events', (b.financial_events || []).map(function (f) { return f[0] + ' ' + (f[2] === null ? f[3] : f[2]) + (f[6] ? '' : ' (effective after T)'); }).join('; ') || 'none'],
      ['Payment allocations', (b.financial_allocations || []).map(function (a) { return a[0] + ' ' + a[2] + ' ' + a[4] + (a[3] ? ' to ' + a[3] : ''); }).join('; ') || 'none'],
      ['Cells of the story measures', Object.keys(b.story_measure_cells).length + ' published cells at this position']];
    var off = S.st.pos !== q.position ? ' (the bound position; you are viewing ' + lc(POS_LABEL[S.st.pos]) + ')' : '';
    return el('details', { class: 'fold binding' }, [el('summary', null, ['Binding: exact evidence for this step at ' + posWords(q.position) + off]), table({ caption: 'Evidence binding for ' + st.rec + ' at ' + posWords(q.position), header: ['Item', 'Value'], rows: rows, stack: true })]);
  }

  function browse() {
    var s = S.st;
    var box = el('div', null, [el('h2', null, ['Browse'])]);
    var c = s.client === 'ALL' || s.client.indexOf('P-') === 0 ? 'SYN-C01' : s.client;
    var picks = el('div', { class: 'btn-row' }, ['SYN-C01', 'SYN-C02', 'SYN-C03', 'SYN-C04', 'SYN-C05', 'SYN-C06'].map(function (x) {
      return el('a', { class: 'btn' + (x === c ? ' btn-dark' : ''), href: hashOf(Object.assign({}, s, { client: x })) }, [CF_LABEL[x] || x]);
    }));
    box.appendChild(picks);
    var holder = el('div', null, [el('p', { class: 'loading' }, ['Loading ' + c + '…'])]);
    box.appendChild(holder);
    shard(c).then(function (sh) {
      holder.innerHTML = '';
      var keys = Object.keys(sh.legs).sort();
      var rows = keys.map(function (k) { var L = sh.legs[k]; return [el('a', { href: hashOf(Object.assign({}, s, { rec: k, story: '' })) }, [k]), L.sd, L.fam || 'none', byPos(L.cov, s.pos) || 'none', (L.units || []).length]; });
      holder.appendChild(table({ id: 'browse-legs-' + c, caption: c + ' completed legs (' + posWords(s.pos) + ')', header: ['Service key', 'Service date', 'Claim family', 'Coverage state', 'P units'], rows: rows, maxRows: 100, num: [4], stack: true, filters: { client: c, period: 'FULL' } }));
      var rk = Object.keys(sh.requests).sort();
      holder.appendChild(table({ id: 'browse-requests-' + c, caption: c + ' requests without a completed leg', header: ['Request', 'Disposition', 'Class', 'Reportability at this position', 'P units'],
        rows: rk.map(function (k) { var R = sh.requests[k]; return [el('a', { href: hashOf(Object.assign({}, s, { rec: k, story: '' })) }, [k]), R.disp, R.cls || '', byPos(R.status, s.pos) || (R.units.length ? 'required (P-C documented cancelled)' : 'none'), R.units.length]; }),
        maxRows: 100, num: [4], stack: true, filters: { client: c, period: 'FULL' } }));
    });
    return box;
  }

  function resolveRecord(sh, id) {
    if (sh.legs[id]) return { kind: 'leg', key: id };
    if (sh.requests[id]) return { kind: 'request', key: id };
    if (sh.units[id]) return { kind: sh.legs[sh.units[id].item] ? 'leg' : 'request', key: sh.units[id].item, unit: id };
    var famId = id.replace(/:v\d+$/, '');
    if (sh.families[famId]) return { kind: sh.legs[sh.families[famId].items[0]] ? 'leg' : 'request', key: sh.families[famId].items[0], family: famId };
    var d = sh.deliveries[id];
    if (!d) { var k = Object.keys(sh.deliveries).filter(function (x) { return sh.deliveries[x].fam === id; })[0]; if (k) d = sh.deliveries[k], id = k; }
    if (d) { var v = sh.versions[d.cv[0]]; return { kind: sh.legs[v.items[0]] ? 'leg' : 'request', key: v.items[0], delivery: id }; }
    for (var lk in sh.legs) { if (sh.legs[lk].rq === id) return { kind: 'leg', key: lk }; }
    return null;
  }

  function recordView(sh, id) {
    var s = S.st, r = resolveRecord(sh, id);
    if (!r) return el('p', { class: 'notice' }, ['No record in ' + sh.client + ' matches "' + id + '".']);
    var holder = r.kind === 'leg' ? sh.legs[r.key] : sh.requests[r.key];
    var box = el('article', { 'aria-labelledby': 'rec-h' });
    var famId = holder.fam;
    var fam = famId ? sh.families[famId] : null;
    var profile = (S.bundle.clients.filter(function (c) { return c.client_id === sh.client; })[0] || {}).profile_id;
    box.appendChild(el('div', { class: 'rec-head' }, [el('h2', { id: 'rec-h', style: 'margin-top:1.4rem' }, [(r.kind === 'leg' ? 'Completed leg ' : 'Request ') + r.key]),
      tag(CF_LABEL[sh.client] || sh.client, ''), tag('profile ' + profile, ''), tag('position: ' + posWords(s.pos), '')]));
    var cov = byPos(holder.cov, s.pos);
    box.appendChild(el('dl', { class: 'kv' }, [
      el('dt', null, ['Request']), el('dd', null, [r.kind === 'leg' ? holder.rq : r.key]),
      el('dt', null, ['Service date']), el('dd', null, [holder.sd || 'unknown']),
      el('dt', null, ['Claim family']), el('dd', null, [famId || 'No claim family exists; no claim identifier is invented.']),
      // R1-13 finding 6: the record view states its own clocks.
      el('dt', null, ['Position and clocks']), el('dd', null, [POS_LABEL[s.pos] + ' (' + posWords(s.pos) + '). T, the business horizon: ' + ts(S.bundle.positions[s.pos].T) + '; a fact counts only if its business effect is by T. K, the knowledge cutoff: ' + ts(S.bundle.positions[s.pos].K) + '; only evidence received by K is known.']),
      el('dt', null, ['Completed-leg coverage (M01)']), el('dd', null, [r.kind === 'leg' ? stateTag(cov) : el('span', null, ['Not a completed leg: outside C. ' + (holder.units.length ? 'Its required cancelled report is a reporting unit in U.' : 'No reporting requirement under its profile, or reportability unresolved: ' + (byPos(holder.status, s.pos) || 'none') + '.')])])
    ]));
    var context = el('section', { class: 'record-context' });
    while (box.firstChild) context.appendChild(box.firstChild);
    var identity = context.querySelector('dl');
    if (identity) {
      var technicalIdentity = el('details', { class: 'fold context-identity' }, [el('summary', null, ['Record identifiers, coverage and exact cutoffs']), identity]);
      context.appendChild(technicalIdentity);
    }
    context.insertBefore(el('p', { class: 'record-summary-intro' }, ['Selected record · ' + POS_LABEL[s.pos] + '. Readiness is specific to a use; a confirmed reporting outcome can be a rejection.']), context.querySelector('.context-identity'));
    var factRows = (holder.units || []).map(function (uid) {
      var unit = sh.units[uid], st = byPos(unit.st, s.pos) || {};
      var stage = unit.pur === 'audit' ? 'audit_submission' : 'encounter_submission';
      var readiness = (st.r || {})[stage];
      var missing = readiness ? (readiness[2] || []).map(function (f) { return FIELD_LABEL[f] || f.replace(/_/g, ' '); }) : [];
      var action = (st.wi || []).filter(function (w) { return w[10] === stage || w[0] === 'encounter_rejection'; }).map(function (w) { return w[2]; });
      var facts = [el('strong', null, [unit.comp + ' component · ' + unit.pur + ' reporting']),
        el('p', null, [el('strong', null, ['Readiness: ']), readiness ? readiness[0].replace(/_/g, ' ') : 'not established'])];
      if (missing.length) facts.push(el('p', null, [el('strong', null, ['Missing: ']), missing.join(', ')]));
      facts.push(el('p', null, [el('strong', null, ['Outcome: ']), (st.o || 'unknown').replace(/_/g, ' ')]));
      facts.push(el('p', { class: 'small' }, [el('strong', null, ['Evidence: ']), BASIS_LABEL[st.b] || st.b || 'not established']));
      facts.push(el('p', { class: 'small' }, action.length ? [el('strong', null, ['Recorded next action: ']), action.join(' ')] : ['No open unit work item is recorded here; delivery-level follow-up, if any, is in the detailed record.']));
      return el('li', null, facts);
    });
    context.insertBefore(el('ul', { class: 'record-summary-list' }, factRows.length ? factRows : [el('li', null, ['No required preparation unit is attached. Inspect the source disposition and profile before interpreting the absence of a claim as a gap.'])]), context.querySelector('.context-identity'));
    box.appendChild(context);
    box.appendChild(readingNav([['record-source', '01 Sources'], ['record-claim', '02 Claim'], ['record-readiness', '03 Readiness and returns'], ['record-financial', '04 Financial facts'], ['record-timeline', '05 Timeline'], ['record-bridge', '06 Compare positions']], 'In this record'));
    // Source facts
    var sources = chapter(el('section', null, [el('h3', null, ['Source facts'])]), 'record-source', '01 / Supporting evidence');
    var K = S.bundle.positions[s.pos].K, T = S.bundle.positions[s.pos].T;
    sources.appendChild(table({ id: 'src-' + r.key, caption: 'Source rows bound to this item (effective and received times; rows received after K are not available at this position)', stack: true,
      header: ['Family', 'Row id', 'Values', 'Effective', 'Received', 'Available at K'],
      rows: holder.src.map(function (x) {
        var vals = x[1] === 'census' ? 'applicability ' + x[5] + '; completed ' + ts(x[6]) + '; components ' + x[7].join(', ')
          : x[1] === 'ride' ? 'status ' + x[5] + '; distance ' + x[6] + ' mi; category ' + x[7] + '; ' + ts(x[8]) + ' to ' + ts(x[9]) + '; trip verification ' + x[10]
          : x[1] === 'reference' ? x[5] + ': ' + (x[6] === 'known' ? x[7] : x[6]) + ' (issuer ' + x[8] + ', valid ' + x[9] + (x[10] ? ' to ' + x[10] : ' onward') + (x[11] ? ', relationship ' + x[11] : '') + ')'
          : 'disposition ' + x[5] + (x[6] ? ' (' + x[6] + ')' : '') + (x[7] ? '; reason ' + x[7] : '') + '; service date ' + x[8];
        return [x[1], x[0], vals, ts(x[2]), ts(x[3]), x[3] <= K ? 'yes' : 'not yet'];
      }) }));
    box.appendChild(sources);
    // Claim versions
    if (fam) box.appendChild(chapter(claimSection(sh, fam, famId, r, T, K), 'record-claim', '02 / Claim construction'));
    else box.appendChild(chapter(el('section', null, [el('h3', null, ['Claim construction']), el('p', { class: 'notice' }, ['No claim exists for this item at any position. Its preparation units remain in the M14 denominator as missing construction.'])]), 'record-claim', '02 / Claim construction'));
    // Units: readiness and downstream
    box.appendChild(chapter(unitSection(sh, holder.units, r), 'record-readiness', '03 / Readiness and return evidence'));
    // Financial
    box.appendChild(chapter(financialRecord(sh, holder, s.pos), 'record-financial', '04 / Financial meaning'));
    // Timeline and position bridge
    box.appendChild(chapter(timeline(sh, holder, r, fam), 'record-timeline', '05 / Evidence over time'));
    box.appendChild(chapter(bridgeTable(sh, holder, r), 'record-bridge', '06 / Business and knowledge cutoffs'));
    box.appendChild(el('div', { class: 'btn-row', style: 'margin-top:1rem' }, [el('button', { class: 'btn', type: 'button', onclick: function () {
      var chain = eventChain(sh, holder, r, fam, s.pos);
      download('cci-event-chain-' + r.key.replace(/:/g, '_') + '-' + s.pos + '.json', JSON.stringify(chain, null, 1) + '\n', 'application/json');
    } }, ['Download the event chain (JSON)'])]));
    return box;
  }

  function claimSection(sh, fam, famId, r, T, K) {
    var s = S.st;
    var box = el('section', null, [el('h3', { style: 'margin-top:1.4rem' }, ['Claim family ' + famId + ' (' + fam.versions.length + ' version' + (fam.versions.length > 1 ? 's' : '') + ')'])]);
    if (fam.items.length > 1) box.appendChild(el('p', { class: 'small' }, ['Grouped claim: ' + fam.items.join(' and ') + ' share one header under profile P-B; each keeps its own lines and allocations. Other member: ',
      el('a', { href: hashOf(Object.assign({}, s, { rec: fam.items.filter(function (k) { return k !== r.key; })[0] || fam.items[0] })) }, [fam.items.filter(function (k) { return k !== r.key; })[0] || ''])]));
    // R1-13 finding 15: per version, a charge total, a conformance state on every version and what changed from its predecessor.
    function cents(x) { return x === null || x === undefined ? null : Math.round(parseFloat(x) * 100); }
    function money(c) { return (c / 100).toFixed(2); }
    function totalOf(v) { var t = 0, uns = 0; v.lines.forEach(function (l) { var c = cents(l[7]); if (c === null) uns++; else t += c; }); return { t: t, uns: uns }; }
    function currencyOf(v) { var c = (v.hdr.currency || {})['*']; return c ? c[1] : ''; }
    function changeLine(v) {
      var p = v.pred ? sh.versions[v.pred] : null;
      if (!p) return v.pred ? 'Predecessor ' + v.pred + ' is not in this record.' : 'First version of the family.';
      var key = function (l) { return l[1] + ' ' + l[2]; };
      var pk = {}, vk = {}; p.lines.forEach(function (l) { pk[key(l)] = l; }); v.lines.forEach(function (l) { vk[key(l)] = l; });
      var addedItems = v.items.filter(function (i) { return p.items.indexOf(i) < 0; }), removedItems = p.items.filter(function (i) { return v.items.indexOf(i) < 0; });
      var added = Object.keys(vk).filter(function (k) { return !pk[k]; }), removed = Object.keys(pk).filter(function (k) { return !vk[k]; });
      var changed = Object.keys(vk).filter(function (k) { var a = pk[k], b = vk[k]; return a && (a[4] !== b[4] || a[7] !== b[7] || a[3] !== b[3] || a[10] !== b[10] || a[11] !== b[11]); });
      var bits = [];
      if (addedItems.length) bits.push('adds ' + addedItems.join(', '));
      if (removedItems.length) bits.push('drops ' + removedItems.join(', '));
      if (added.length) bits.push(added.length + ' line' + (added.length > 1 ? 's' : '') + ' added (' + added.join('; ') + ')');
      if (removed.length) bits.push(removed.length + ' line' + (removed.length > 1 ? 's' : '') + ' removed (' + removed.join('; ') + ')');
      if (changed.length) bits.push(changed.length + ' line' + (changed.length > 1 ? 's' : '') + ' changed in code, quantity, charge or times (' + changed.join('; ') + ')');
      // R1-13b finding 6: header fields whose value or support class changed, for source items present in both versions.
      // Claim-level line lists (line_*) are covered by the line comparison above; fields of an added item by "adds".
      var hdrChanges = [], fields = {};
      Object.keys(p.hdr).concat(Object.keys(v.hdr)).forEach(function (f) { fields[f] = 1; });
      Object.keys(fields).sort().forEach(function (f) {
        var ph = p.hdr[f] || {}, vh = v.hdr[f] || {}, its = {};
        Object.keys(ph).concat(Object.keys(vh)).forEach(function (i) { its[i] = 1; });
        Object.keys(its).sort().forEach(function (i) {
          if (i === '*' && /^line_/.test(f)) return;
          if (i !== '*' && (addedItems.indexOf(i) >= 0 || removedItems.indexOf(i) >= 0)) return;
          var x = ph[i], y = vh[i];
          var val = function (z) { return !z || z[1] === null || z[1] === undefined ? 'none' : (Array.isArray(z[1]) ? z[1].join(', ') : String(z[1])); };
          var sup = function (z) { return z ? String(z[0]).replace(/_/g, ' ') : 'absent'; };
          if (sup(x) === sup(y) && val(x) === val(y)) return;
          var name = f.replace(/_/g, ' ') + (i === '*' ? '' : ' for ' + i);
          hdrChanges.push(name + ': ' + (sup(x) === sup(y) ? 'value ' + val(x) + ' → ' + val(y) + ' (' + sup(y) + ')' : sup(x) + ' (' + val(x) + ') → ' + sup(y) + ' (' + val(y) + ')'));
        });
      });
      if (hdrChanges.length) bits.push(hdrChanges.length + ' header field' + (hdrChanges.length > 1 ? 's' : '') + ' changed in value or support (' + hdrChanges.join('; ') + ')');
      var a = totalOf(p), b = totalOf(v);
      bits.push('charge total ' + money(a.t) + ' → ' + money(b.t));
      return 'Changed from ' + v.pred + ': ' + bits.join('; ') + '.';
    }
    fam.versions.forEach(function (vid) {
      var v = sh.versions[vid];
      var avail = v.avail <= T ? 'exists at T' : (v.avail <= K ? 'known later: available after T, by K' : 'not yet available at this position');
      var c2s = byPos(v.c2s, s.pos);
      var later = fam.versions.filter(function (x) { return x !== vid && sh.versions[x].v > v.v && sh.versions[x].avail <= T; }).length > 0;
      var conf = c2s ? 'claim-to-source ' + c2s.replace(/_/g, ' ') : 'claim-to-source not assessed' + (later ? ' (a later version exists at T; only the latest version per family is compared)' : '');
      var tot = totalOf(v);
      var versionBox = box;
      if (v.avail > T) {
        versionBox = el('details', { class: 'fold later-context' }, [el('summary', null, ['Later context: ' + vid + ' (not available at T = ' + ts(T) + ')'])]);
        box.appendChild(versionBox);
        versionBox.appendChild(el('p', { class: 'small' }, ['This version does not establish readiness or conformance at this position. ' + avail + '.']));
      }
      versionBox.appendChild(el('h4', { style: 'margin-top:1rem' }, [brk(vid), ' · available ' + ts(v.avail) + ' · ' + avail + ' · ' + conf]));
      // R1-13b finding 18: a version whose lines span several source items gives a subtotal per item, from its lines.
      var byItem = {}, order = [];
      v.lines.forEach(function (l) { if (!byItem[l[1]]) { byItem[l[1]] = { t: 0, uns: 0 }; order.push(l[1]); } var c = cents(l[7]); if (c === null) byItem[l[1]].uns++; else byItem[l[1]].t += c; });
      var subText = order.length > 1 ? ' (' + order.map(function (i) { return i + ' ' + money(byItem[i].t) + (byItem[i].uns ? ', ' + byItem[i].uns + ' unsupported not counted' : ''); }).join('; ') + ')' : '';
      versionBox.appendChild(el('p', { class: 'small' }, ['Charge total ' + money(tot.t) + (currencyOf(v) ? ' ' + currencyOf(v) : '') + subText + ' over ' + (v.lines.length - tot.uns) + ' of ' + v.lines.length + ' lines' + (tot.uns ? ' (' + tot.uns + ' line charge' + (tot.uns > 1 ? 's' : '') + ' unsupported, not counted)' : '') + '. ' + changeLine(v)]));
      var rows = [];
      Object.keys(v.hdr).sort().forEach(function (f) {
        Object.keys(v.hdr[f]).forEach(function (item) {
          var x = v.hdr[f][item];
          var val = Array.isArray(x[1]) ? x[1].join(', ') : x[1];
          rows.push([f.replace(/_/g, ' '), item === '*' ? 'claim level' : item, stateTag(x[0] === 'source' ? 'source' : x[0]), val === null || val === undefined ? 'none' : String(val), x[2] || '']);
        });
      });
      versionBox.appendChild(table({ caption: 'Header fields: support class per field and source item (source, reference join, permitted derivation, or missing and conflicting)', header: ['Field', 'Source item', 'Support', 'Value', 'Note'], rows: rows, stack: true }));
      versionBox.appendChild(table({ caption: 'Claim lines and their quantity support', header: ['Line', 'Source item', 'Component', 'Code', 'Quantity', 'Quantity support', 'Unit charge', 'Charge', 'Unit basis', 'Category'], stack: true,
        rows: v.lines.map(function (l) { return [l[0], l[1], l[2], l[3], l[4] === null ? 'unsupported' : l[4], l[5], l[6], l[7] === null ? 'unsupported' : l[7], l[8], l[9]]; }) }));
      var cmp = byPos(v.cmp, s.pos) || [];
      if (cmp.length) versionBox.appendChild(table({ caption: 'Claim-to-source comparisons that do not conform', header: ['Field', 'Disposition', 'Expected from source', 'Claim value', 'Basis'], rows: cmp.map(function (x) { return [x[0], stateTag(x[1]), String(x[2]), String(x[3]), x[4]]; }), stack: true }));
    });
    // R1-13 finding 6: each state column is labeled by the clock it is read on.
    if (fam.attempts) box.appendChild(table({ caption: 'Business attempts by target through the frozen horizon (the first attempt is fixed at first readiness; later versions create decisions, never automatic submissions)', stack: true,
      header: ['Target', 'Through frozen horizon', 'At selected position', 'First ready', 'Submitted', 'Claim version', 'Delivery'],
      note: 'Two clocks: the chronology is built once over the frozen horizon, the latest K of any position (' + ts(horizonK()) + '); the next column reads the same attempt at this position\'s T (' + ts(T) + '). An attempt submitted after T reads "submitted" in the first and "not yet submitted at T" in the second.',
      rows: fam.attempts.map(function (a) { return [a.target, a.state.replace(/_/g, ' '), a.submitted_at ? (a.submitted_at <= T ? 'submitted by T' : 'not yet submitted at T') : 'never submitted', ts(a.first_ready_at), a.submitted_at ? ts(a.submitted_at) : 'none', a.version || 'none', a.delivery || 'none']; }) }));
    return box;
  }

  // Delivery id -> {source item: 1} over every unit of the shard at any position, built once per shard.
  function deliveryItems(sh) {
    if (sh._dItems) return sh._dItems;
    var out = {};
    Object.keys(sh.units).forEach(function (u) { var U = sh.units[u]; Object.keys(S.bundle.positions).forEach(function (p) { var st = byPos(U.st, p); if (st && st.d) { (out[st.d] = out[st.d] || {})[U.item] = 1; } }); });
    Object.defineProperty(sh, '_dItems', { value: out, enumerable: false });
    return out;
  }
  function deliveriesFor(sh, units) {
    var out = {};
    units.forEach(function (u) { Object.keys(S.bundle.positions).forEach(function (p) { var st = byPos(sh.units[u].st, p); if (st && st.d) out[st.d] = 1; }); });
    return Object.keys(out).sort();
  }

  function unitSection(sh, unitIds, r) {
    var s = S.st;
    var box = el('section', null, [el('h3', { style: 'margin-top:1.4rem' }, ['Preparation and reporting units: readiness by target, then downstream evidence'])]);
    // R1-13b finding 5: these tables are scoped to this record's own units; a delivery can also carry other records' units
    // (a grouped claim), which are named here with links that keep the position.
    var idx = deliveryItems(sh), dels = deliveriesFor(sh, unitIds);
    var scope = [r.key + ' has ' + unitIds.length + ' unit' + (unitIds.length === 1 ? '' : 's') + '; the readiness, work-item and downstream tables below list only ' + (unitIds.length === 1 ? 'that unit' : 'those units') + '.'];
    dels.forEach(function (did) {
      var others = Object.keys(idx[did] || {}).filter(function (k) { return k !== r.key; }).sort();
      if (!others.length) return;
      scope.push(' Delivery ', brk(did), ' also carries units of ');
      others.forEach(function (k, i) { if (i) scope.push(i === others.length - 1 ? ' and ' : ', '); scope.push(el('a', { href: hashOf(Object.assign({}, s, { rec: k })) }, [k])); });
      scope.push('; open ' + (others.length === 1 ? 'that record' : 'those records') + ' for ' + (others.length === 1 ? 'its' : 'their') + ' rows.');
    });
    box.appendChild(el('p', { class: 'small', id: 'unit-scope' }, scope));
    var rows = [];
    unitIds.slice().sort().forEach(function (uid) {
      var U = sh.units[uid], st = byPos(U.st, s.pos) || {};
      ['initial_preparation', 'encounter_submission', 'audit_submission'].forEach(function (stage) {
        var x = (st.r || {})[stage];
        if (!x) return;
        rows.push([U.comp, U.rec + ' / ' + U.pur, STAGE_LABEL[stage], stateTag(x[0]), x[1] ? ts(x[1]) : 'not ready', (x[2] || []).concat(x[3] || []).map(function (f) { return FIELD_LABEL[f] || f; }).join(', ') || (x[5] && x[5].length ? x[5].join('; ') : ''),
          (st.c || [])[0] || '']);
      });
    });
    box.appendChild(table({ id: 'readiness-' + r.key, caption: 'Readiness by recipient, purpose and stage at the ' + posWords(s.pos) + ', for the units of ' + r.key + ' only' + (r.unit ? ' (opened from unit ' + r.unit + ')' : ''), stack: true,
      header: ['Component', 'Recipient / purpose', 'Stage', 'State', 'Ready at', 'Missing or conflicting support', 'Construction'], rows: rows, measures: ['M14', 'M15', 'M19'] }));
    // Work items
    var wrows = [];
    unitIds.forEach(function (uid) {
      var st = byPos(sh.units[uid].st, s.pos) || {};
      (st.wi || []).forEach(function (w) { wrows.push([sh.units[uid].comp + ' ' + sh.units[uid].rec, w[0].replace(/_/g, ' '), w[1].replace(/_/g, ' '), w[2], w[4] ? ts(w[4]) : 'none: ' + (w[7] || ''), w[5], w[8] === null ? 'unknown onset' : hrs(w[8])]); });
    });
    // R1-13 finding 17: the counting rule is printed wherever work items are listed.
    if (wrows.length) box.appendChild(table({ id: 'workitems-' + r.key, caption: 'Open unit work items for the units of ' + r.key + ' (owner role, next action, timing basis)', header: ['Unit', 'Kind', 'Owner role', 'Next action', 'Due', 'Due state', 'Age at T'], rows: wrows, stack: true, measures: ['M06'],
      note: 'Counting: one work item per blocked or conflicting readiness row, one per preparation unit still without a constructed claim after its deadline, and one per rejected reporting unit (component and target). Receipt and follow-up items belong to a delivery, are listed in that delivery\'s block below, and are not counted again here.' }));
    if (!wrows.length) box.appendChild(el('p', { class: 'small', id: 'no-open-work-items' }, ['No open unit work items for this record at this position. A received final response with an unresolved business outcome is not an overdue receipt. Delivery-level receipt and follow-up work items, if any, are listed below.']));
    // Downstream per unit
    var drows = [];
    unitIds.slice().sort().forEach(function (uid) {
      var U = sh.units[uid], st = byPos(U.st, s.pos) || {};
      drows.push([U.comp, U.rec + ' / ' + U.pur, st.d ? brk(st.d) : 'not submitted', st.cid ? brk(st.cid) : '', stateTag(st.o), BASIS_LABEL[st.b] || st.b || '', (st.ret || '').replace(/_/g, ' '), st.why || '']);
    });
    // R1-13b finding 7: long identifiers break at separators and headers wrap (class fit), so the table fits at 1280 px.
    box.appendChild(table({ id: 'downstream-' + r.key, caption: 'Downstream, for the units of ' + r.key + ' only: the exact delivery and component each unit was reported through, and the outcome evidence', stack: true, wrapHead: true, fit: true,
      header: ['Component', 'Recipient / purpose', 'Delivery', 'Claim line in payload', 'Business outcome', 'Evidence basis', 'Return expectation', 'Explanation'], rows: drows, measures: ['M16', 'M01'] }));
    deliveriesFor(sh, unitIds).forEach(function (did) { box.appendChild(deliveryBlock(sh, did)); });
    return box;
  }

  // R1-13b finding 19: a delivery bound to one version names the family's other versions and where they are shown.
  function otherVersionsText(sh, cv) {
    var famIds = {}; cv.forEach(function (v) { famIds[v.replace(/:v\d+$/, '')] = 1; });
    var parts = Object.keys(famIds).map(function (f) {
      var F = sh.families[f]; if (!F) return '';
      var other = F.versions.filter(function (v) { return cv.indexOf(v) < 0; });
      if (!other.length) return '';
      var earlier = other.filter(function (v) { return sh.versions[v] && sh.versions[cv[0]] && sh.versions[v].v < sh.versions[cv[0]].v; });
      return '. ' + f + ' also has ' + other.join(', ') + (earlier.length === other.length ? ' (earlier; not part of this payload)' : '') + '; every version is shown under “Claim family ' + f + '” above.';
    });
    return parts.join('');
  }

  function deliveryBlock(sh, did) {
    var s = S.st, D = sh.deliveries[did], K = S.bundle.positions[s.pos].K, T = S.bundle.positions[s.pos].T;
    // R1-13 finding 3: identifiers break at separators and the list stacks label over value at narrow widths (app.css .kv).
    // Finding 15: the encounter-family version is the recipient's submission sequence, not the claim version.
    var box = el('div', { class: 'panel' }, [el('h4', null, ['Delivery ', brk(did)]),
      el('dl', { class: 'kv kv-stack' }, [el('dt', null, ['Encounter family']), el('dd', null, [brk(D.fam), ', encounter version ' + D.ver + ', business attempt ' + D.att + '. The encounter version counts submissions of this family to ' + D.rec + '; it is not the claim version, which is listed next.']),
        el('dt', null, ['Bound claim version']), el('dd', null, [brk(D.cv.join(', ')), ' (the exact version and allocation slice used; later versions never rewrite this payload)' + otherVersionsText(sh, D.cv)]),
        el('dt', null, ['Submitted']), el('dd', null, [ts(D.sub) + (D.sub <= T ? '' : ' (after T: not a historical fact at this position)')]),
        el('dt', null, ['Batch and transaction']), el('dd', null, [brk(D.batch), ' · ', brk(D.tx)]),
        el('dt', null, ['Payload hash']), el('dd', { class: 'mono hash' }, [D.hash])])]);
    box.appendChild(table({ caption: 'Submitted payload lines (normalized synthetic payload, not a standards transaction)', header: ['Claim line', 'Code', 'Units', 'Charge', 'Category', 'Start', 'End'], stack: true,
      rows: D.lines.map(function (l) { return [l[0], l[1], l[2], l[3], l[4], ts(l[5]), ts(l[6])]; }) }));
    var payloadTotal = 0, unsupportedCharges = 0;
    D.lines.forEach(function (l) { var charge = l[3] === null || l[3] === undefined ? null : Math.round(Number(l[3]) * 100); if (charge === null || !isFinite(charge)) unsupportedCharges++; else payloadTotal += charge; });
    box.appendChild(el('p', { class: 'small payload-total' }, ['Submitted payload charge total: ' + (payloadTotal / 100).toFixed(2) + ' over ' + (D.lines.length - unsupportedCharges) + ' of ' + D.lines.length + ' lines' + (unsupportedCharges ? '; ' + unsupportedCharges + ' unsupported charges excluded, total incomplete' : '') + '. Exact submitted charges, not payments or recovered revenue.']));
    var future = !(D.sub <= T && D.sub <= K);
    if (future) {
      box.appendChild(el('p', { class: 'restricted' }, ['Not submitted by T, or not known by K, at this position: shown only as later context. At this position it has no receipt obligations, no responses, no comparisons and no work items. Choose the later date, as known then, to see them.']));
      return box;
    }
    var resp = D.resp.map(function (rid) { var R = sh.responses[rid]; var dsp = byPos(R.disp, s.pos) || ['not received by K', null, null];
      return [rid.slice(0, 16) + '…', R.stage, R.grain, R.out, R.basis.replace(/_/g, ' '), R.issuer + (R.fwd ? ' via ' + R.fwd : ''), R.text || 'none in source', ts(R.eff), ts(R.rec), dsp[0].replace(/_/g, ' ') + (dsp[2] ? ' (' + dsp[2] + ')' : '')]; });
    // R1-13 finding 9: say when the source carries no wording, and that a synthetic rejection carries no reason code.
    var bareRej = D.resp.filter(function (rid) { var R = sh.responses[rid]; return R.out === 'rejected' && !R.text; }).length;
    box.appendChild(table({ caption: 'Responses and assertions bound to this delivery: issuer, relay, grain and original wording are kept', header: ['Row', 'Stage', 'Grain', 'Outcome', 'Basis', 'Issuer', 'Original wording', 'Effective', 'Received', 'Disposition at this position'], rows: resp, stack: true,
      note: '"None in source" means the response row carries no wording to retain; nothing is paraphrased or filled.' + (bareRej ? ' The rejection' + (bareRej > 1 ? 's' : '') + ' here carr' + (bareRej > 1 ? 'y' : 'ies') + ' no reason code and no wording: the synthetic receiver emits none, so the reason cannot be shown (M13 keeps the stage instead).' : '') }));
    var unresolvedFinal = D.resp.some(function (rid) {
      var R = sh.responses[rid], dsp = byPos(R.disp, s.pos) || [];
      return R.stage === 'final' && R.out === 'unresolved' && R.rec <= K && (!R.eff || R.eff <= T) && dsp[0] !== 'not_received_by_K';
    });
    if (unresolvedFinal) box.appendChild(el('p', { class: 'notice unresolved-guidance' }, [
      'A final-stage response was received, but its business outcome is unresolved. This satisfies receipt timing, not acceptance. The source gives no resolved decision to substitute. Suggested follow-up: encounter operations asks ' + D.rec + ' for a record-specific resolved decision and supported decision time, using this delivery identity. No transport-company correction is established by an unresolved outcome alone. This is guidance, not an additional counted work item or evidence that outreach occurred.'
    ]));
    var obl = byPos(D.obl, s.pos) || [];
    box.appendChild(table({ caption: 'Receipt and follow-up obligations (timeliness uses received time only)', header: ['Stage', 'Kind', 'State at T', 'Due', 'Received', 'Later resolution by K'], stack: true,
      rows: obl.map(function (o) { return [o[0].replace(/_/g, ' '), o[1].replace(/_/g, ' '), stateTag(o[2]), o[3] ? ts(o[3]) : 'no due time: ' + (o[2] === 'no_return_promise' ? 'route unavailable, no promise' : 'not established'), o[4] ? ts(o[4]) : 'none', o[5] || 'none by K']; }),
      note: '"None by K" in the last column means the obligation has no later resolution received by K (' + ts(K) + ').' }));
    // Delivery-level work items (receipt and follow-up actions on this delivery), kept apart from unit-level items (R1-15).
    var dwi = byPos(D.wi, s.pos) || [];
    if (dwi.length) box.appendChild(table({ id: 'dwi-' + did.replace(/[^A-Za-z0-9]/g, '_'), caption: 'Delivery work items at this position (one per obligation; not counted again at unit level)', stack: true,
      header: ['Kind', 'Stage', 'Owner role', 'Next action', 'Reason', 'Due', 'Due state', 'Timing basis', 'Age at T'],
      rows: dwi.map(function (w) { return [w[0].replace(/_/g, ' '), (w[10] || '').replace(/_/g, ' '), w[1].replace(/_/g, ' '), w[2], w[3], w[4] ? ts(w[4]) : 'no due time: ' + (w[7] || ''), w[5], w[6], w[8] === null || w[8] === undefined ? 'unknown onset' : hrs(w[8])]; }),
      filters: { record: did, grain: 'delivery work item' } }));
    var cmp = byPos(D.cmp, s.pos);
    var p2c = byPos(D.p2c, s.pos);
    var cmpText = cmp === undefined || cmp === null ? 'not compared at this position (no executed comparison, so no conformance is claimed)' : (cmp.length ? cmp.length + ' non-conforming fields' : 'executed; every compared field conforms');
    box.appendChild(el('p', { class: 'small' }, ['Claim-to-payload comparison: ' + cmpText + (p2c ? '. As an accepted candidate: payload to claim ' + p2c[0] + ', claim to source ' + p2c[1] + ', payload to source ' + p2c[2] + ', ' + p2c[3].replace(/_/g, ' ') + ', reporting scope ' + p2c[4] + '.' : '.')]));
    return box;
  }


  // ---------------------------------------------------------------- event-chain export (R1-10)
  // Self-contained at the selected position: every value is resolved for that position (no position-encoded maps),
  // every response a delivery references is included with its full member scope and, for originating or forwarded
  // evidence, the original artifact and its SHA-256 (sorted-key compact JSON, contracts/response-addendum.md).
  function resolveAt(obj, pos) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && Object.prototype.hasOwnProperty.call(obj, 'b')) return byPos(obj, pos);
    return obj;
  }
  function eventChain(sh, holder, r, fam, pos) {
    var P = S.bundle.positions[pos], T = P.T, K = P.K;
    var item = {}; Object.keys(holder).forEach(function (k) { item[k] = resolveAt(holder[k], pos); });
    var versions = fam ? fam.versions.map(function (v) { var V = sh.versions[v], o = { id: v }; Object.keys(V).forEach(function (k) { o[k] = resolveAt(V[k], pos); }); o.available_at_K = V.avail <= K; return o; }) : [];
    var units = holder.units.map(function (u) { var U = sh.units[u], o = { id: u }; Object.keys(U).forEach(function (k) { if (k !== 'st') o[k] = U[k]; }); o.state = byPos(U.st, pos) || null; return o; });
    var dids = deliveriesFor(sh, holder.units);
    var deliveries = dids.map(function (d) {
      var D = sh.deliveries[d], o = { id: d };
      Object.keys(D).forEach(function (k) { if (['obl', 'p2c', 'cmp', 'wi'].indexOf(k) < 0) o[k] = D[k]; });
      o.at_position = D.sub <= T && D.sub <= K ? 'submitted by T and known by K' : 'not submitted by T or not known by K (later context only)';
      if (o.at_position.indexOf('later') < 0) { o.obligations = byPos(D.obl, pos) || []; o.work_items = byPos(D.wi, pos) || []; o.comparison = byPos(D.cmp, pos); o.as_accepted_candidate = byPos(D.p2c, pos) || null; }
      return o;
    });
    var rids = []; dids.forEach(function (d) { sh.deliveries[d].resp.forEach(function (x) { if (rids.indexOf(x) < 0) rids.push(x); }); });
    var responses = rids.map(function (x) { var R = sh.responses[x], o = { id: x };
      Object.keys(R).forEach(function (k) { if (k !== 'disp') o[k] = R[k]; });
      o.received_by_K = R.rec <= K; o.disposition_at_position = byPos(R.disp, pos) || null; return o; });
    var counts = { versions: versions.length, units: units.length, deliveries: deliveries.length, responses: responses.length,
      originating_artifacts: responses.filter(function (x) { return x.orig; }).length,
      obligations: deliveries.reduce(function (n, d) { return n + (d.obligations || []).length; }, 0),
      work_items: deliveries.reduce(function (n, d) { return n + (d.work_items || []).length; }, 0) + units.reduce(function (n, u) { return n + ((u.state || {}).wi || []).length; }, 0) };
    var man = exportManifest('event-chain-' + r.key, [], ['M01', 'M14', 'M15', 'M16', 'M17'], { record: r.key });
    man.row_count = null; man.counts_by_grain = counts; man.position = pos; man.T = T; man.K = K;
    man.artifact_digest_rule = 'original_artifact_sha256 = SHA-256 of the original artifact as JSON with sorted keys and compact separators; original_artifact_id = ART- plus that digest';
    return { schema_version: 'cci-event-chain-2', record: r, position: pos, T: T, K: K, client: sh.client, item: item, family: fam || null, versions: versions,
      units: units, deliveries: deliveries, responses: responses, manifest: man };
  }

  function financialRecord(sh, holder, pos) {
    var box = el('section', null, [el('h3', { style: 'margin-top:1.4rem' }, ['Financial facts and slots'])]);
    var slots = byPos(holder.slots, pos) || [];
    // R1-13 finding 7: a slot whose supporting record is a claim version takes its amount from that version, not from a source
    // event; the source event of the same type was observed at trip time, before the claim existed. Both rows say so.
    var fromClaim = {}, finNotes = [];
    slots.forEach(function (x) { if (x[4] && sh.versions[x[4]]) fromClaim[x[0]] = x; });
    box.appendChild(table({ caption: 'Typed financial events from source (amounts keep their type and parties; unknown is not zero)', stack: true,
      header: ['Event', 'Type', 'Status', 'Amount', 'Payer', 'Payee', 'Effective', 'Received', 'Reverses', 'Allocations'],
      rows: holder.fin.map(function (f) {
        var sl = fromClaim[f[1]], status = f[2];
        if (sl && f[3] === null && f[4] < sh.versions[sl[4]].avail) {
          status = f[2] + ' (see note)';
          finNotes.push(f[1].replace(/_/g, ' ') + ': this source event was observed ' + ts(f[4]) + ', before claim version ' + sl[4] + ' existed (available ' + ts(sh.versions[sl[4]].avail) + '), so it carries no amount; the ' + f[1].replace(/_/g, ' ') + ' slot below takes ' + (sl[3] === null ? 'its value' : sl[3]) + ' from that claim version.');
        }
        return [brk(f[0]), f[1].replace(/_/g, ' '), status, f[3] === null ? 'none' : f[3], f[7], f[8], ts(f[4]), ts(f[5]), f[6] || '', brk(f[9].map(function (a) { return a[1] + ' ' + a[2] + (a[3] ? ' to ' + a[3] : '') + ' (received ' + a[5].slice(0, 10) + ')'; }).join('; '))];
      }), note: finNotes.length ? 'Note on ' + finNotes.join(' ') : null }));
    box.appendChild(table({ caption: 'Expected slots at this position (state, supported amount and the retained source observation)', stack: true,
      header: ['Type', 'Stage', 'State', 'Amount', 'Supporting event', 'Retained source observation', 'Window boundary'],
      rows: slots.map(function (x) {
        var support = x[4] ? (sh.versions[x[4]] ? x[4] + ' (claim version: the amount is supplied by the claim, not by a source event)' : x[4]) : 'none';
        return [x[0].replace(/_/g, ' '), x[1], stateTag(x[2]), x[3] === null ? 'none' : x[3], support, x[5] ? String(x[5]).replace(/_/g, ' ') : 'none in source', x[6] ? ts(x[6]) : ''];
      }),
      note: 'Retained source observation: when a slot has no supported amount, the status of the latest source event of that type is kept beside the slot state (for example "unknown"). "None in source" means no such observation is retained: the slot is supported, or the source has no event of that type.' }));
    return box;
  }

  function timeline(sh, holder, r, fam) {
    var s = S.st, K = S.bundle.positions[s.pos].K, ev = [];
    holder.src.forEach(function (x) { ev.push([x[3], 'Source received: ' + x[1] + ' ' + x[0]]); });
    if (fam) fam.versions.forEach(function (v) { ev.push([sh.versions[v].avail, 'Claim version available: ' + v]); });
    holder.units.forEach(function (u) { var st = byPos(sh.units[u].st, s.pos) || {}; Object.keys(st.r || {}).forEach(function (stage) { var x = st.r[stage]; if (x[1]) ev.push([x[1], 'Ready for ' + lc(STAGE_LABEL[stage]) + ': ' + sh.units[u].comp + ' ' + sh.units[u].rec]); }); });
    deliveriesFor(sh, holder.units).forEach(function (d) { var D = sh.deliveries[d]; ev.push([D.sub, 'Submitted: ' + d]); D.resp.forEach(function (rid) { var R = sh.responses[rid]; ev.push([R.rec, 'Response received: ' + R.stage + ' ' + R.out + ' (' + R.basis.replace(/_/g, ' ') + ')' + (R.eff ? ', effective ' + ts(R.eff) : ', effective time unknown')]); }); });
    holder.fin.forEach(function (f) { ev.push([f[5], 'Financial event received: ' + f[1].replace(/_/g, ' ') + ' ' + f[2] + (f[3] ? ' ' + f[3] : '')]); });
    ev.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    var ol = el('ol', { class: 'timeline', 'aria-label': 'Ordered events for ' + r.key }, ev.map(function (e) { return el('li', { class: e[0] > K ? 'after-k' : null, tabindex: '0' }, [ts(e[0]) + ' · ' + e[1] + (e[0] > K ? ' (after K: not known at this position)' : '')]); }));
    return el('section', null, [el('h3', { style: 'margin-top:1.4rem' }, ['Ordered event table']), el('p', { class: 'small' }, ['Received-time order. Focus moves through events with Tab; events after K are shown but marked unknown at this position.']), ol]);
  }

  function bridgeTable(sh, holder, r) {
    var rows = [];
    var poss = ['known_then', 'restated_then', 'current_later'];
    if (r.kind === 'leg') rows.push(['Completed-leg coverage (M01)'].concat(poss.map(function (p) { return byPos(holder.cov, p) || 'none'; })));
    holder.units.slice().sort().forEach(function (u) {
      var U = sh.units[u];
      rows.push([U.comp + ' ' + U.rec + ' encounter readiness'].concat(poss.map(function (p) { var st = byPos(U.st, p) || {}; var x = (st.r || {})[U.pur === 'audit' ? 'audit_submission' : 'encounter_submission']; return x ? x[0] : 'none'; })));
      rows.push([U.comp + ' ' + U.rec + ' outcome and basis'].concat(poss.map(function (p) { var st = byPos(U.st, p) || {}; return (st.o || 'none') + ' / ' + (st.b || 'none').replace(/_/g, ' '); })));
    });
    var changed = rows.filter(function (x) { return x[1] !== x[2] || x[2] !== x[3]; }).length;
    return el('section', null, [el('h3', { style: 'margin-top:1.4rem' }, ['Position bridge']),
      el('p', { class: 'small' }, ['Known then and restated then hold T fixed and differ only in K (later evidence whose effect qualifies by T). Current later moves T. ' + (changed ? changed + ' of ' + rows.length + ' rows differ across positions.' : 'No row differs across positions.')]),
      table({ id: 'bridge-' + r.key, caption: 'State of this record at each position', header: ['Item', 'Known then', 'Restated then', 'Current later'], rows: rows, stack: true, filters: { record: r.key } })]);
  }

  function miniature(id) {
    var minis = (S.extra.stories || {}).miniatures || {};
    var m = minis[id];
    if (!m) return el('p', { class: 'notice' }, ['Unknown miniature ' + id]);
    var box = el('section', { class: 'panel' }, [el('p', { class: 'eyebrow' }, ['Public miniature · ' + m.source]), el('h2', { style: 'margin-top:.2rem' }, [m.title]),
      el('p', { class: 'small' }, [m.text]), el('p', { class: 'restricted' }, ['This is a curated public golden example executed by the engine, not a record of the operational population and not held-out evaluation.'])]);
    box.appendChild(table({ caption: m.table_caption, header: m.header, rows: m.rows, stack: true }));
    if (m.golden) box.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['The complete golden input and expectation (' + m.golden.case + ' / ' + m.golden.variant + ', status ' + (m.status || '?') + ')']),
      el('pre', { class: 'mono small' }, [JSON.stringify(m.golden, null, 1)])]));
    return box;
  }

  function completedChecks(V) {
    var record = V.completion;
    if (!record) return el('p', { class: 'notice' }, ['Completion records are not in this bundle.']);
    var box = el('section', { class: 'evidence-overview completed-checks', 'aria-labelledby': 'completed-checks-h' }, [
      el('p', { class: 'eyebrow' }, ['Test records / October 19, 2026']),
      el('h2', { id: 'completed-checks-h' }, ['Test results and their scope.']),
      el('p', { class: 'small' }, ['Known-answer cases, numerical comparisons and browser checks have recorded passing results. Each result keeps its tested scope.'])
    ]);
    var scope = V.scope_checklist;
    if (scope) box.appendChild(el('div', { class: 'completion-regressions', 'aria-label': 'Scoped build checklist' }, [
      stateTagStatus(scope.applicable_gate), el('strong', null, ['Applicable prepublication checklist']),
      el('p', null, [scope.counts.pass + ' checks pass · ' + scope.counts.not_applicable + ' not applicable at this scope and phase.']),
      el('p', { class: 'small' }, ['N/A covers scheduled operation, the legacy custody probe and publication-only readback before deployment. Detection evaluation belongs to build forward and is excluded from the current checklist. N/A is not a passing observation. Public readback becomes required at publication. ', evidenceLink('build-scope-checklist.json', 'Complete checklist and recorded outcomes'), ' · ', evidenceLink('build-scope-policy.json', 'Scope policy')])
    ]));
    box.appendChild(el('div', { class: 'grid-2' }, record.records.map(function (source) {
      var r = Object.assign({}, source);
      if (scope && r.id === 'goldens') {
        r.value = scope.golden.passed + ' / ' + scope.golden.applicable;
        r.status = scope.golden.status;
        r.detail = scope.golden.assertions_compared + ' of ' + scope.golden.assertions_required + ' applicable assertions compared. Every in-scope fixture variant passes.';
        r.limit = 'All 102 registered variants are accounted for: 98 applicable fixtures pass; custody certification and scheduled operation are N/A to this build, and two public-readback variants are N/A before publication. Public readback becomes required at deployment.';
      }
      return el('article', { class: 'evidence-card completed-check-card', 'data-completed-check': r.id }, [
        el('p', { class: 'eyebrow' }, [r.label]), stateTagStatus(r.status),
        el('h3', { class: 'completed-check-value' }, [r.value]),
        el('p', null, [r.detail]), el('p', { class: 'small' }, [r.limit])
      ]);
    })));
    box.appendChild(el('div', { class: 'completion-regressions' }, [stateTagStatus('pass'),
      el('strong', null, ['Regression suites']), el('p', null, [record.regression_summary]),
      el('p', { class: 'small' }, [record.package_gates])
    ]));
    if (V.review) box.appendChild(el('div', { class: 'completion-regressions' }, [stateTagStatus(V.review.status),
      el('strong', null, ['Chart review and restricted reading panel']),
      el('p', null, [V.review.summary]),
      el('p', { class: 'small' }, ['Four separate simulated-reader processes reviewed rendered images; prompts were frozen before returns. All actionable findings have dispositions and changed guidance was rechecked. Same model service and workstation; no certified blindness, independent custody or human-user research. ', evidenceLink('review-receipt-2026-10-19.json', 'Review evidence'), ' · ', evidenceLink('reading-panel-2026-10-19.json', 'Finding dispositions')])
    ]));
    box.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['Remaining assurance limits and the recorded run']),
      el('p', { class: 'small' }, [record.limits]),
      el('p', { class: 'small' }, ['Passing observations are tied to their recorded runs and current review assets. Independent custody was not established: this limits claims about an unseen, independently controlled evaluation, not the arithmetic comparison of published cells. Broader detection evaluation is a build-forward candidate. Live-site readback will compare deployed bytes, not change the frozen figures. Original strict outcomes remain available alongside the current scope. ',
        evidenceLink('completed-review-checks-2026-10-19.json', 'Test records and source hashes'), ' · ',
        jumpButton('verification-h', 'Read all surface statuses ↓')])
    ]));
    return box;
  }

  // ---------------------------------------------------------------- View C
  function renderC(app) {
    headerBlock(app, 'Healthcare analytics / Understand the data', 'Know what the numbers <span class="serif">can tell you</span><span class="stop">.</span>',
      'Before deciding what to fix, check what is being counted, which evidence supports it and which date the result describes.');
    explanatoryHero(app, {
      label: 'Three questions to ask', title: 'Meaning. Evidence. Limits.',
      prompts: ['What do a claim and an encounter represent?', 'What can this result support as a business conclusion?', 'Which facts are still missing or unknown?'],
      actions: [jumpButton('business-terms-h', 'Start with the terms ↓', 'btn-dark'), jumpButton('methods-h', 'Methods and test records ↓')]
    });
    var s = S.st, V = S.extra.verification || {};
    app.appendChild(readingNav([['business-terms-h', 'The terms'], ['meaning-h', 'Reading the results'], ['definitions-h', 'Measure definitions'], ['methods-h', 'Methods and test records'], ['future-h', 'Build forward']], 'Find an explanation'));
    app.appendChild(businessTerms());
    app.appendChild(readingGuide());
    // Measure catalog
    var reg = Object.assign({}, S.bundle.measures); delete reg.M09;
    var rows = Object.keys(reg).sort().map(function (m) {
      var x = reg[m], sup = x.supported;
      return [el('a', { href: hashOf(Object.assign({}, s, { rec: m })) }, [m]), x.title, x.grain || '', (sup.client_filters.length > 1 ? 'clients and profiles' : 'all only') + '; ' + (sup.periods.length > 1 ? 'four periods' : 'full period') + (sup.stages.length > 1 ? '; three stages' : ''), sup.restriction || '', x.cell_count || 0];
    });
    var definitions = chapter(el('section', null, [el('h2', { id: 'definitions-h' }, ['Choose a measure'])]), 'definitions', '01 / Meaning before interpretation');
    definitions.appendChild(el('p', { class: 'small' }, ['Start with a definition. Each measure names its own population, exclusions, cutoffs and supported filters.']));
    definitions.appendChild(el('div', { class: 'definition-picker' }, [el('label', { for: 'measure-picker' }, ['Measure definition']),
      el('select', { id: 'measure-picker', onchange: function (e) { go({ rec: e.target.value }); } }, [el('option', { value: '' }, ['Choose a measure'])].concat(Object.keys(reg).sort().map(function (m) { return el('option', { value: m, selected: s.rec === m }, [reg[m].title + ' (' + m + ')']); })))
    ]));
    definitions.appendChild(el('div', { class: 'btn-row' }, [['M14', 'Claim construction'], ['M15', 'Target readiness'], ['M16', 'Outcome evidence']].map(function (r) { return el('a', { class: 'btn', href: hashOf(Object.assign({}, s, { rec: r[0] })) }, [r[1]]); })));
    if (s.rec && reg[s.rec]) definitions.appendChild(measureDetail(s.rec));
    definitions.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['Full measure register']), table({ id: 'register', caption: 'Published measures, their grain and supported filters (governance/metric_register.md)', header: ['ID', 'Measure', 'Grain', 'Supported filters', 'Restriction', 'Published cells'], rows: rows, num: [5], stack: true })]));
    // Crosswalk
    definitions.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['Where each measure appears']), table({ caption: 'Chart and table to measure catalog', header: ['Element', 'View', 'Measures'], stack: true, rows: [
      ['Fixed snapshot cards and expanded context', 'A', 'M01, M03, M14, M15, M16, M17'], ['Primary cards', 'A', 'M14, M15, M16'], ['Blocker diagnostic panel and table', 'A', 'M15 explanatory submeasures'],
      ['Downstream cards', 'A', 'M01, M03, M05'], ['Chart: why completed legs are not covered', 'A', 'M02'], ['Deadline and elapsed-time table', 'A', 'M04, M07'],
      ['Clients, routes and evidence table', 'A', 'M16'], ['Typed financial panel', 'A', 'M17'], ['Residual panel', 'A', 'M11, M12, M13, M18'],
      ['Record readiness, work items, downstream and bridge tables', 'B', 'M01, M06, M14, M15, M16, M17, M19'], ['Verification and public diagnostic tables', 'C', 'M08, M10']] })]));
    app.appendChild(definitions);
    var methods = el('details', { class: 'fold methods-details', id: 'methods-h' }, [el('summary', null, ['Methods and test records']),
      el('p', { class: 'small' }, ['Separate calculations matched all 22,173 published numerical cells in the recorded review. Synthetic scenarios demonstrate behavior; they do not establish real-world performance. Independent evaluator custody and human user research were not established. Original records below describe their own reviewed revisions; this presentation update does not rerun those historical reviews.'])]);
    methods.appendChild(completedChecks(V));
    // Verification summaries
    methods.appendChild(chapter(el('section', null, [el('h2', { id: 'verification-h' }, ['Recorded checks and their scope']),
      el('p', { class: 'small' }, ['Build dispositions follow the declared frozen-build scope. Linked records retain the full-scope evidence outcomes. N/A requirements and accepted limitations are not test passes; this is an assessment of recorded checks, not a new execution of every test.']), verificationTable(V)]), 'verification', '02 / Verification evidence'));
    methods.appendChild(chapter(el('section', null, [el('h2', { id: 'detectors-h' }, ['Public diagnostic checks']),
      el('p', { class: 'small' }, ['81 applicable public injections and their clean pairs passed. The legacy custody probe is N/A; absence of its resource is not evidence of an access denial.']), detectorSection(V)]), 'detectors', '03 / Public fault checks'));
    var accounting = chapter(el('section', null, [el('h2', { id: 'accounting-h' }, ['Raw evidence accounting (M08)'])]), 'accounting', '04 / Every response keeps its disposition');
    var m08 = ['raw_rows', 'raw_duplicate_deliveries', 'duplicate_effects_prevented', 'unmatched_responses', 'too_broad', 'contradictory_rows', 'conflict_episodes', 'lineage_conflicts', 'received_after_K', 'bound_to_submission_after_T'];
    accounting.appendChild(table({ id: 'm08', caption: 'Every raw response row keeps a disposition (' + posWords(s.pos) + '; all clients, full period only)', header: ['Disposition', 'Rows'], num: [1], measures: ['M08'], filters: { client: 'ALL', period: 'FULL' },
      rows: m08.map(function (k) { return [k.replace(/_/g, ' '), C('M08', k, { client: 'ALL', period: 'FULL' })]; }) }));
    methods.appendChild(accounting);
    methods.appendChild(chapter(el('section', null, [el('h2', { id: 'files-h' }, ['Follow the evidence files']),
      el('p', { class: 'small' }, ['Each link retains the declared revision, currency and source hash. A historical receipt is evidence of that recorded execution.']),
      el('details', { class: 'fold' }, [el('summary', null, ['Open the complete served-file inventory']), evidenceList()])]), 'evidence-files', '05 / Source and revision trail'));
    if (window.CCI_REVIEW_NOTES) {
      var reviewNotes = el('section', { class: 'transferred-review-notes', id: 'case-study-review-notes' }, [el('h2', null, ['Detailed review scope and implementation'])]);
      reviewNotes.insertAdjacentHTML('beforeend', window.CCI_REVIEW_NOTES.methods);
      methods.appendChild(reviewNotes);
    }
    app.appendChild(methods);
    var future = chapter(el('section', null, [el('h2', { id: 'future-h' }, ['Build forward: detection evaluation']),
      el('p', null, ['Detection evaluation is a future candidate, not a current test surface for this build or the comparison matrix. A future independently held population could measure detection, misses, false alarms and timing across a declared fault roster.']),
      el('details', { class: 'fold' }, [el('summary', null, ['Historical context for the future candidate']),
        el('p', { class: 'small' }, ['Exploratory unblinded attempt 2 met must-catch in 20 of 26 represented classes, with six missed targets and ten of 36 classes unrepresented. It used older controls and shared custody; it does not establish effectiveness of final controls. These archived results are context for future work, not a completed current test.']),
        evidenceLink('detection-results-2.json', 'Archived attempt-2 evidence')])]), 'build-forward', '06 / Future candidate');
    if (s.rec === 'M09') future.appendChild(measureDetail('M09'));
    if (window.CCI_REVIEW_NOTES) {
      var futureNotes = el('div', { class: 'transferred-review-notes' });
      futureNotes.innerHTML = window.CCI_REVIEW_NOTES.future;
      future.appendChild(futureNotes);
    }
    app.appendChild(future);
    app.appendChild(chapter(el('section', null, [el('h2', { id: 'execution-h' }, ['Historical execution health (M10)']),
      el('p', { class: 'small' }, ['Frozen synthetic snapshot, with no live data edge. Schedules were removed under the 2026-10-19 owner acceptance. The historical receipt below retains its original status and timestamps; a successful scheduled-run receipt is not required for this build.']),
      healthStrip(), el('p', { class: 'small' }, ['Public fault injections and naturally occurring execution failures remain separate evidence. Future detection evaluation is described in Build forward.'])]), 'execution', '07 / Execution history'));
    understandDataBusiness(app);
  }

  // View C presentation only. Published tables, definitions, exports and historical receipts stay intact.
  function understandDataBusiness(app) {
    var hero = app.querySelector('.hero'), copy = hero.querySelector('.hero-copy');
    copy.insertBefore(el('ul', { class: 'data-hero-points' }, [
      el('li', null, [el('strong', null, ['Count the right work: ']), 'one ride can create several reporting requirements.']),
      el('li', null, [el('strong', null, ['Make the supported decision: ']), 'ready, accepted, correct and paid mean different things.'])
    ]), copy.querySelector('.hero-actions'));
    copy.querySelector('.hero-actions').replaceChildren(jumpButton('data-counts', 'Why do the counts differ? ↓', 'btn-dark'), jumpButton('definitions', 'Find a measure ↓'));
    var nav = app.querySelector(':scope > .reading-nav');if (nav) nav.remove();
    var guide = hero.querySelector('aside');
    guide.replaceChildren(el('p', { class: 'eyebrow' }, ['Three questions before acting']), el('h2', null, ['What counts? What is known? What follows?']),
      el('ul', { class: 'data-start-list' }, [
        el('li', null, [el('strong', null, ['Population: ']), 'rides, components or submitted claim families?']),
        el('li', null, [el('strong', null, ['Evidence: ']), 'a source decision, a client note or no usable answer?']),
        el('li', null, [el('strong', null, ['Action: ']), 'obtain a fact, correct a record or follow up on a response?'])]));
    var terms = app.querySelector('.business-terms');terms.id = 'data-terms';
    var reading = app.querySelector('#reading-guide'), definitions = app.querySelector('#definitions'), methods = app.querySelector('#methods-h');
    var originalFolds = Array.from(reading.querySelectorAll(':scope > details'));
    reading.querySelector('#meaning-h').textContent = 'Same record. Different follow-ups.';
    reading.querySelectorAll('.term-grid > article').forEach(function (card) {
      var paragraphs = Array.from(card.querySelectorAll(':scope > p'));
      var points = el('ul', { class: 'data-points' }, paragraphs.map(function (p) { return el('li', null, [p.textContent]); }));
      paragraphs.forEach(function (p) { p.remove(); });card.appendChild(points);
    });
    var counts = chapter(el('section', { class: 'data-explainer' }, [el('h2', null, ['One ride can count several ways.']),
      el('p', null, ['A reporting unit is one required service component for one recipient and purpose. It is not a patient, a ride or a whole claim.']),
      el('ol', { class: 'data-count-flow', 'aria-label': 'Illustrative counting example, not extra records in the dataset' }, [
        ['1', 'Completed ride', 'One patient travels one way to a medical appointment.'],
        ['2', 'Service components', 'The model separates the base service from mileage.'],
        ['2', 'Units for one target', 'Both components must satisfy that recipient’s requirements.']
      ].map(function (r) { return el('li', null, [el('span', { class: 'data-count-icon', 'aria-hidden': 'true' }, [r[0]]), el('h3', null, [r[1]]), el('p', null, [r[2]])]); })),
      el('div', { class: 'data-callout' }, [el('strong', null, ['Add a second destination: ']), 'the same two components create two more units. Juniper Way Health Plan’s separate audit requirement therefore adds work without adding a ride.']),
      el('ul', { class: 'data-points' }, [
        el('li', null, [el('strong', null, ['Claim family: ']), 'a claim identity whose versions are tracked together. Contract rules determine which services and reporting use it covers.']),
        el('li', null, [el('strong', null, ['Grouped rides: ']), 'two rides may share a claim header while keeping separate component requirements.']),
        el('li', null, [el('strong', null, ['Required cancellations: ']), 'some contract profiles require a cancelled-service report, even though no completed ride belongs in that population.'])])]), 'data-counts', '01 / Count the work before comparing the numbers');
    var fixed = { pos: 'current_later', client: 'ALL', period: 'FULL' };
    var p = C('M14', 'denominator', fixed), enc = C('M15', 'denominator', Object.assign({ stage: 'encounter_submission' }, fixed)), audit = C('M15', 'denominator', Object.assign({ stage: 'audit_submission' }, fixed));
    counts.appendChild(el('div', { class: 'data-count-bridge' }, [
      el('p', { class: 'data-scope' }, ['Fixed reference · July 21 later snapshot · all six health plans · full service period']),
      el('h3', null, ['Where do the other ' + n(audit) + ' units go?']),
      el('div', { class: 'data-bridge-grid' }, [
        [n(p), 'Required preparation units', 'All applicable targets, including the separate audit destination.'],
        [n(enc), 'Encounter-submission units', 'The denominator for readiness to send an encounter report.'],
        [n(audit), 'Separate audit units', 'Juniper Way’s audit destination, assessed under its own submission rules.']
      ].map(function (r) { return el('article', null, [el('strong', { class: 'data-big-number' }, [r[0]]), el('h4', null, [r[1]]), el('p', null, [r[2]])]); })),
      el('p', { class: 'data-callout' }, ['These populations are not steps in a funnel. The audit units are outside the encounter-submission denominator; they have not disappeared.'])]));
    originalFolds[0].querySelector('summary').textContent = 'Inspect the population counts and counting units';
    originalFolds[0].insertBefore(el('p', { class: 'data-scope' }, ['Population table · ' + posWords(S.st.pos) + ' · all six health plans · full service period. The reference bridge above remains fixed to July 21.']), originalFolds[0].querySelector(':scope > p'));
    counts.appendChild(originalFolds[0]);
    app.insertBefore(counts, reading);
    var time = chapter(el('section', { class: 'data-explainer' }, [el('h2', null, ['Which date does the answer describe?']),
      el('p', null, ['Two clocks matter: when something applied to the business, and when its evidence became available. Later knowledge cannot make a claim version exist earlier.']),
      el('div', { class: 'data-time-grid' }, [
        ['July 14 · known then', 'Business date: July 14', 'Evidence available by: July 14', 'The billing reference is missing, so the example claim is blocked.'],
        ['July 14 · with later evidence', 'Business date: July 14', 'Evidence available by: July 21', 'The July 16 correction can be inspected, but cannot make the July 14 claim ready.'],
        ['July 21 · later snapshot', 'Business date: July 21', 'Evidence available by: July 21', 'The corrected claim is now ready. Its submission has a supported rejection.']
      ].map(function (r) { return el('article', null, [el('h3', null, [r[0]]), el('ul', { class: 'data-points' }, r.slice(1).map(function (text) { return el('li', null, [text]); }))]); })),
      el('p', { class: 'data-callout' }, [el('strong', null, ['Why July 14? ']), 'It is a selected demonstration cutoff, not a 15-day filing requirement. Services run April 1 through June 29; the three 30-day filter windows are fixed demo slices, not a calendar-month reporting policy.']),
      el('a', { class: 'btn', href: '#view=b&pos=known_then&rec=SYN-C01%3AS000001&story=DEMO01' }, ['Inspect this record across snapshots ↗'])]), 'data-time', '02 / Separate business time from evidence arrival');
    originalFolds[1].querySelector('summary').textContent = 'Exact cutoff rules and population symbols';time.appendChild(originalFolds[1]);app.insertBefore(time, reading);
    var chain = chapter(el('section', { class: 'data-explainer' }, [el('h2', null, ['Accepted does not settle every question.']),
      el('p', null, ['Keep each handoff visible so an error can be traced to the right place. A recipient’s acceptance does not prove that the submitted facts match their sources.']),
      el('ol', { class: 'data-evidence-flow', 'aria-label': 'Four evidence handoffs' }, [
        ['01', 'Source facts', 'What do the trip, health-plan and billing records support?'],
        ['02', 'Claim version', 'Were those facts assembled correctly into the claim?'],
        ['03', 'Sent record', 'Did the submission preserve that exact claim content?'],
        ['04', 'Recipient response', 'What decision is supported for the submitted components?']
      ].map(function (r) { return el('li', null, [el('span', { class: 'data-count-icon', 'aria-hidden': 'true' }, [r[0]]), el('h3', null, [r[1]]), el('p', null, [r[2]])]); })),
      el('div', { class: 'data-callout' }, [el('strong', null, ['Example: ']), 'the source supports 5 units, but the claim and sent record contain 6. Acceptance remains acceptance; the source comparison exposes the error. This is a focused test case, outside the report’s operational population.']),
      el('a', { class: 'btn', href: '#view=b&rec=MINI%3AG15-upstream&story=DEMO02' }, ['Follow the accepted-but-wrong test case ↗'])]), 'data-evidence', '03 / Match a conclusion to its evidence');
    app.insertBefore(chain, definitions);
    var accounting = app.querySelector('#accounting');
    accounting.querySelector('h2').textContent = 'What happens to repeated or unusable responses?';
    accounting.insertBefore(el('div', { class: 'data-mini-grid' }, [
      ['Repeated delivery', 'Keep the raw row, but prevent the same decision from earning credit twice.'],
      ['Cannot match a record', 'Retain the evidence without assigning it to an unsupported claim or component.'],
      ['Conflicting decisions', 'Keep the disagreement visible rather than choosing the more convenient answer.']
    ].map(function (r) { return el('article', null, [el('h3', null, [r[0]]), el('p', null, [r[1]])]); })), accounting.querySelector(':scope > div'));
    var accountingTable = accounting.querySelector('#t-m08').closest('.table-wrap').parentElement;
    var accountingFold = el('details', { class: 'fold' }, [el('summary', null, ['Inspect raw response accounting'])]);accountingTable.replaceWith(accountingFold);accountingFold.appendChild(accountingTable);
    app.insertBefore(accounting, definitions);
    definitions.querySelector('h2').textContent = 'Find the measure behind a business question.';
    definitions.insertBefore(el('p', { class: 'data-scope' }, ['Selected module scope · ' + (CF_LABEL[S.st.client] || S.st.client) + ' · ' + PERIOD_LABEL[S.st.period] + ' · ' + posWords(S.st.pos) + '. Each measure states which filters it supports.']), definitions.querySelector('.definition-picker'));
    var panel = definitions.querySelector(':scope > .panel');
    if (panel) dataMeasureGuide(panel, S.st.rec);
    var confidence = chapter(el('section', { class: 'data-explainer' }, [el('h2', null, ['What was checked, and what does that support?']),
      el('div', { class: 'data-confidence-grid' }, [
        el('article', null, [el('h3', null, ['The published numbers were checked.']), el('ul', { class: 'data-points' }, [
          el('li', null, [el('strong', null, ['22,173 numerical cells matched separate calculations. ']), 'A cell is one published value for a defined measure and scope, such as a readiness count for one health plan and snapshot. It is not a claim or an encounter.']),
          el('li', null, [el('strong', null, ['Known-answer cases check the rules. ']), 'Examples include keeping late evidence out of an earlier view and separating a wrong claim from a changed submission.']),
          el('li', null, [el('strong', null, ['Business value: ']), 'these checks support consistent queue counts and traceable explanations for why a record is blocked or unresolved.'])])]),
        el('article', null, [el('h3', null, ['The evidence has limits.']), el('ul', { class: 'data-points' }, [
          el('li', null, ['Synthetic scenario mixes ensure that different cases appear. They do not estimate real-world acceptance, payment delays or error rates.']),
          el('li', null, ['Numerical agreement does not validate a client’s actual contract rules, prove payment or certify submission to a real payer.']),
          el('li', null, ['Restricted simulated reader review is recorded. Independent evaluator custody, certified blindness and human-user research are not claimed.'])])])]),
      jumpButton('methods-h', 'Inspect recorded tests and their scope ↓')]), 'data-confidence', '04 / Evidence behind the model');
    app.insertBefore(confidence, methods);
    methods.querySelector(':scope > summary').textContent = 'Methods, completed checks and their limits';
    var execution = app.querySelector('#execution');methods.appendChild(execution);
    app.querySelectorAll('details > summary').forEach(function (summary) {
      var label = summary.closest('#definitions') ? 'Definition reference' : summary.closest('#accounting, #data-counts') ? 'Uses module snapshot' : 'Recorded or fixed reference';
      summary.appendChild(el('span', { class: 'data-fold-scope' }, [label]));
    });
  }

  function dataMeasureGuide(panel, id) {
    var meanings = {
      M01: ['Do completed rides have acceptance for every required component and destination?', 'A partially accepted ride stays outside full coverage. This is evidenced coverage, not unseen business acceptance.'],
      M02: ['Why is a completed ride not fully covered?', 'Each ride appears under the first applicable explanation, so overlapping problems do not count it twice. The order is a rule sequence, not severity.'],
      M03: ['What happened to the first encounter submission?', 'This counts first-submitted claim families, not rides or service-date windows. A later correction does not replace the original first attempt.'],
      M04: ['Was each required component covered by its own deadline?', 'A late acceptance and an acceptance on time are different operational results. Timing that cannot be established stays explicit.'],
      M05: ['Which promised responses or follow-ups are overdue?', 'A route with no return promise does not create an invented overdue receipt. Client follow-up is a separate obligation.'],
      M06: ['Which actionable issues remain open, and how old are they?', 'A missing billing fact, a rejection and an overdue response require different follow-ups. Work-item counts are not distinct ride counts.'],
      M07: ['How long did valid acceptance take?', 'Elapsed-time summaries describe qualifying accepted rides. Never-yet-accepted rides remain accounted for separately.'],
      M08: ['Were duplicate, unmatched or conflicting responses retained correctly?', 'Raw evidence accounting shows what was received and how it was treated; extra response rows do not automatically mean extra outcomes.'],
      M10: ['What execution history was recorded?', 'This is a frozen snapshot with no live data edge. Historical run information does not certify a current operating schedule.'],
      M11: ['Does an accepted submission match its claim and source facts?', 'An accepted record can still contain a content mismatch. Missing source truth remains unassessable rather than being filled from the intended scenario.'],
      M12: ['Was an accepted claim outside its supported reporting scope?', 'Acceptance does not establish that the service should have been reported. Unknown applicability is kept separate from explicit nonreportability.'],
      M13: ['Why was a first attempt rejected?', 'Reason shares belong to their defined first-attempt rejection population. A missing source reason cannot be invented to explain a rejection.'],
      M14: ['Has the required claim preparation been constructed?', 'The expected population includes work that has no claim yet. Counting only built claims would hide that missing work.'],
      M15: ['Can each required component move forward for this use?', 'A claim can be ready for one use and blocked for another. Encounter submission excludes the separate audit-purpose units.'],
      M16: ['Is the reporting outcome supported by usable evidence?', 'A supported rejection confirms an outcome. A client note reporting acceptance is still an assertion unless the originating decision is supported.'],
      M17: ['Which money facts are actually supported?', 'Ride cost, claim charge, allowed amount, payer payment, vendor payment and member collection remain separate. Unknown is not zero or unpaid.'],
      M18: ['Does the assembled claim match its supporting sources?', 'This checks the claim before conflating it with what was sent. A claim error and a submission error can require different corrections.'],
      M19: ['When did the claim become ready for its target?', 'Readiness starts only when the required version and support exist. A later-arriving correction cannot be backdated into earlier readiness.']
    };
    var meaning = meanings[id];if (!meaning) return;
    panel.querySelector('h3').insertAdjacentElement('afterend', el('div', { class: 'data-measure-meaning' }, [el('strong', null, [meaning[0]]), el('p', null, [meaning[1]])]));
    var definitionTable = panel.querySelector('#t-definition-' + id).closest('.table-wrap').parentElement;
    var exact = el('details', { class: 'fold' }, [el('summary', null, ['Exact definition, population and exclusions'])]);definitionTable.replaceWith(exact);exact.appendChild(definitionTable);
  }

  // Measure detail: the register's own clauses for this measure, the live counts, the shared clocks and the
  // independent re-derivation result, with links to the served register and evidence (R1-12).
  function evidenceLink(name, label) {
    var e = (S.bundle.served_evidence || []).filter(function (x) { return x.served === 'evidence/' + name; })[0];
    if (!e) return el('span', null, [label + ' (not served)']);
    return el('a', { href: e.served, 'data-evidence': e.served, 'data-sha256': e.source_sha256 }, [label]);
  }
  function measureDetail(m) {
    var s = S.st, x = S.bundle.measures[m], reg = (S.bundle.register || {}).measures || {}, R = reg[m] || { clauses: {}, other: [] };
    var box = el('section', { class: 'panel', id: 'measure-' + m }, [el('h3', null, [m + ' ' + x.title]),
      el('p', { class: 'small' }, ['Register version ' + ((S.bundle.register || {}).version || '?') + ', definition version ' + x.definition_version + '. ', evidenceLink('metric_register.md', 'Open the register'), '.']),
      x.supported.restriction ? el('p', { class: 'restricted' }, [x.supported.restriction]) : null]);
    var popSym = (R.clauses.Population || '').split(/[ .,;]/)[0];
    var pop = ((S.bundle.register || {}).populations || {})[popSym];
    var clocks = ((S.bundle.register || {}).shared_rules || []).filter(function (r) { return /^Position|^Availability/.test(r); });
    var P = S.bundle.positions[s.pos];
    var defRows = [
      ['Owner role', R.clauses['Owner role'] || 'not stated in the register'],
      ['Grain', R.clauses.Grain || x.grain || 'not stated in the register'],
      ['Population', (R.clauses.Population || 'not stated in the register') + (pop ? ': ' + pop.members + ' (grain ' + pop.grain + ')' : '')],
      ['Numerator', R.clauses.Numerator || 'not stated separately in the register (see the measure text below)'],
      ['Denominator', R.clauses.Denominator || 'not stated separately in the register (see the measure text below)'],
      ['Exclusions', R.clauses.Exclusions || 'none stated in the register'],
      ['Milestone', R.clauses.Milestone || 'not stated in the register'],
      ['Clocks', (R.clauses.Clocks ? R.clauses.Clocks + '. ' : '') + 'This view: ' + posWords(s.pos) + ', T ' + ts(P.T) + ', K ' + ts(P.K) + '. ' + clocks.join(' ')],
      ['Submeasures', R.clauses.Submeasures || (x.submeasures || []).join(', ')],
      ['Lineage', R.clauses.Lineage || 'not stated in the register'],
      ['Limits', R.clauses.Limits || 'not stated in the register']];
    Object.keys(R.clauses).forEach(function (k) { if (['Owner role', 'Grain', 'Population', 'Numerator', 'Denominator', 'Exclusions', 'Milestone', 'Clocks', 'Submeasures', 'Lineage', 'Limits'].indexOf(k) < 0) defRows.push([k, R.clauses[k]]); });
    (R.other || []).forEach(function (o) { defRows.push(['Further rule', o]); });
    box.appendChild(table({ id: 'definition-' + m, caption: m + ' definition from the register (verbatim clauses)', header: ['Clause', 'Text'], rows: defRows, stack: true }));
    var rd = (S.bundle.rederivation_per_measure || {})[m];
    box.appendChild(el('p', { class: 'small', id: 'comparison-' + m }, [rd ? 'Independent re-derivation of every published ' + m + ' cell: ' + n(rd.matched) + ' of ' + n(rd.published) + ' matched, ' + n(rd.mismatched) + ' mismatched, ' + n(rd.missing) + ' missing, ' + n(rd.unexpected) + ' unexpected. ' : m + ' has no published cells to re-derive (see the verification table). ', evidenceLink('rederivation.json', 'Re-derivation report'), ' · ', evidenceLink('reconciliation.md', 'Reconciliation'), ' · ', evidenceLink('check-results.json', 'All required checks')]));
    var per = effPeriod(m), cf = effClient(m);
    var stages = x.supported.stages;
    var rows = [];
    stages.forEach(function (stg) {
      (x.submeasures || []).forEach(function (sub) {
        var v = C(m, sub, { period: per, client: cf, stage: stg });
        if (v !== null) rows.push([stg === '-' ? '' : STAGE_LABEL[stg], sub, v === null ? 'Not available' : v]);
      });
    });
    box.appendChild(table({ id: 'measure-' + m, caption: m + ' cells at the ' + posWords(s.pos) + ', ' + (CF_LABEL[cf] || cf) + ', ' + lc(PERIOD_LABEL[per]), header: ['Stage', 'Submeasure', 'Value'], rows: rows, num: [2], measures: [m], filters: { client: cf, period: per }, stack: true }));
    return box;
  }

  function evidenceList() {
    var ev = S.bundle.served_evidence || [];
    return table({ id: 'served-evidence', caption: 'Public evidence served with this page (assembly refuses a copy that differs from its governance source; .gz files decompress to it; a historical copy is labeled with its own revision)', header: ['Evidence', 'Governance source', 'Declared revision and run', 'Currency', 'SHA-256 of the source'], stack: true,
      rows: ev.filter(function (e) { return e.served && e.source.indexOf('detection-results') < 0; }).map(function (e) { return [el('a', { href: e.served, 'data-evidence': e.served }, [e.served.replace('evidence/', '')]), e.source,
        e.declared_revision ? e.declared_revision.slice(0, 10) + (e.declared_generated_at ? ' at ' + e.declared_generated_at : '') : (e.declared_generated_at || 'not declared (prose or ledger)'),
        e.currency || 'current governance source', e.source_sha256]; }) });
  }

  function verificationTable(V) {
    var items = V.items || [];
    if (!items.length) return el('p', { class: 'notice' }, ['Verification summaries are not in this bundle.']);
    return table({ id: 'verification', caption: 'Build checklist: scope dispositions beside recorded evidence outcomes', header: ['Surface or check', 'Build disposition', 'Evidence', 'What it shows'], stack: true,
      rows: items.map(function (i) { var nm = (i.evidence || '').split('/').pop(); var served = (S.bundle.served_evidence || []).some(function (e) { return e.served === 'evidence/' + nm || e.served === 'evidence/' + nm + '.gz'; });
        var plain = (S.bundle.served_evidence || []).some(function (e) { return e.served === 'evidence/' + nm; });
        return [i.name, stateTagStatus(i.status), served ? evidenceLink(plain ? nm : nm + '.gz', i.evidence) : i.evidence + ' (in the repository)', i.summary]; }) });
  }
  function stateTagStatus(st) { var k = st === 'pass' ? 'ok' : (st === 'fail' || st === 'blocked' ? 'bad' : (st === 'pending' || st === 'not_evaluated' || st === 'pending_postpublication' || st === 'pending_publication' || st === 'not_applicable' ? 'unk' : 'warn')); return tag(String(st).replace(/_/g, ' '), k); }
  function detectorSection(V) {
    var box = el('div');
    if (V.diagnostics) box.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['Inspect public diagnostic injections and clean pairs']),
      table({ id: 'diagnostics', caption: 'Public diagnostic injections and clean pairs by class (development checks)', stack: true,
        header: ['Class', 'Instances', 'Reached', 'Expected control tripped', 'Clean pairs quiet', 'Missed or wrong', 'Not reached or not executed'], num: [1, 2, 3, 4, 5, 6],
        rows: V.diagnostics.map(function (r) { return [r.mode, r.instances, r.reached, r.tripped, r.clean_quiet, r.missed, r.not_executed]; }) })]));
    return box;
  }

  // ---------------------------------------------------------------- boot
  Promise.all([getJSON('data/bundle.json'), getJSON('data/cells.json'), getJSON('data/blockers.json'), getOptional('data/stories.json'), getOptional('data/verification.json'),
    getOptional('data/health.json'), getOptional('data/manifest.json')]).then(function (r) {
    S.bundle = r[0]; S.cells = r[1]; S.blockers = r[2]; S.extra.stories = r[3]; S.extra.verification = r[4]; S.extra.health = r[5]; S.extra.manifest = r[6];
    var m = S.extra.manifest || {};
    $('#foot-release').textContent = 'Numerical snapshot ' + (m.release_id || 'candidate') + ' · build ' + S.bundle.snapshot.build + ' · cells ' + S.bundle.snapshot.cells_sha256.slice(0, 16) + ' · rule ' + S.bundle.snapshot.rule_version;
    document.querySelector('.foot-row').appendChild(el('p', null, [el('a', { class: 'case-study-link', href: 'case-study.html' }, ['Read the case study ↗'])]));
    document.querySelector('.foot-row').appendChild(el('p', { class: 'small' }, ['Presentation review. Historical checks retain their reviewed revisions. ', el('a', { href: 'evidence/publication-preparation-2026-10-20.json' }, ['Current presentation checks']), '.']));
    window.addEventListener('hashchange', render);
    render();
  }).catch(function (e) { $('#app').innerHTML = ''; $('#app').appendChild(el('p', { class: 'notice' }, ['The frozen synthetic snapshot could not be loaded: ' + e.message])); });
})();
