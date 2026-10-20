/* Optional alternative hooks. Approved option 2 is rendered by the module itself. */
(function () {
  'use strict';
  var app = document.getElementById('app'), current = null;
  var options = {
    '1': {
      title: 'The ride is complete.<br>The claim still needs <em>support.</em>',
      lede: 'A completed trip is only the start of the billing record. Missing facts can hold a claim; a missing recipient decision can leave reporting unresolved.',
      points: [['Find the missing support', 'connect trip facts, health-plan records and billing evidence.'], ['Separate the decisions', 'ready to send, accepted and paid mean different things.']],
      name: 'The business problem'
    },
    '2': {
      title: 'Find the missing fact.<br>Choose the <em>next action.</em>',
      lede: 'The ride is complete. What needs attention before the record can move forward? Separate missing claim facts from missing reporting decisions, then follow the evidence to the right next step.',
      points: [['Before submission', 'find the fact holding the record back.'], ['After submission', 'distinguish a rejection from a response that never came back.']],
      name: 'The next action', recommended: true
    },
    '3': {
      title: 'One ride.<br>A chain of <em>evidence.</em>',
      lede: 'The ride company records the trip. The health plan holds benefit information. The NEMT team connects those facts into a supported claim and a downstream service report.',
      points: [['Trace the chain', 'see where the evidence is complete and where it stops.'], ['Keep the distinctions', 'a supported claim is not proof of acceptance or payment.']],
      name: 'The evidence chain', chain: true
    }
  };
  function mount() {
    var hero = app.querySelector('.view-a .hero');
    if (hero === current) return;
    current = hero;
    var key = new URL(location.href).searchParams.get('opening'), option = options[key];
    if (!hero || !option || key === '2') return;
    hero.classList.add('opening-variant');hero.setAttribute('data-opening', key);
    var copy = hero.querySelector('.hero-copy');
    copy.querySelector('.eyebrow').textContent = 'Cascadia Claim Integrity / What needs attention';
    copy.querySelector('h1').innerHTML = option.title;
    copy.querySelector('.lede').textContent = option.lede;
    var list = copy.querySelector('.readiness-points');list.replaceChildren();
    option.points.forEach(function (p) {
      var li = document.createElement('li'), strong = document.createElement('strong');
      strong.textContent = p[0] + ': ';li.append(strong, document.createTextNode(p[1]));list.appendChild(li);
    });
    if (option.chain) {
      var chain = document.createElement('p');chain.className = 'opening-chain';
      chain.setAttribute('aria-label', 'Record chain: ride facts, supported claim, encounter report');
      chain.innerHTML = '<strong>Ride facts</strong><span aria-hidden="true">→</span><strong>Supported claim</strong><span aria-hidden="true">→</span><strong>Encounter report</strong>';
      list.insertAdjacentElement('afterend', chain);
    }
    var review = document.createElement('div');review.className = 'opening-review';
    var label = document.createElement('strong');label.textContent = 'Opening ' + key + ': ' + option.name + (option.recommended ? ' · Recommended' : '');
    var link = document.createElement('a');link.href = 'opening-options.html';link.textContent = 'Compare all three';
    var original = document.createElement('a'), url = new URL(location.href);url.searchParams.delete('opening');url.searchParams.delete('jump');
    original.href = url.href;original.textContent = 'Current opening';review.append(label, link, original);
    hero.insertAdjacentElement('beforebegin', review);
  }
  new MutationObserver(mount).observe(app, { childList: true, subtree: true });mount();
})();
