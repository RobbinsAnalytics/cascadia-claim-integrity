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
    requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "auto" }));
  }
  scenarioButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.scenario;
      selectScenario(id);
      if (location.hash !== `#${id}`) location.hash = id;
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
