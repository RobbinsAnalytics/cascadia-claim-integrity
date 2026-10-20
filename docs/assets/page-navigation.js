/* Shared contents navigation. Case-study anchors use the hash; module anchors preserve its filter hash. */
(function () {
  'use strict';
  var isCase = document.body.classList.contains('case-study');
  var app = document.getElementById(isCase ? 'case-main' : 'app'), main = document.getElementById(isCase ? 'case-page-shell' : 'main');
  if (!app || !main) return;
  var current = null, currentRecord = null, rail = null, items = [], resize = null, scheduled = false, appliedJump = null;
  var outline = [
    ['.hero', 'page-opening', 'Overview'],
    ['#service-example', 'service-example', 'Picture the service'],
    ['.shared-terms', 'page-terms', 'Ride, claim and encounter'],
    ['.readiness-context', 'page-fragmentation', 'Why records are incomplete'],
    ['.scenario-comparison', 'page-evidence-paths', 'Compare evidence paths'],
    ['.profile-explainer', 'page-contract-rules', 'Contract rule groups'],
    ['.explorer-intro', 'page-explorer', 'Explore the model'],
    ['#explore-overview', 'explore-overview', 'Claim readiness'],
    ['#explore-blockers', 'explore-blockers', 'Missing facts'],
    ['#explore-outcomes', 'explore-outcomes', 'After submission'],
    ['#reading-chart', 'reading-chart', 'Reading the chart', true],
    ['#worked-action-example', 'worked-action-example', 'One record, four actions'],
    ['#explore-routes', 'explore-routes', 'Partner routes'],
    ['#explore-money', 'explore-money', 'Financial records'],
    ['#explore-correctness', 'explore-correctness', 'Accepted-record checks'],
    ['.reference-snapshot', 'page-reference', 'Full reference snapshot'],
    ['.recommendations', 'page-next-iteration', 'Next iteration'],
    ['.run-section', 'page-verification', 'Verification records']
  ];
  if (isCase) outline = [
    ['.case-hero', 'case-opening', 'Overview'],
    ['#service-example', 'service-example', 'Picture the service'],
    ['#decision', 'decision', 'Why this matters'],
    ['#players', 'players', 'Who is involved'],
    ['#fragmentation', 'fragmentation', 'Where records come from'],
    ['.shared-terms', 'case-terms', 'Ride, claim and encounter'],
    ['#capability', 'capability', 'Objective and approach'],
    ['#examples', 'examples', 'Main finding'],
    ['.claim-example', 'case-worked-example', 'One claim, three decisions', true],
    ['#results', 'results', 'Snapshot counts'],
    ['#design', 'design', 'Analytical decisions'],
    ['#architecture-details', 'architecture-details', 'Architecture and tradeoffs', true],
    ['#testing', 'testing', 'Confidence and limits'],
    ['#forward', 'forward', 'Next business questions'],
    ['.case-close', 'case-explore', 'Explore the module']
  ];
  var followOutline = [
    ['.hero', 'page-opening', 'Overview'],
    ['#follow-how', 'follow-how', 'Read the evidence chain'],
    ['#follow-routes', 'follow-routes', 'Choose a business question'],
    ['#follow-snapshot', 'follow-snapshot', 'Choose a snapshot'],
    ['#follow-selected', 'follow-selected', 'Selected record'],
    ['#follow-next-action', 'follow-next-action', 'The next action', true],
    ['[aria-labelledby="story-h"]', 'follow-story', 'Walk through the example'],
    ['#record-source', 'record-source', 'Supporting source facts'],
    ['#record-claim', 'record-claim', 'Claim versions'],
    ['#record-readiness', 'record-readiness', 'Readiness and response'],
    ['#record-financial', 'record-financial', 'Costs, charges and payments'],
    ['#record-timeline', 'record-timeline', 'When evidence arrived'],
    ['#record-bridge', 'record-bridge', 'Compare snapshots'],
    ['#follow-record-tools', 'follow-record-tools', 'Find another record']
  ];
  var dataOutline = [
    ['.hero', 'page-opening', 'Overview'],
    ['#data-terms', 'data-terms', 'Ride, claim and encounter'],
    ['#data-counts', 'data-counts', 'Why the counts differ'],
    ['#data-time', 'data-time', 'Which date matters'],
    ['#reading-guide', 'reading-guide', 'Choose the right follow-up'],
    ['#data-evidence', 'data-evidence', 'Trace the evidence'],
    ['#accounting', 'accounting', 'Response accounting'],
    ['#definitions', 'definitions', 'Find a measure'],
    ['#data-confidence', 'data-confidence', 'Confidence and limits'],
    ['#methods-h', 'methods-h', 'Methods and test records'],
    ['#verification', 'verification', 'Recorded checklist', true],
    ['#detectors', 'detectors', 'Public fault checks', true],
    ['#evidence-files', 'evidence-files', 'Evidence files', true],
    ['#execution', 'execution', 'Execution history', true],
    ['#build-forward', 'build-forward', 'Build forward']
  ];
  function href(id) { var url = new URL(location.href);if (isCase) url.hash = id;else url.searchParams.set('jump', id);return url.href; }
  function setOpen(open, returnFocus) {
    if (!rail) return;
    rail.classList.toggle('is-open', open);
    rail.querySelector('button').setAttribute('aria-expanded', String(open));
    if (returnFocus) rail.querySelector('button').focus({ preventScroll: true });
  }
  function readingLine() {
    var head = document.querySelector('.site-head'), edge = getComputedStyle(head).position === 'static' ? 0 : Math.max(0, head.getBoundingClientRect().bottom);
    ['.view-a .controls', '#reader-section-nav', '#follow-sticky-controls'].forEach(function (selector) {
      var n = document.querySelector(selector);if (!n) return;
      var r = n.getBoundingClientRect(), pinnedTop = parseFloat(getComputedStyle(n).top) || 0;
      if (r.top <= Math.max(edge, pinnedTop) + 3 && r.bottom > 0) edge = Math.max(edge, r.bottom);
    });
    // Match the reserved jump offset during the short transition into the snapshot section.
    var followBar = document.getElementById('follow-sticky-controls'), routes = app.querySelector('#follow-routes'), snapshot = app.querySelector('#follow-snapshot');
    if (!isCase && app.classList.contains('view-b') && followBar && followBar.hidden && routes && snapshot && window.CCI_FOLLOW_STICKY) {
      var reserve = window.CCI_FOLLOW_STICKY.offsetFor(snapshot);
      if (routes.getBoundingClientRect().bottom <= edge + reserve + 1) edge += reserve;
    }
    return edge + 20;
  }
  function update() {
    scheduled = false;if (!rail) return;
    var active = items[0], activeTop = -Infinity, line = readingLine();
    items.forEach(function (item) {
      var top = item.target.getBoundingClientRect().top;
      if (item.target.getClientRects().length && top <= line + 12 && top >= activeTop) { active = item;activeTop = top; }
    });
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) active = items[items.length - 1];
    items.forEach(function (item) {
      if (item === active) item.link.setAttribute('aria-current', 'location');else item.link.removeAttribute('aria-current');
    });
    rail.querySelector('button').setAttribute('aria-label', 'On this page. Current section: ' + active.label);
    var panel = rail.querySelector('.contents-panel'), a = active.link.getBoundingClientRect(), p = panel.getBoundingClientRect();
    if (p.height && (matchMedia('(min-width: 1440px)').matches || rail.classList.contains('is-open'))) {
      if (a.top < p.top + 28) panel.scrollTop -= p.top + 28 - a.top;
      else if (a.bottom > p.bottom - 12) panel.scrollTop += a.bottom - p.bottom + 12;
    }
  }
  function schedule() { if (!scheduled) { scheduled = true;requestAnimationFrame(update); } }
  function jump(item, focus) {
    if (!item) return;
    for (var n = item.target; n && n !== app; n = n.parentElement) if (n.tagName === 'DETAILS') n.open = true;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (!item.target.isConnected) return;
      var head = document.querySelector('.site-head');
      var offset = (getComputedStyle(head).position === 'static' ? 0 : Math.max(0, head.getBoundingClientRect().bottom)) + 18;
      var controls = document.querySelector('.view-a .controls');
      if (item.target.closest('.explore-workspace') && (controls.compareDocumentPosition(item.target) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        offset = (parseFloat(getComputedStyle(controls).top) || 0) + controls.offsetHeight + document.getElementById('reader-section-nav').offsetHeight + 18;
      }
      if (window.CCI_FOLLOW_STICKY) offset += window.CCI_FOLLOW_STICKY.offsetFor(item.target);
      var top = window.scrollY + item.target.getBoundingClientRect().top - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      if (focus) {
        var heading = item.target.matches('details') ? item.target.querySelector(':scope > summary') : item.target.querySelector('h1,h2,h3');
        heading = heading || item.target;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.setAttribute('data-page-stop', '');heading.focus({ preventScroll: true });
      }
      schedule();
    }); });
  }
  function mount() {
    var isFollow = !isCase && app.classList.contains('view-b');
    var isData = !isCase && app.classList.contains('view-c');
    var hero = (isCase || isFollow || isData || app.classList.contains('view-a')) && app.querySelector('.hero');
    var record = isFollow ? app.querySelector('[data-follow-ready], #follow-selected') : null;
    if (hero === current && record === currentRecord) return;
    current = hero;currentRecord = record;if (resize) resize.disconnect();if (rail) rail.remove();rail = null;items = [];
    document.body.classList.toggle('has-page-contents', !!hero);if (!hero) return;
    rail = document.createElement('aside');rail.className = 'page-contents';
    rail.innerHTML = '<button type="button" class="contents-toggle" aria-controls="page-contents-panel" aria-expanded="false">On this page <span aria-hidden="true">☰</span></button><nav class="contents-panel" id="page-contents-panel" aria-label="On this page"><p class="contents-heading">On this page</p><ol class="contents-list"></ol></nav>';
    var list = rail.querySelector('ol');
    (isFollow ? followOutline : isData ? dataOutline : outline).forEach(function (entry) {
      var target = app.querySelector(entry[0]);if (!target) return;
      if (!target.id) target.id = entry[1];
      var li = document.createElement('li'), link = document.createElement('a');
      if (entry[3]) li.className = 'contents-nested';
      link.textContent = entry[2];link.href = href(target.id);
      var item = { target: target, link: link, label: entry[2] };items.push(item);
      link.addEventListener('click', function (e) {
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();var url = href(target.id);history.replaceState(null, '', url);appliedJump = target.id;
        setOpen(false, false);jump(item, true);
      });
      li.appendChild(link);list.appendChild(li);
    });
    rail.querySelector('button').addEventListener('click', function () { setOpen(!rail.classList.contains('is-open'), false);schedule(); });
    main.appendChild(rail);
    resize = new ResizeObserver(schedule);resize.observe(app);resize.observe(document.querySelector('.site-head'));
    var id = isCase ? decodeURIComponent(location.hash.slice(1)) : new URL(location.href).searchParams.get('jump');
    var destination = items.find(function (item) { return item.target.id === id; });
    if (id && appliedJump !== id && destination) { appliedJump = id;jump(destination, false); }
    schedule();
  }
  window.CCI_PAGE_CONTENTS = {
    jumpTo: function (target) {
      if (!target || !app.contains(target)) return false;
      jump({ target: target }, true);return true;
    }
  };
  document.addEventListener('click', function (e) { if (rail && !rail.contains(e.target)) setOpen(false, false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && rail && rail.classList.contains('is-open')) setOpen(false, true); });
  document.addEventListener('toggle', schedule, true);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('follow-sticky-layout', schedule);
  window.addEventListener('resize', function () { if (matchMedia('(min-width: 1440px)').matches) setOpen(false, false);schedule(); }, { passive: true });
  window.addEventListener('hashchange', function () {
    items.forEach(function (item) { item.link.href = href(item.target.id); });
    if (isCase) jump(items.find(function (item) { return item.target.id === decodeURIComponent(location.hash.slice(1)); }), false);
  });
  new MutationObserver(mount).observe(app, { childList: true, subtree: true });mount();
})();
