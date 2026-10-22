(function () {
  "use strict";
  var SCENARIOS = ["scenario-1", "scenario-2", "scenario-3"];
  var selected = "scenario-1";
  var panels, buttons, selector, printBtn, saved = null;

  function isScenario(id) { return SCENARIOS.indexOf(id) !== -1; }

  function select(id) {
    selected = id;
    panels.forEach(function (p) { p.hidden = p.id !== id; });
    buttons.forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-scenario") === id ? "true" : "false");
    });
  }

  function revealTarget(fragment, scroll) {
    var id = (fragment || "").replace(/^#/, "");
    try { id = decodeURIComponent(id); } catch (e) { return; }
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    if (isScenario(id)) select(id);
    var anc = el.closest ? el.closest("details") : null;
    if (el.tagName === "DETAILS") el.open = true;
    while (anc) { anc.open = true; anc = anc.parentElement && anc.parentElement.closest("details"); }
    if (el.closest && el.closest(".scenario")) { var s = el.closest(".scenario"); if (s.hidden) select(s.id); }
    if (scroll) el.scrollIntoView();
  }

  function onHash() {
    var id = location.hash.replace(/^#/, "");
    if (isScenario(id)) { select(id); revealTarget(location.hash, false); }
    else revealTarget(location.hash, true);
  }

  function beforePrint() {
    saved = {
      details: Array.prototype.map.call(document.querySelectorAll("details"), function (d) { return [d, d.open]; }),
      panels: panels.map(function (p) { return [p, p.hidden]; })
    };
    saved.details.forEach(function (x) { x[0].open = true; });
    panels.forEach(function (p) { p.hidden = false; });
  }
  function afterPrint() {
    if (!saved) return;
    saved.details.forEach(function (x) { x[0].open = x[1]; });
    saved.panels.forEach(function (x) { x[0].hidden = x[1]; });
    saved = null;
  }

  function init() {
    panels = Array.prototype.slice.call(document.querySelectorAll(".scenario"));
    selector = document.getElementById("scenario-selector");
    buttons = selector ? Array.prototype.slice.call(selector.querySelectorAll("button")) : [];
    printBtn = document.getElementById("print-btn");
    if (!panels.length || !buttons.length) return;

    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-scenario");
        // hidden target means the browser does not scroll; hashchange then keeps state in sync
        if (location.hash !== "#" + id) location.hash = id; else select(id);
      });
    });
    window.addEventListener("hashchange", onHash);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);

    document.documentElement.classList.add("enhanced");
    selector.hidden = false;
    var start = location.hash.replace(/^#/, "");
    select(isScenario(start) ? start : "scenario-1");
    if (printBtn) { printBtn.hidden = false; printBtn.addEventListener("click", function () { window.print(); }); }
    if (location.hash) { if (isScenario(start)) revealTarget(location.hash, true); else onHash(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
