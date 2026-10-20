/* View A typography only. Reflow a lone final word without changing prose or analytical content. */
(function () {
  'use strict';
  var original = new Map(), queued = false, app = document.getElementById('app');
  function repair() {
    queued = false;
    original.forEach(function (text, node) { node.nodeValue = text; }); original.clear();
    if (!app.classList.contains('view-a') || innerWidth < 1000) return;
    app.querySelectorAll('p, li, h2, h3, h4').forEach(function (block) {
      if (!block.getClientRects().length || block.closest('figure,.table-wrap,.prov,.mono') || block.querySelector('p,li,h2,h3,h4,svg,table')) return;
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), node, words = [];
      while ((node = walker.nextNode())) {
        var pattern = /\S+/g, match;
        while ((match = pattern.exec(node.nodeValue))) {
          var range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
          var box = range.getBoundingClientRect();
          if (box.width && box.height) words.push({ node: node, start: match.index, end: match.index + match[0].length, y: Math.round(box.bottom) });
        }
      }
      if (words.length < 3) return;
      var last = words[words.length - 1], previous = words[words.length - 2];
      if (Math.abs(last.y - previous.y) < 2 || last.node !== previous.node) return;
      original.set(last.node, last.node.nodeValue);
      last.node.nodeValue = last.node.nodeValue.slice(0, previous.end) + last.node.nodeValue.slice(previous.end, last.start).replace(/\s+/g, '\u00a0') + last.node.nodeValue.slice(last.start);
    });
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(repair); } }
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  document.fonts.ready.then(schedule);
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('toggle', schedule, true);
})();
