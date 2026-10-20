/* Portfolio navigation. No analytical data or record state is changed. */
(function () {
  'use strict';
  var button = document.getElementById('nav-toggle'), nav = document.getElementById('portfolio-nav'), header = document.querySelector('.site-head');
  function height() { document.documentElement.style.setProperty('--head-height', header.offsetHeight + 'px'); }
  function close(returnFocus) { nav.removeAttribute('data-open'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', 'Open navigation menu'); if (returnFocus) button.focus(); height(); }
  button.addEventListener('click', function () {
    var open = button.getAttribute('aria-expanded') !== 'true';
    if (open) { nav.setAttribute('data-open', 'true'); button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-label', 'Close navigation menu'); height(); nav.querySelector('a').focus({ preventScroll: true }); }
    else close(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') close(true); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) close(false); });
  window.addEventListener('resize', function () { if (innerWidth >= 768) close(false); height(); });
  if (window.ResizeObserver) new ResizeObserver(height).observe(header);
  height();
})();
