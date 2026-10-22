(() => {
  "use strict";
  const scenarioIds = ["scenario-1", "scenario-2", "scenario-3"];
  const scenarioButtons = [...document.querySelectorAll("[data-scenario]")];
  const scenarioPanels = scenarioIds.map((id) => document.getElementById(id));
  const printButton = document.getElementById("print-button");
  let selectedScenario = "scenario-1";
  let printSnapshot = null;

  function validScenario(hash) {
    return scenarioIds.includes((hash || "").replace(/^#/, ""));
  }
  function selectScenario(id) {
    if (!scenarioIds.includes(id)) return;
    selectedScenario = id;
    scenarioButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.scenario === id));
    });
    scenarioPanels.forEach((panel) => {
      panel.hidden = panel.id !== id;
    });
  }
  function revealTarget(fragment) {
    const id = (fragment || "").replace(/^#/, "");
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    if (scenarioIds.includes(id)) selectScenario(id);
    let node = target;
    while (node && node !== document.body) {
      if (node.matches && node.matches("details")) node.open = true;
      node = node.parentElement;
    }
    // Scenario deep links land on the controls as well as the narrative.
    const scrollTarget = scenarioIds.includes(id)
      ? document.querySelector(".scenario-toolbar")
      : target;
    requestAnimationFrame(() => scrollTarget.scrollIntoView({ block: "start", behavior: "auto" }));
  }
  scenarioButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.scenario;
      selectScenario(id);
      // Keep the reader and keyboard focus in place while retaining Back/Forward.
      if (location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
      button.focus({ preventScroll: true });
    });
  });
  window.addEventListener("hashchange", () => {
    if (validScenario(location.hash)) selectScenario(location.hash.slice(1));
    else if (!location.hash) selectScenario("scenario-1");
    revealTarget(location.hash);
  });
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
      const hash = link.getAttribute("href");
      if (validScenario(hash)) selectScenario(hash.slice(1));
      revealTarget(hash);
    });
  });
  window.addEventListener("beforeprint", () => {
    if (printSnapshot) return;
    printSnapshot = {
      selectedScenario,
      open: [...document.querySelectorAll("details")].map((item) => item.open),
      hidden: scenarioPanels.map((panel) => panel.hidden)
    };
    document.querySelectorAll("details").forEach((item) => { item.open = true; });
    scenarioPanels.forEach((panel) => { panel.hidden = false; });
  });
  window.addEventListener("afterprint", () => {
    if (!printSnapshot) return;
    document.querySelectorAll("details").forEach((item, index) => { item.open = printSnapshot.open[index]; });
    scenarioPanels.forEach((panel, index) => { panel.hidden = printSnapshot.hidden[index]; });
    selectedScenario = printSnapshot.selectedScenario;
    printSnapshot = null;
  });
  printButton.addEventListener("click", () => window.print());

  // Only enhance after all required event handlers have been installed.
  document.documentElement.classList.add("js-enhanced");
  selectScenario(validScenario(location.hash) ? location.hash.slice(1) : "scenario-1");
  printButton.hidden = false;
  if (location.hash) revealTarget(location.hash);
})();

// Expand only the subsections belonging to the section currently being read.
(() => {
  const rail = document.querySelector('.page-rail');
  if (!rail) return;
  const links = [...rail.querySelectorAll('a')];
  const groups = [...rail.querySelectorAll('[data-rail-group]')];
  const sections = ['overview', 'states-title', 'decisions', 'scenarios', 'templates', 'sources']
    .map(id => document.getElementById(id)).filter(Boolean);
  let pending = false;
  function syncRail() {
    pending = false;
    const cutoff = innerWidth >= 1024 ? 165 : 100;
    let current = sections[0];
    sections.forEach(section => { if (section.getBoundingClientRect().top <= cutoff) current = section; });
    groups.forEach(group => {
      const expanded = group.dataset.railGroup === current.id;
      group.hidden = !expanded;
      const parent = rail.querySelector('[aria-controls="' + group.id + '"]');
      if (parent) parent.setAttribute('aria-expanded', String(expanded));
    });
    const visibleLinks = links.filter(link => !link.closest('[hidden]'));
    let active = visibleLinks.find(link => link.hash === '#' + current.id) || visibleLinks[0];
    if (current.id === 'decisions' || current.id === 'templates') {
      visibleLinks.forEach(link => {
        const target = document.getElementById(link.hash.slice(1));
        if (target && current.contains(target) && target.getBoundingClientRect().top <= cutoff) active = link;
      });
    }
    links.forEach(link => {
      if (link === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(syncRail); } }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  addEventListener('hashchange', schedule);
  addEventListener('load', schedule);
  syncRail();
})();

// Freeze row labels only when a worksheet actually overflows its viewport.
(() => {
  document.querySelectorAll('.table-scroll').forEach(region => {
    function update() {
      const overflowing = region.clientWidth > 0 && region.scrollWidth > region.clientWidth + 1;
      region.classList.toggle('is-overflowing', overflowing);
      region.classList.toggle('is-scrolled-x', overflowing && region.scrollLeft > 1);
    }
    region.addEventListener('scroll', update, { passive: true });
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(update);
      observer.observe(region);
      observer.observe(region.querySelector('table'));
    }
    window.addEventListener('resize', update);
    region.closest('details')?.addEventListener('toggle', update);
    update();
  });
})();

// Pin section-level controls only when their section exceeds the reading viewport.
(() => {
  const sections = [...document.querySelectorAll('.guide, .scenario-section')];
  const chrome = [...document.querySelectorAll('.site-header, .page-rail')];
  let scheduled = false;
  function update() {
    scheduled = false;
    const top = chrome.reduce((sum, element) => {
      const style = getComputedStyle(element);
      return sum + (style.position === 'sticky' ? element.getBoundingClientRect().height : 0);
    }, 0);
    document.documentElement.style.setProperty('--reading-top', top + 'px');
    const available = innerHeight - top;
    sections.forEach(section => section.classList.toggle('section-overflows', section.getBoundingClientRect().height > available + 1));
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    [...sections, ...chrome].forEach(element => observer.observe(element));
  }
  addEventListener('resize', schedule);
  addEventListener('load', schedule);
  document.addEventListener('toggle', schedule, true);
  schedule();
})();

// Stack each worksheet name above its column labels for that worksheet's lifetime.
(() => {
  const templates = [...document.querySelectorAll('.template')];
  let pending = false;
  function update() {
    pending = false;
    templates.forEach(template => {
      const title = template.querySelector('summary');
      const region = template.querySelector('.table-scroll');
      template.style.setProperty('--template-title-height', title.getBoundingClientRect().height + 'px');
      const overlap = template.open && region.classList.contains('is-overflowing')
        ? Math.max(0, title.getBoundingClientRect().bottom - region.getBoundingClientRect().top) : 0;
      region.style.setProperty('--table-header-offset', overlap + 'px');
    });
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(update); } }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    templates.forEach(template => { observer.observe(template.querySelector('summary')); observer.observe(template); });
  }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  addEventListener('load', schedule);
  document.addEventListener('toggle', schedule, true);
  schedule();
})();
