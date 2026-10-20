/* Typography only. Preserve wording while preventing a lone final word at desktop widths. */
(function () {
  'use strict';
  var originals = new Map(), queued = false;
  function repair() {
    queued = false;
    originals.forEach(function (text, node) { node.nodeValue = text; });
    originals.clear();
    if (innerWidth < 1000) return;
    document.querySelectorAll('main p, main li, main td, main h2, main h3, main h4, main dd, main .journey-action, footer p').forEach(function (block) {
      if (!block.getClientRects().length || block.querySelector('p, li, h2, h3, h4, svg, table')) return;
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), node, words = [];
      while ((node = walker.nextNode())) {
        var pattern = /\S+/g, match;
        while ((match = pattern.exec(node.nodeValue))) {
          var range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
          var r = range.getBoundingClientRect();
          if (r.width && r.height) words.push({ node: node, start: match.index, end: match.index + match[0].length, y: Math.round(r.bottom), text: match[0] });
        }
      }
      if (words.length < 3) return;
      var last = words[words.length - 1], previous = words[words.length - 2];
      if (Math.abs(last.y - previous.y) < 2) return;
      // Most runts occur within one text node. Bind just the final word pair.
      if (last.node === previous.node) {
        originals.set(last.node, last.node.nodeValue);
        last.node.nodeValue = last.node.nodeValue.slice(0, previous.end) + last.node.nodeValue.slice(previous.end, last.start).replace(/\s+/g, '\u00a0') + last.node.nodeValue.slice(last.start);
      }
    });
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(repair); } }
  document.fonts.ready.then(schedule);
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('toggle', schedule, true);
})();
