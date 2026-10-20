/* Keep the active explorer section label visible; resize offsets follow the actual controls. */
(function () {
  'use strict';
  var app = document.getElementById('app'), current = null, resize = null, scheduled = false;
  function measure() {
    var controls = document.querySelector('.view-a .controls'), nav = document.getElementById('reader-section-nav');
    if (!controls || !nav) return;
    document.documentElement.style.setProperty('--reader-controls-height', controls.offsetHeight + 'px');
    document.documentElement.style.setProperty('--reader-nav-height', nav.offsetHeight + 'px');
  }
  function update() {
    scheduled = false;
    var nav = document.getElementById('reader-section-nav'); if (!nav) return;
    var line = nav.getBoundingClientRect().bottom + 16;
    var sections = Array.from(document.querySelectorAll('.view-a [data-explore-section]'));
    var active = sections.filter(function (n) { var r = n.getBoundingClientRect();return r.top <= line + 30 && r.bottom > line; }).pop();
    var title = document.getElementById('reader-section-title');
    if (active && title) {
      var text = active.getAttribute('data-explore-section');
      if (title.textContent !== text) title.textContent = text;
      title.setAttribute('data-section', active.id);
      var targets = Array.from(active.querySelectorAll('[data-explore-subsection]')).filter(function (node) {
        if (node.hasAttribute('data-subsection-card') && matchMedia('(min-width: 900px)').matches) return false;
        var box = node.getBoundingClientRect();
        return node.getClientRects().length && box.height > 0 && box.top <= line + 24;
      });
      var target = targets.pop(), subtitle = document.getElementById('reader-subsection-title');
      if (subtitle) {
        var label = target ? target.getAttribute('data-explore-subsection') : 'Overview';
        if (subtitle.textContent !== label) subtitle.textContent = label;
        subtitle.setAttribute('data-subsection', target ? target.getAttribute('data-reader-subsection') : 'overview');
      }
    }
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  function mount() {
    var nav = document.getElementById('reader-section-nav');if (nav === current) return;
    current = nav;if (resize) resize.disconnect();if (!nav) return;
    resize = new ResizeObserver(function () { measure();schedule(); });
    resize.observe(nav);resize.observe(document.querySelector('.view-a .controls'));
    measure();schedule();
  }
  new MutationObserver(mount).observe(app, { childList: true, subtree: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', function () { measure();schedule(); }, { passive: true });
  document.addEventListener('toggle', schedule, true);
  mount();
})();
