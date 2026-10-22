"use strict";
(() => {
 const header = document.querySelector('.integrated-header');
 if (!header) return;
 function update() { document.documentElement.style.setProperty('--integration-header-height', header.getBoundingClientRect().height + 'px'); }
 if ('ResizeObserver' in window) new ResizeObserver(update).observe(header);
 addEventListener('resize', update);
 const toggle = header.querySelector('.portfolio-menu-toggle');
 const nav = header.querySelector('.portfolio-tabs');
 if (toggle && nav) {
  function setOpen(open) {
   toggle.setAttribute('aria-expanded', String(open));
   toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
   nav.toggleAttribute('data-open', open);
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  header.addEventListener('keydown', event => {
   if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
 }
 update();
})();

// The process reading index uses the same current-section cue as the playbook.
(() => {
 if (!document.querySelector('.process-hero')) return;
 const links = [...document.querySelectorAll('.page-rail a[href^="#"]')];
 const stops = links.map(link => ({link, section: document.getElementById(link.hash.slice(1))})).filter(item => item.section);
 let queued = false;
 function update() {
  queued = false;
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--process-sticky-top')) || 0;
  let current = stops[0];
  for (const item of stops) if (item.section.getBoundingClientRect().top <= top + 64) current = item;
  const changed = current && current.link.getAttribute('aria-current') !== 'location';
  for (const item of stops) {
   if (item === current) item.link.setAttribute('aria-current', 'location');
   else item.link.removeAttribute('aria-current');
  }
  const rail = document.querySelector('.page-rail');
  if (changed && rail && getComputedStyle(rail).position === 'sticky') rail.scrollTo({left: Math.max(0, current.link.offsetLeft - 16)});
 }
 function schedule() { if (!queued) { queued = true; requestAnimationFrame(update); } }
 addEventListener('scroll', schedule, {passive:true});
 addEventListener('resize', schedule);
 addEventListener('hashchange', schedule);
 schedule();
})();
