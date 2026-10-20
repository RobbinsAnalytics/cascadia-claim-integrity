/* Compact proxies reuse the existing example and snapshot actions. No record state is computed here. */
(function () {
  'use strict';
  var app = document.getElementById('app'), main = document.getElementById('main');
  if (!app || !main) return;
  var bar = document.createElement('div');bar.id = 'follow-sticky-controls';bar.className = 'follow-sticky-controls';bar.hidden = true;
  bar.setAttribute('role', 'region');bar.setAttribute('aria-label', 'Follow a claim filters');
  bar.setAttribute('aria-busy', 'false');
  bar.innerHTML = '<div class="follow-sticky-field"><label for="follow-sticky-example">Example</label><select id="follow-sticky-example"></select></div><div class="follow-sticky-field" id="follow-sticky-snapshot-field"><label for="follow-sticky-position">Snapshot</label><select id="follow-sticky-position"></select></div><div class="follow-sticky-context" aria-label="Current reading location"></div>';
  main.appendChild(bar);
  var examples = bar.querySelector('#follow-sticky-example'), positions = bar.querySelector('#follow-sticky-position'), snapshotField = bar.querySelector('#follow-sticky-snapshot-field');
  var scheduled = false, signature = '', pending = null, timeout = null, height = 80;
  var context = bar.querySelector('.follow-sticky-context'), measure = document.createElement('canvas').getContext('2d');
  function optionWidth(select, property) {
    var style = getComputedStyle(select);measure.font = style.font;
    var width = Math.max.apply(null, Array.from(select.options).map(function (option) { return measure.measureText(option.textContent).width; }));
    bar.style.setProperty(property, Math.ceil(width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 34) + 'px');
  }
  function readingContext() {
    var line = headEdge() + (bar.hidden ? 0 : bar.offsetHeight) + 20, active = null, top = -Infinity;
    var sections = [
      ['#follow-routes', 'Choose a business question'], ['#follow-snapshot', 'Choose a snapshot'],
      ['#follow-selected', 'Selected record'], ['#follow-next-action', 'Selected record', 'The next action'],
      ['#follow-story', 'Walk through the example'], ['#record-source', 'Supporting source facts'],
      ['#record-claim', 'Claim versions'], ['#record-readiness', 'Readiness and response'],
      ['#record-financial', 'Costs, charges and payments'], ['#record-timeline', 'When evidence arrived'],
      ['#record-bridge', 'Compare snapshots'], ['#follow-record-tools', 'Find another record']
    ];
    sections.forEach(function (entry) {
      var node = app.querySelector(entry[0]);if (!node || !node.getClientRects().length) return;
      var y = node.getBoundingClientRect().top;
      if (y <= line + 12 && y >= top) { active = { node: node, label: entry[1], sub: entry[2] || '' };top = y; }
    });
    if (!active) { context.textContent = 'Choose a business question';return; }
    var subTop = -Infinity;
    active.node.querySelectorAll('h3,h4,caption,.steps > li > a,.steps > li > span').forEach(function (node) {
      if (!node.getClientRects().length || node === active.node.querySelector(':scope > h2,:scope > h3,:scope > h4')) return;
      var y = node.getBoundingClientRect().top;
      if (y <= line + 12 && y >= subTop) { active.sub = node.textContent.trim();subTop = y; }
    });
    var text = active.label + (active.sub ? ' - ' + active.sub : '');
    if (context.textContent !== text) context.textContent = text;
    context.title = text;
  }
  function inFollow() { return app.classList.contains('view-b'); }
  function headEdge() {
    var head = document.querySelector('.site-head');
    return getComputedStyle(head).position === 'static' ? 0 : Math.max(0, head.getBoundingClientRect().bottom);
  }
  function syncSelect(select, choices, value) {
    var key = JSON.stringify(choices);
    if (select.dataset.choices !== key) {
      select.replaceChildren();choices.forEach(function (choice) { var option = document.createElement('option');option.value = choice[0];option.textContent = choice[1];select.appendChild(option); });
      select.dataset.choices = key;
    }
    if (select.value !== value) select.value = value;
  }
  function size() {
    var rect = app.getBoundingClientRect(), style = getComputedStyle(app), left = parseFloat(style.paddingLeft), right = parseFloat(style.paddingRight);
    bar.style.left = rect.left + left + 'px';bar.style.width = Math.max(0, rect.width - left - right) + 'px';bar.style.top = headEdge() + 'px';
  }
  function update() {
    scheduled = false;
    var routes = app.querySelector('#follow-routes'), original = app.querySelector('#follow-position');
    if (!inFollow() || !routes || !original) { if (!inFollow()) cancel();bar.hidden = true;signature = '';return; }
    var links = Array.from(routes.querySelectorAll('.follow-route')), selected = links.find(function (link) { return link.getAttribute('aria-current') === 'true'; });
    var choices = links.map(function (link) { return [link.id, link.querySelector('h3').textContent]; });
    if (!selected) choices.unshift(['', 'Custom record · choose an example']);
    syncSelect(examples, choices, selected ? selected.id : '');
    syncSelect(positions, Array.from(original.options).map(function (option) { return [option.value, option.textContent]; }), original.value);
    optionWidth(examples, '--follow-example-width');optionWidth(positions, '--follow-position-width');
    size();
    var showExample = routes.getBoundingClientRect().bottom <= headEdge() + 1;
    var showSnapshot = showExample && original.getBoundingClientRect().bottom <= headEdge() + height;
    snapshotField.hidden = !showSnapshot;bar.classList.toggle('example-only', !showSnapshot);
    bar.hidden = !showExample;
    if (!bar.hidden) height = bar.offsetHeight;
    if (app.getBoundingClientRect().bottom <= headEdge() + height) bar.hidden = true;
    readingContext();
    var next = [bar.hidden, showSnapshot, Math.round(height), bar.style.left, bar.style.width, bar.style.top].join('|');
    if (next !== signature) { signature = next;window.dispatchEvent(new Event('follow-sticky-layout')); }
    if (pending && pending.hero !== app.querySelector('.hero') && !bar.hidden) {
      var focusedControl = document.getElementById(pending.focusId);
      if (focusedControl && document.activeElement !== focusedControl) focusedControl.focus({ preventScroll: true });
    }
    completeSelection();
  }
  function schedule() { if (!scheduled) { scheduled = true;requestAnimationFrame(update); } }
  function remember(focusId) {
    cancel();
    var line = headEdge() + (bar.hidden ? 0 : bar.offsetHeight) + 20;
    var targets = Array.from(app.querySelectorAll('#follow-selected, #follow-next-action, #follow-story, #record-source, #record-claim, #record-readiness, #record-financial, #record-timeline, #record-bridge, #follow-record-tools'));
    var target = null, top = -Infinity;
    targets.forEach(function (node) { var rect = node.getBoundingClientRect();if (node.getClientRects().length && rect.top <= line + 12 && rect.top >= top) { target = node;top = rect.top; } });
    pending = { hero: app.querySelector('.hero'), focusId: focusId, anchor: target ? target.id : null, offset: target ? top : null, y: window.scrollY, x: window.scrollX, folds: Array.from(app.querySelectorAll('details[data-follow-key][open]')).map(function (d) { return d.getAttribute('data-follow-key'); }), minHeight: app.style.minHeight, restoring: false };
    app.style.minHeight = app.getBoundingClientRect().height + 'px';
    bar.setAttribute('aria-busy', 'true');
    timeout = setTimeout(cancel, 5000);
  }
  function completeSelection() {
    if (!pending || pending.restoring || pending.hero === app.querySelector('.hero')) return;
    if (!inFollow()) { cancel();return; }
    if (!app.querySelector('[data-follow-ready], #follow-selected')) return;
    var state = pending;state.restoring = true;
    app.querySelectorAll('details[data-follow-key]').forEach(function (d) { d.open = state.folds.indexOf(d.getAttribute('data-follow-key')) >= 0; });
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (pending !== state) return;
      app.style.minHeight = state.minHeight;
      var anchor = state.anchor && document.getElementById(state.anchor);
      if (!anchor || !anchor.getClientRects().length) anchor = state.anchor && app.querySelector('#follow-selected');
      window.scrollTo({ left: state.x, top: anchor && state.offset !== null ? window.scrollY + anchor.getBoundingClientRect().top - state.offset : state.y, behavior: 'instant' });
      update();
      var control = document.getElementById(state.focusId);
      if (control && !bar.hidden) control.focus({ preventScroll: true });
      clearTimeout(timeout);timeout = null;pending = null;bar.setAttribute('aria-busy', 'false');
    }); });
  }
  function cancel() {
    if (pending) app.style.minHeight = pending.minHeight;
    pending = null;if (timeout) clearTimeout(timeout);timeout = null;
    bar.setAttribute('aria-busy', 'false');
  }
  examples.addEventListener('change', function () {
    var link = document.getElementById(examples.value);if (!link) return;
    remember(examples.id);link.click();examples.focus({ preventScroll: true });schedule();
  });
  positions.addEventListener('change', function () {
    var original = app.querySelector('#follow-position');if (!original) return;
    remember(positions.id);original.value = positions.value;original.dispatchEvent(new Event('change', { bubbles: true }));schedule();
  });
  window.CCI_FOLLOW_STICKY = {
    offsetFor: function (target) {
      if (!inFollow() || !target.closest('.view-b')) return 0;
      var routes = app.querySelector('#follow-routes');
      if (!routes || routes.contains(target) || !(routes.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) return 0;
      var snapshot = app.querySelector('#follow-snapshot');
      var both = snapshot && !snapshot.contains(target) && (snapshot.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
      var hidden = bar.hidden, snapshotHidden = snapshotField.hidden, exampleOnly = bar.classList.contains('example-only');
      bar.hidden = false;snapshotField.hidden = !both;bar.classList.toggle('example-only', !both);
      var offset = bar.offsetHeight;
      bar.hidden = hidden;snapshotField.hidden = snapshotHidden;bar.classList.toggle('example-only', exampleOnly);
      return offset;
    }
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  new ResizeObserver(schedule).observe(app);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('wheel', cancel, { passive: true });
  window.addEventListener('touchmove', cancel, { passive: true });
  document.addEventListener('toggle', schedule, true);
  document.fonts.ready.then(schedule);
  schedule();
})();
