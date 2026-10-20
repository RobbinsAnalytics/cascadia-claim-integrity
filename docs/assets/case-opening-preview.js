/* Optional alternatives. Approved option 2 is rendered directly in the case-study HTML. */
(function () {
  'use strict';
  var key = new URL(location.href).searchParams.get('opening');
  var options = {
    '1': {
      name: 'The payment-documentation problem',
      title: 'The ride happened.<br>Can the claim be <em>supported?</em>',
      lede: 'A completed medical ride is not enough to establish a payable claim. The required facts can sit in separate trip, health-plan and billing records. This build connects them and shows what is still missing.',
      points: [['The problem', 'missing required information can delay payment or leave reporting unresolved.'], ['The contribution', 'trace each claim fact to its evidence and identify the gap.']]
    },
    '2': {
      name: 'The analytical value',
      title: 'Turn scattered records<br>into a clear <em>next step.</em>',
      lede: 'A trip record says the ride happened. It does not establish that the claim is complete, ready to send or paid. This build separates those questions so the next step is supported by evidence.',
      points: [['Make the gap explicit', 'find the missing billing fact or recipient decision.'], ['Make the action specific', 'obtain support, correct the record or request the response.']]
    },
    '3': {
      name: 'One claim, three decisions',
      title: 'The record changes.<br>The next action <em>changes.</em>',
      lede: 'A medical ride is complete, but a billing-party identifier is missing. The identifier arrives, the claim can move forward, and a later rejection calls for a different follow-up. This recorded example shows why each decision needs its own evidence.',
      points: [['Before sending', 'obtain the missing identifier, then use the supported claim version.'], ['After rejection', 'request the recipient’s reason before choosing a correction.']]
    }
  };
  var option = options[key], hero = document.querySelector('.case-hero');
  if (!option || !hero || key === '2') return;
  hero.classList.add('opening-variant', 'case-opening-variant');hero.setAttribute('data-opening', key);
  var copy = hero.querySelector('.hero-copy');
  copy.querySelector('.eyebrow').textContent = 'Cascadia Claim Integrity / Case study';
  copy.querySelector('h1').innerHTML = option.title;
  copy.querySelector('.lede').textContent = option.lede;
  var list = copy.querySelector('.case-points');list.replaceChildren();
  option.points.forEach(function (point) {
    var li = document.createElement('li'), strong = document.createElement('strong');
    strong.textContent = point[0] + ': ';li.append(strong, document.createTextNode(point[1]));list.appendChild(li);
  });
  var review = document.createElement('div');review.className = 'opening-review';
  var label = document.createElement('strong');label.textContent = 'Case-study opening ' + key + ': ' + option.name;
  var compare = document.createElement('a');compare.href = 'case-opening-options.html';compare.textContent = 'Compare all three';
  var original = document.createElement('a'), url = new URL(location.href);url.searchParams.delete('opening');url.hash = '';
  original.href = url.href;original.textContent = 'Current opening';review.append(label, compare, original);
  hero.insertAdjacentElement('beforebegin', review);
})();
