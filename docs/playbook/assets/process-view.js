"use strict";
(() => {
  const dialog = document.querySelector('.mvp-dialog');
  const frame = dialog.querySelector('iframe');
  const title = document.getElementById('mvp-dialog-title');
  let opener = null;
  document.querySelectorAll('[data-open-mvp]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      opener = button;
      title.textContent = button.dataset.buildLabel + ' / initial MVP';
      frame.title = button.dataset.buildLabel + ' initial MVP — full-screen view';
      frame.src = button.dataset.openMvp;
      dialog.showModal();
      document.documentElement.classList.add('mvp-view-open');
    });
  });
  dialog.querySelector('[data-close-mvp]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('mvp-view-open');
    frame.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  });
})();

// Keep the planning-flow heading below whichever page chrome is sticky.
(() => {
  const root = document.documentElement;
  const chrome = [...document.querySelectorAll('.site-header, .page-rail')];
  function update() {
    const top = chrome.reduce((sum, element) => sum + (getComputedStyle(element).position === 'sticky' ? element.getBoundingClientRect().height : 0), 0);
    root.style.setProperty('--process-sticky-top', top + 'px');
  }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(update);
    chrome.forEach(element => observer.observe(element));
  }
  addEventListener('resize', update);
  update();
})();

// Keep the arrows connected when content-sized cards wrap or resize.
(() => {
  const cycle = document.querySelector('.delivery-cycle');
  if (!cycle) return;
  const nodes = [...cycle.querySelectorAll('.delivery-steps>li')];
  const wide = cycle.querySelector('.delivery-cycle-arrows');
  const narrow = cycle.querySelector('.delivery-cycle-arrows-mobile');
  let pending = false;
  function draw() {
    pending = false;
    const box = cycle.getBoundingClientRect();
    const a = nodes[0].getBoundingClientRect(), b = nodes[1].getBoundingClientRect();
    const x1 = a.right - box.left + 7, x2 = b.left - box.left - 9;
    const y1 = a.top - box.top + a.height / 2, y2 = b.top - box.top + b.height / 2;
    wide.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const paths = wide.querySelectorAll(':scope > path');
    paths[0].setAttribute('d', `M${x1} ${y1} C${(x1+x2)/2} ${y1} ${(x1+x2)/2} ${y2} ${x2} ${y2}`);
    const ax = a.left - box.left + a.width / 2, bx = b.left - box.left + b.width / 2;
    const ab = a.bottom - box.top + 7, bb = b.bottom - box.top + 2;
    const base = Math.max(ab, bb) + 30;
    paths[1].setAttribute('d', `M${bx} ${bb} V${base-12} Q${bx} ${base} ${bx-12} ${base} H${ax+12} Q${ax} ${base} ${ax} ${base-12} V${ab}`);
    const width = narrow.getBoundingClientRect().width || 38;
    narrow.setAttribute('viewBox', `0 0 ${width} ${box.height}`);
    narrow.querySelector(':scope > path').setAttribute('d', `M${width} ${y2} H20 Q7 ${y2} 7 ${y2-13} V${y1+13} Q7 ${y1} 20 ${y1} H${width-3}`);
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(draw); } }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    [cycle, ...nodes].forEach(node => observer.observe(node));
  }
  addEventListener('resize', schedule);
  schedule();
})();
