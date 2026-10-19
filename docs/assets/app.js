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
  var CF_LABEL = { ALL: 'All six clients', 'P-A': 'Profile P-A (SYN-C01, SYN-C02)', 'P-B': 'Profile P-B (SYN-C03, SYN-C04)', 'P-C': 'Profile P-C (SYN-C05, SYN-C06)' };
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
  function go(patch) { var st = Object.assign({}, S.st, patch); var h = hashOf(st); if (h === location.hash) render(); else location.hash = h; }

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
        if (v instanceof Node) td.appendChild(v); else td.textContent = typeof v === 'number' ? v.toLocaleString('en-US') : (v === null || v === undefined ? '' : String(v));
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
    var pinned = null;
    function point(e) { return e.target.closest ? e.target.closest('.chart-point') : null; }
    function hide() { tip.hidden = true; pinned = null; }
    tip.dismissReadout = hide;
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
    holder.addEventListener('pointermove', function (e) { var p = point(e); if (fine() && !pinned && p) show(p, e.clientX, e.clientY); });
    holder.addEventListener('pointerleave', function () { if (!pinned) hide(); });
    holder.addEventListener('click', function (e) { var p = point(e); if (!p) return; if (pinned === p) { hide(); return; } pinned = p; show(p, e.clientX, e.clientY); });
    holder.addEventListener('focusin', function (e) { var p = point(e); if (!p) return; var b = p.getBoundingClientRect(); show(p, b.left + b.width / 2, b.top + b.height / 2); });
    holder.addEventListener('focusout', hide);
    holder.addEventListener('keydown', function (e) { var p = point(e); if (e.key === 'Escape') hide(); else if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); var b = p.getBoundingClientRect(); pinned = p; show(p, b.left + b.width / 2, b.top + b.height / 2); } });
    // Figure-scoped handlers avoid accumulating global listeners on every filter change.
    fig.addEventListener('pointerdown', function (e) { if (!holder.contains(e.target)) hide(); });
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
  window.addEventListener('scroll', function () { dismissReadouts(); }, { passive: true });
  window.addEventListener('resize', function () { dismissReadouts(); }, { passive: true });
  // ---------------------------------------------------------------- render shell
  function render() {
    S.st = parseHash();
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
    var hero = app.querySelector('.hero');
    if (note && hero) {
      note.textContent = '';
      note.appendChild(el('div', { class: 'container-x' }, [el('strong', null, ['Synthetic demonstration. ']), 'All records, people and organizations are generated. Designed rates are not real-world prevalence.']));
      var copy = hero.querySelector('.hero-copy');
      if (copy) copy.insertBefore(note, copy.querySelector('.hero-actions'));
      else hero.insertAdjacentElement('afterend', note);
    }
    app.setAttribute('aria-busy', 'false');
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
    headerBlock(app, 'View A · Claims readiness and downstream consequences', '<span class="muted">Cascadia</span> Claim <span class="serif">Integrity</span><span class="stop">.</span>',
      'From ride evidence to encounter outcomes. Trace each claim from its supporting facts through preparation, correction and downstream reporting.');
    var hero = app.querySelector('.hero');
    hero.classList.add('hero-split');
    var intro = el('div', { class: 'hero-copy' });
    while (hero.firstChild) intro.appendChild(hero.firstChild);
    intro.querySelector('.lede').textContent = 'From ride evidence to encounter outcomes. See what makes a claim ready, what holds it back, and what the return evidence can establish.';
    intro.appendChild(el('div', { class: 'btn-row hero-actions' }, [
      el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { document.getElementById('ctl-h').scrollIntoView({ block: 'start' }); } }, ['Explore the snapshot ↓']),
      el('a', { class: 'btn', href: '#view=c' }, ['Definitions and verification'])
    ]));
    hero.appendChild(intro);
    hero.appendChild(el('aside', { class: 'hero-guide', 'aria-label': 'Start with a claim' }, [
      el('p', { class: 'eyebrow' }, ['Follow one record']),
      el('h2', null, ['A ride. A claim. Its consequences.']),
      el('p', null, ['Open a grouped claim and trace its supporting facts, preparation units and downstream evidence.']),
      el('a', { class: 'btn btn-dark', href: '#view=b&rec=SYN-C03%3AS000001&story=DEMO04' }, ['Open the guided claim ↗'])
    ]));
    app.appendChild(overview());
    app.appendChild(storyIndex());
    app.appendChild(controls());
    var s = S.st;
    // Primary cards
    app.appendChild(el('h2', { id: 'primary' }, ['Preparation, readiness and reporting evidence']));
    app.appendChild(el('p', { class: 'small' }, ['Preparation units (P), readiness at the selected stage, and required reporting units (U) are separate scopes. A unit is one service component for one recipient and purpose. Missing claims stay in every denominator.']));
    app.appendChild(el('details', { class: 'fold terms-fold' }, [el('summary', null, ['How the clocks and populations work']), termsLine()]));
    app.appendChild(el('div', { class: 'grid-3' }, [cardM14(), cardM15(), cardM16()]));
    app.appendChild(blockerSection());
    app.appendChild(downstreamSection());
    app.appendChild(routesSection());
    app.appendChild(financialSection());
    app.appendChild(residualSection());
    app.appendChild(recommendations());
    app.appendChild(el('section', { class: 'run-section', 'aria-labelledby': 'run-h' }, [
      el('p', { class: 'eyebrow' }, ['Execution record']),
      el('h2', { id: 'run-h' }, ['Run health and release context']),
      el('p', { class: 'small' }, ['This module is a frozen synthetic snapshot with no live data edge. Schedules were removed under the owner acceptance of 2026-10-19; a successful scheduled-run receipt is not required. The historical run status below is retained, including its original timestamps. Acceptance does not turn it into a pass.']),
      el('p', { class: 'small' }, ['All 98 applicable known-answer variants pass; all 22,173 numerical cells match, and 20 browser checks pass. Scheduling is N/A. Evaluator custody is an accepted limitation, and public readback is a publication step.']),
      el('a', { class: 'btn', href: '#view=c' }, ['Read completed checks and remaining limits ↗']),
      el('details', { class: 'fold' }, [el('summary', null, ['Historical operating receipts (outside this build scope)']), healthStrip()])
    ]));
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
      if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' }); }
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
      el('a', { href: hashOf(Object.assign({}, S.st, { view: 'c', rec: '' })) }, ['Full definitions in View C']), '.']);
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
      sel('f-client', 'Client filter', s.client, b.client_filters.map(function (c) { return [c, CF_LABEL[c] || c]; }), function (e) { go({ client: e.target.value }); }),
      sel('f-period', 'Service period', s.period, Object.keys(b.periods).map(function (p) { return [p, PERIOD_LABEL[p]]; }), function (e) { go({ period: e.target.value }); }),
      el('div', null, [sel('f-pos', 'Position', s.pos, Object.keys(POS_LABEL).map(function (p) { return [p, POS_LABEL[p]]; }), function (e) { go({ pos: e.target.value }); }),
        el('p', { class: 'pos-desc' }, [POS_DESC[s.pos]])]),
      sel('f-stage', 'Readiness target stage', s.stage, b.stages.map(function (x) { return [x, STAGE_LABEL[x]]; }), function (e) { go({ stage: e.target.value }); }),
      el('p', { class: 'state', id: 'filter-state' }, ['Showing ' + (CF_LABEL[s.client] || s.client) + ', ' + lc(PERIOD_LABEL[s.period]) + ', ' + posWords(s.pos) + ', readiness stage ' + lc(STAGE_LABEL[s.stage]) + '. ' +
        'P units in view: ' + n(C('M14', 'denominator')) + ' of ' + n(C('M14', 'denominator', { client: 'ALL', period: 'FULL' })) + '.']),
      el('div', { class: 'btn-row' }, [el('button', { class: 'btn', type: 'button', onclick: function () { go({ client: 'ALL', period: 'FULL', pos: 'current_later', stage: 'encounter_submission', field: '', basis: '' }); } }, ['Reset to the declared defaults'])])
    ]);
    return el('section', { class: 'controls', 'aria-labelledby': 'ctl-h' }, [el('h2', { id: 'ctl-h', style: 'margin-top:0;font-size:1.1rem' }, ['Explore']), form]);
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
    return card('M14', 'Claim preparation coverage', pct(nn, d), n(nn) + ' of ' + n(d) + ' preparation units constructed',
      [['Missing claim', C('M14', 'missing')], ['Partially allocated', C('M14', 'partially_allocated')], ['Conflicting', C('M14', 'conflicting')], ['Applicability unresolved', C('M14', 'applicability_unresolved')], ['Claim families', C('M14', 'claim_headers')]],
      'Population P: expected units by component and target, including units with no claim.', hashOf(Object.assign({}, S.st, { view: 'c', rec: 'M14' })));
  }
  function cardM15() {
    var st = S.st.stage, o = { stage: st };
    var d = C('M15', 'denominator', o), r = C('M15', 'ready', o);
    return card('M15', 'Readiness: ' + lc(STAGE_LABEL[st]), pct(r, d), n(r) + ' of ' + n(d) + ' units ready for this target',
      [['Blocked', C('M15', 'blocked', o)], ['Conflicting', C('M15', 'conflicting', o)], ['Missing construction', C('M15', 'missing_construction', o)], ['Unassessable', C('M15', 'unassessable', o)]],
      'Population P at this stage. A unit can be ready for one target and blocked for another; unknown payment blocks only targets that require it.', hashOf(Object.assign({}, S.st, { view: 'c', rec: 'M15' })));
  }
  function cardM16() {
    var U = C('M16', 'required_units'), se = C('M16', 'source_evidenced_outcomes');
    return card('M16', 'Outcome-evidence coverage of required reporting units', pct(se, U), n(se) + ' of ' + n(U) + ' units have a source-evidenced outcome',
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
      defLink('M13', 'M13'), ' in the residual panel at the foot of this view) and required reporting units (', defLink('M16', 'M16'), ', the third card under “Preparation, readiness and reporting evidence”). Their counts are not meant to equal one another.']));
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
      el('p', { class: 'small' }, ['Record-level examples are available in Claim record and evidence. Full frozen lists of uncovered legs and receipt obligations are available under Evidence files in Definitions and verification. No personal contacts or real-world escalation agreements exist in this synthetic pack.']),
      el('div', { class: 'btn-row' }, [jumpButton('rt-h', 'Match client to route ↓'), el('a', { class: 'btn', href: hashOf(Object.assign({}, s, { view: 'b', rec: 'SYN-C03:S000001', story: 'DEMO04' })) }, ['Inspect a delivery ↗']), el('a', { class: 'btn', href: '#view=c' }, ['Open evidence files ↗'])])
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
    sec.appendChild(el('p', { class: 'small' }, ['Rows follow client order, not rank. Each client’s evidence route is a disclosed synthetic policy; SYN-C04 to SYN-C06 cannot establish source-evidenced acceptance through their configured v1 routes. Differences between rows are design choices, not performance findings.']));
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
    headerBlock(app, 'View B · Claim record and downstream evidence', 'One <span class="serif">record</span>, every fact<span class="stop">.</span>',
      'Follow the supporting facts into a claim, then read readiness, return evidence and financial meaning at the selected cutoff.');
    explanatoryHero(app, {
      label: 'How to read a claim', title: 'Facts first. Status in context.',
      prompts: ['Which source supports the field?', 'Which target is the claim ready for?', 'What does the return evidence actually establish?'],
      actions: [jumpButton('record-search-h', 'Find a record ↓', 'btn-dark'), el('a', { class: 'btn', href: '#view=b&rec=SYN-C03%3AS000001&story=DEMO04' }, ['Try the grouped claim ↗'])]
    });
    var s = S.st;
    var input = el('input', { id: 'rec-q', type: 'search', value: s.rec, 'aria-label': 'Record identifier', placeholder: 'SYN-C01:S000001, SYN-C05:Q002001, SYN-C03:CL001, a P unit id or a delivery id' });
    app.appendChild(el('section', { class: 'record-search', 'aria-labelledby': 'record-search-h' }, [
      el('p', { class: 'eyebrow' }, ['Record explorer']), el('h2', { id: 'record-search-h' }, ['Open a record']),
      el('p', { class: 'small' }, ['Search by request or service, preparation unit, claim family or version, or encounter family and delivery. Fields retain their observed, joined, derived or missing support.']),
      el('form', { class: 'search', onsubmit: function (e) { e.preventDefault(); go({ rec: input.value.trim() }); } }, [input, el('button', { class: 'btn btn-dark', type: 'submit' }, ['Open record'])])
    ]));
    app.appendChild(el('p', { class: 'small position-strip' }, ['Position: ', el('strong', null, [POS_LABEL[s.pos]]), ' (' + posWords(s.pos) + '). ' + POS_DESC[s.pos] + ' ',
      el('a', { href: hashOf(Object.assign({}, s, { pos: 'known_then' })) }, ['Known then']), ' · ', el('a', { href: hashOf(Object.assign({}, s, { pos: 'restated_then' })) }, ['Restated then']), ' · ',
      el('a', { href: hashOf(Object.assign({}, s, { pos: 'current_later' })) }, ['Current later'])]));
    var story = s.story ? ((S.extra.stories || {}).stories || []).filter(function (x) { return x.id === s.story; })[0] : null;
    if (story) app.appendChild(storyPanel(story));
    var holder = el('div', { id: 'rec-holder' }, [el('p', { class: 'loading' }, [s.rec ? 'Loading record…' : ''])]);
    app.appendChild(holder);
    if (!s.rec) { holder.innerHTML = ''; holder.appendChild(browse()); return; }
    if (s.rec.indexOf('MINI:') === 0) { holder.innerHTML = ''; holder.appendChild(miniature(s.rec)); return; }
    var client = clientOf(s.rec);
    if (!client) { holder.innerHTML = ''; holder.appendChild(el('p', { class: 'notice' }, ['No record matches "' + s.rec + '". Identifiers carry their client prefix, for example SYN-C01:S000001.'])); return; }
    shard(client).then(function (sh) {
      holder.innerHTML = '';
      holder.appendChild(recordView(sh, s.rec));
    }).catch(function (e) { holder.innerHTML = ''; holder.appendChild(el('p', { class: 'notice' }, ['The record shard could not be loaded: ' + e.message])); });
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
    var ol = el('ol', { class: 'steps' });
    story.steps.forEach(function (st, i) {
      var p = stepPos(st);
      var link = st.rec ? el('a', { href: storyHref(story, st, s) }, [st.label + (p ? ' (' + lc(POS_LABEL[p]) + ')' : '')]) : el('span', null, [st.label]);
      ol.appendChild(el('li', null, [link, el('p', { class: 'small', style: 'margin:.2rem 0 0' }, [st.text]), bindingSummary(st)]));
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
      return el('a', { class: 'btn' + (x === c ? ' btn-dark' : ''), href: hashOf(Object.assign({}, s, { client: x })) }, [x]);
    }));
    box.appendChild(picks);
    var holder = el('div', null, [el('p', { class: 'loading' }, ['Loading ' + c + '…'])]);
    box.appendChild(holder);
    shard(c).then(function (sh) {
      holder.innerHTML = '';
      var keys = Object.keys(sh.legs).sort();
      var rows = keys.map(function (k) { var L = sh.legs[k]; return [el('a', { href: hashOf(Object.assign({}, s, { rec: k })) }, [k]), L.sd, L.fam || 'none', byPos(L.cov, s.pos) || 'none', (L.units || []).length]; });
      holder.appendChild(table({ id: 'browse-legs-' + c, caption: c + ' completed legs (' + posWords(s.pos) + ')', header: ['Service key', 'Service date', 'Claim family', 'Coverage state', 'P units'], rows: rows, maxRows: 100, num: [4], stack: true, filters: { client: c, period: 'FULL' } }));
      var rk = Object.keys(sh.requests).sort();
      holder.appendChild(table({ id: 'browse-requests-' + c, caption: c + ' requests without a completed leg', header: ['Request', 'Disposition', 'Class', 'Reportability at this position', 'P units'],
        rows: rk.map(function (k) { var R = sh.requests[k]; return [el('a', { href: hashOf(Object.assign({}, s, { rec: k })) }, [k]), R.disp, R.cls || '', byPos(R.status, s.pos) || (R.units.length ? 'required (P-C documented cancelled)' : 'none'), R.units.length]; }),
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
      tag(sh.client, ''), tag('profile ' + profile, ''), tag('position: ' + posWords(s.pos), '')]));
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
    headerBlock(app, 'View C · Definitions and verification', 'Every number, <span class="serif">explained</span><span class="stop">.</span>',
      'Find the definition, follow the evidence and read the limits. Each measure keeps its population, clocks and lineage beside the recorded checks.');
    explanatoryHero(app, {
      label: 'Three questions to ask', title: 'Meaning. Evidence. Limits.',
      prompts: ['What is counted, and at which grain?', 'Which comparison checked the result?', 'What was accepted, deferred or not established?'],
      actions: [jumpButton('definitions-h', 'Choose a measure ↓', 'btn-dark'), jumpButton('completed-checks-h', 'Read completed checks ↓')]
    });
    var s = S.st, V = S.extra.verification || {};
    app.appendChild(readingNav([['definitions-h', '01 Definitions'], ['verification-h', '02 Recorded checks'], ['detectors-h', '03 Public fault checks'], ['accounting-h', '04 Raw accounting'], ['files-h', '05 Evidence files'], ['future-h', '06 Build forward'], ['execution-h', '07 Execution history']], 'On this page'));
    app.appendChild(completedChecks(V));
    // Measure catalog
    var reg = Object.assign({}, S.bundle.measures); delete reg.M09;
    var rows = Object.keys(reg).sort().map(function (m) {
      var x = reg[m], sup = x.supported;
      return [el('a', { href: hashOf(Object.assign({}, s, { rec: m })) }, [m]), x.title, x.grain || '', (sup.client_filters.length > 1 ? 'clients and profiles' : 'all only') + '; ' + (sup.periods.length > 1 ? 'four periods' : 'full period') + (sup.stages.length > 1 ? '; three stages' : ''), sup.restriction || '', x.cell_count || 0];
    });
    var definitions = chapter(el('section', null, [el('h2', { id: 'definitions-h' }, ['Choose a measure'])]), 'definitions', '01 / Meaning before interpretation');
    definitions.appendChild(el('p', { class: 'small' }, ['Start with a definition. Each measure names its own population, exclusions, cutoffs and supported filters.']));
    definitions.appendChild(el('div', { class: 'definition-picker' }, [el('label', { for: 'measure-picker' }, ['Measure definition']),
      el('select', { id: 'measure-picker', onchange: function (e) { go({ rec: e.target.value }); } }, [el('option', { value: '' }, ['Choose a measure'])].concat(Object.keys(reg).sort().map(function (m) { return el('option', { value: m, selected: s.rec === m }, [m + ' · ' + reg[m].title]); })))
    ]));
    definitions.appendChild(el('div', { class: 'btn-row' }, [['M14', 'Claim construction'], ['M15', 'Target readiness'], ['M16', 'Outcome evidence']].map(function (r) { return el('a', { class: 'btn', href: hashOf(Object.assign({}, s, { rec: r[0] })) }, [r[0] + ' · ' + r[1]]); })));
    if (s.rec && reg[s.rec]) definitions.appendChild(measureDetail(s.rec));
    definitions.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['Full measure register']), table({ id: 'register', caption: 'Published measures, their grain and supported filters (governance/metric_register.md)', header: ['ID', 'Measure', 'Grain', 'Supported filters', 'Restriction', 'Published cells'], rows: rows, num: [5], stack: true })]));
    // Crosswalk
    definitions.appendChild(el('details', { class: 'fold' }, [el('summary', null, ['Where each measure appears']), table({ caption: 'Chart and table to measure catalog', header: ['Element', 'View', 'Measures'], stack: true, rows: [
      ['Fixed snapshot cards and expanded context', 'A', 'M01, M03, M14, M15, M16, M17'], ['Primary cards', 'A', 'M14, M15, M16'], ['Blocker diagnostic panel and table', 'A', 'M15 explanatory submeasures'],
      ['Downstream cards', 'A', 'M01, M03, M05'], ['Chart: why completed legs are not covered', 'A', 'M02'], ['Deadline and elapsed-time table', 'A', 'M04, M07'],
      ['Clients, routes and evidence table', 'A', 'M16'], ['Typed financial panel', 'A', 'M17'], ['Residual panel', 'A', 'M11, M12, M13, M18'],
      ['Record readiness, work items, downstream and bridge tables', 'B', 'M01, M06, M14, M15, M16, M17, M19'], ['Verification and public diagnostic tables', 'C', 'M08, M10']] })]));
    app.appendChild(definitions);
    // Verification summaries
    app.appendChild(chapter(el('section', null, [el('h2', { id: 'verification-h' }, ['Recorded checks and their scope']),
      el('p', { class: 'small' }, ['Build dispositions follow the declared frozen-build scope. Linked records retain the full-scope evidence outcomes. N/A requirements and accepted limitations are not test passes; this is an assessment of recorded checks, not a new execution of every test.']), verificationTable(V)]), 'verification', '02 / Verification evidence'));
    app.appendChild(chapter(el('section', null, [el('h2', { id: 'detectors-h' }, ['Public diagnostic checks']),
      el('p', { class: 'small' }, ['81 applicable public injections and their clean pairs passed. The legacy custody probe is N/A; absence of its resource is not evidence of an access denial.']), detectorSection(V)]), 'detectors', '03 / Public fault checks'));
    var accounting = chapter(el('section', null, [el('h2', { id: 'accounting-h' }, ['Raw evidence accounting (M08)'])]), 'accounting', '04 / Every response keeps its disposition');
    var m08 = ['raw_rows', 'raw_duplicate_deliveries', 'duplicate_effects_prevented', 'unmatched_responses', 'too_broad', 'contradictory_rows', 'conflict_episodes', 'lineage_conflicts', 'received_after_K', 'bound_to_submission_after_T'];
    accounting.appendChild(table({ id: 'm08', caption: 'Every raw response row keeps a disposition (' + posWords(s.pos) + '; all clients, full period only)', header: ['Disposition', 'Rows'], num: [1], measures: ['M08'], filters: { client: 'ALL', period: 'FULL' },
      rows: m08.map(function (k) { return [k.replace(/_/g, ' '), C('M08', k, { client: 'ALL', period: 'FULL' })]; }) }));
    app.appendChild(accounting);
    app.appendChild(chapter(el('section', null, [el('h2', { id: 'files-h' }, ['Follow the evidence files']),
      el('p', { class: 'small' }, ['Each link retains the declared revision, currency and source hash. A historical receipt is evidence of that recorded execution.']),
      el('details', { class: 'fold' }, [el('summary', null, ['Open the complete served-file inventory']), evidenceList()])]), 'evidence-files', '05 / Source and revision trail'));
    var future = chapter(el('section', null, [el('h2', { id: 'future-h' }, ['Build forward: detection evaluation']),
      el('p', null, ['Detection evaluation is a future candidate, not a current test surface for this build or the comparison matrix. A future independently held population could measure detection, misses, false alarms and timing across a declared fault roster.']),
      el('details', { class: 'fold' }, [el('summary', null, ['Historical context for the future candidate']),
        el('p', { class: 'small' }, ['Exploratory unblinded attempt 2 met must-catch in 20 of 26 represented classes, with six missed targets and ten of 36 classes unrepresented. It used older controls and shared custody; it does not establish effectiveness of final controls. These archived results are context for future work, not a completed current test.']),
        evidenceLink('detection-results-2.json', 'Archived attempt-2 evidence')])]), 'build-forward', '06 / Future candidate');
    if (s.rec === 'M09') future.appendChild(measureDetail('M09'));
    app.appendChild(future);
    app.appendChild(chapter(el('section', null, [el('h2', { id: 'execution-h' }, ['Historical execution health (M10)']),
      el('p', { class: 'small' }, ['Frozen synthetic snapshot, with no live data edge. Schedules were removed under the 2026-10-19 owner acceptance. The historical receipt below retains its original status and timestamps; a successful scheduled-run receipt is not required for this build.']),
      healthStrip(), el('p', { class: 'small' }, ['Public fault injections and naturally occurring execution failures remain separate evidence. Future detection evaluation is described in Build forward.'])]), 'execution', '07 / Execution history'));
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
    $('#foot-release').textContent = 'Release ' + (m.release_id || 'candidate') + ' · build ' + S.bundle.snapshot.build + ' · cells ' + S.bundle.snapshot.cells_sha256.slice(0, 16) + ' · rule ' + S.bundle.snapshot.rule_version;
    document.querySelector('.foot-row').appendChild(el('p', null, [el('a', { class: 'case-study-link', href: 'case-study.html' }, ['Read the case study ↗'])]));
    window.addEventListener('hashchange', render);
    render();
  }).catch(function (e) { $('#app').innerHTML = ''; $('#app').appendChild(el('p', { class: 'notice' }, ['The frozen synthetic snapshot could not be loaded: ' + e.message])); });
})();
