/* Temporary teaching state only. Shared package owns routing, index and sticky geometry. */
(() => {
  'use strict';
  const instances = new WeakMap();
  function init(root) {
    if (instances.has(root)) return instances.get(root);
    if (!root.classList.contains('cwds-ready')) throw new Error('Shared package unavailable; retain static cases.');
    const controller = new AbortController();
    const on = (el,name,fn) => el.addEventListener(name,fn,{signal:controller.signal});
    const articles = [...root.querySelectorAll('[data-cwds-scenario]')];
    const slugs = new Set(articles.map(a=>a.dataset.cwdsScenario));
    const selector = root.querySelector('[data-cwds-select]');
    const cards = [...root.querySelectorAll('.rs-case-card')];
    const cardCurrent = new Map(cards.map(card=>[card,card.getAttribute('aria-current')]));
    const evidence = root.querySelector('#evidence-condition');
    const original = new Map();
    const remember = el => { if(!original.has(el)) original.set(el,el.hidden); };
    const mode = root.querySelector('.rs-mode');
    const modeText = mode.textContent;
    const detailStates = new Map(),referenceStates=new Map();
    const trail=root.querySelector('.rs-path-trail'),archive=root.querySelector('.rs-history-archive'),back=root.querySelector('[data-rs-back]'),resetButton=root.querySelector('[data-rs-reset]');
    const picker=root.querySelector('.rs-case-picker'), pickerAnchor=root.querySelector('.rs-picker-anchor');
    let pickerFrame=0,pickerWasPinned=false,lastPastAnchor=false,lastPickerSlug='',recentLimit=4,historyNeedsSizing=true;
    function measurePicker(){
      pickerFrame=0;
      if(printing||!root.classList.contains('rs-ready')) return;
      const header=parseFloat(getComputedStyle(root).getPropertyValue('--cwds-header-height'))||0;
      const pastAnchor=pickerAnchor.getBoundingClientRect().bottom<=header;
      if(pastAnchor!==lastPastAnchor)historyNeedsSizing=true;
      lastPastAnchor=pastAnchor;
      picker.classList.toggle('is-pinned',pastAnchor);
      if(historyNeedsSizing){
        historyNeedsSizing=false;
        const focused=document.activeElement?.dataset.rsHistory;
        if(recentLimit!==4){recentLimit=4;renderHistory();}
        const historyRows=()=>new Set([...trail.querySelectorAll('li')].map(item=>Math.round(item.getBoundingClientRect().top))).size;
        if(historyRows()>2||(pastAnchor&&header+picker.getBoundingClientRect().height>innerHeight*.45)){recentLimit=2;renderHistory();}
        if(focused!==undefined){
          const target=trail.querySelector(`[data-rs-history="${focused}"]`);
          (target||archive.querySelector('summary')).focus({preventScroll:true});
        }
      }
      const height=picker.getBoundingClientRect().height;
      // Keep the compact layout stable while releasing the entire local stack when
      // the measured header and controls would consume the shared reading budget.
      const pinned=pastAnchor&&header+height<=innerHeight*.45;
      picker.classList.toggle('is-unpinned',pastAnchor&&!pinned);
      root.style.setProperty('--rs-picker-height',`${pinned?height:0}px`);
      if(pinned&&(!pickerWasPinned||lastPickerSlug!==selector.value)){
        const gallery=picker.querySelector('.rs-case-gallery'),selected=picker.querySelector('[aria-current="true"]');
        if(selected&&gallery.scrollWidth>gallery.clientWidth){
          const a=selected.getBoundingClientRect(),b=gallery.getBoundingClientRect();
          if(a.left<b.left+6)gallery.scrollLeft+=a.left-b.left-6;
          else if(a.right>b.right-6)gallery.scrollLeft+=a.right-b.right+6;
        }
      }
      pickerWasPinned=pinned;lastPickerSlug=selector.value;
      root.querySelectorAll('#cases .cwds-table-frame').forEach(frame=>{
        const scroll=frame.querySelector('.cwds-table-scroll'),title=frame.querySelector('.cwds-table-title');
        const available=innerHeight-header-(pinned?height:0)-(title?.getBoundingClientRect().height||0)-16;
        frame.classList.toggle('rs-record-unpinned',available<140);
        if(scroll)scroll.style.setProperty('--rs-record-max',`${Math.max(80,Math.min(448,available))}px`);
      });
    }
    const schedulePicker=()=>{if(!pickerFrame)pickerFrame=requestAnimationFrame(measurePicker);};
    let nodeId='s0', path=[], printing=false;
    const current=()=>articles.find(a=>!a.hidden)||articles[0];
    function renderHistory(){
      const list=trail.querySelector('ol'),earlier=archive.querySelector('ol');list.replaceChildren();earlier.replaceChildren();
      // Navigation actions remain in the full history; the sticky strip shows decisions.
      const decisions=path.map((entry,i)=>({entry,i})).filter(({entry})=>['supported','exception'].includes(entry.choice));
      const recent=new Set(decisions.slice(-recentLimit).map(({i})=>i));
      const older=path.length-recent.size;remember(archive);archive.hidden=older===0;
      archive.querySelector('summary').textContent=`Earlier choices (${older})`;
      if(!older)archive.open=false;
      path.forEach((entry,i)=>{
        const item=document.createElement('li'),button=document.createElement('button');
        button.type='button';button.dataset.rsHistory=String(i);button.dataset.choice=entry.choice;
        const state=entry.choice==='supported'?'Check':entry.choice==='exception'?'Warning':'Return action';
        button.title=entry.title+' — '+entry.label;button.setAttribute('aria-label',`${state}. Change choice ${i+1}: ${button.title}`);
        const title=document.createElement('strong');title.textContent=(i+1)+'. '+entry.title;
        if(recent.has(i)){
          title.textContent=entry.title;
          const selected=current().querySelector(`[data-rs-node="${entry.from}"] [data-rs-choice="${entry.choice}"] .rs-icon`);
          if(selected)button.append(selected.cloneNode(true));
          button.append(title);list.append(item);
        }else{
          const label=document.createElement('span');label.textContent=entry.label;button.append(title,label);earlier.append(item);
        }
        item.append(button);
      });
    }
    function render() {
      if(printing) return;
      const active=current();
      articles.forEach(article=>{
        const nodes=[...article.querySelectorAll('[data-rs-node]')];
        nodes.forEach(node=>{remember(node);node.hidden=article!==active||node.dataset.rsNode!==nodeId;});

        const node=article.querySelector(`[data-rs-node="${nodeId}"]`);
        article.querySelector('[data-rs-progress]').textContent=node?.dataset.rsTerminal?'Path result: '+node.dataset.rsTitle:'Current step: '+(node?.dataset.rsTitle||'');
        article.querySelectorAll('[data-rs-variant]').forEach(el=>{remember(el);el.hidden=el.dataset.rsVariant!==evidence.value;});
      });
      back.disabled=path.length===0;remember(trail);trail.hidden=path.length===0;
      const activeNode=active.querySelector(`[data-rs-node="${nodeId}"]`);trail.querySelector('p').textContent=(activeNode?.dataset.rsTerminal?'Result: ':'Now: ')+(activeNode?.dataset.rsTitle||'');
      historyNeedsSizing=true;renderHistory();
      cards.forEach(card=>{
        if(card.hash.slice(1)===active.dataset.cwdsScenario) card.setAttribute('aria-current','true');
        else card.removeAttribute('aria-current');
      });
      mode.textContent=`Selected case: ${active.dataset.label}. Scroll down to follow this case. Cases and records are fictional; no action is executed or saved.`;
      window.dispatchEvent(new Event('resize'));
    }
    const reset=()=>{nodeId='s0';path=[];evidence.value=evidence.dataset.default;render();};
    // Route: the scenario query selects the case, as in the shared package. A fragment owned by another
    // case is stale and is dropped; only a new fragment navigation lets the fragment choose its case.
    // Entries are corrected in place, so restoring a route never adds history.
    const owner=id=>id?document.getElementById(id)?.closest('[data-cwds-scenario]')?.dataset.cwdsScenario:undefined;
    function normalize(fragmentFirst) {
      const url=new URL(location.href), query=url.searchParams.get('scenario'), owned=owner(url.hash.slice(1));
      const chosen=(fragmentFirst&&owned)||(slugs.has(query)?query:owned);
      if(!chosen) return;
      if(owned&&owned!==chosen) url.hash='';
      url.searchParams.set('scenario',chosen);
      if(url.href!==location.href) history.replaceState(history.state,'',url);
      // The package applies a route from the current URL on popstate; no entry is pushed.
      if(current().dataset.cwdsScenario!==chosen) window.dispatchEvent(new PopStateEvent('popstate',{state:history.state}));
    }
    function follow() {
      const target=document.getElementById(location.hash.slice(1));
      const article=target?.closest('[data-cwds-scenario]');
      if(!article||article.hidden) return;
      const variant=target.closest('[data-rs-variant]');
      if(variant) evidence.value=variant.dataset.rsVariant;
      const step=target.closest('[data-rs-step]');
      if(step){nodeId=step.dataset.rsNode;path=[];}
      render();target.scrollIntoView({block:target===article?'start':'center',behavior:'instant'});
    }
    function restoreStatic() {
      original.forEach((hidden,el)=>el.hidden=hidden);
      mode.textContent=modeText;referenceStates.forEach((open,el)=>el.open=open);trail.querySelector('ol').replaceChildren();archive.querySelector('ol').replaceChildren();archive.open=false;
      cardCurrent.forEach((value,card)=>{if(value===null)card.removeAttribute('aria-current');else card.setAttribute('aria-current',value);});
      detailStates.forEach((open,el)=>el.open=open);detailStates.clear();
      root.classList.remove('rs-ready');
      root.querySelectorAll('.rs-earlier').forEach(el=>el.classList.remove('rs-earlier'));
      root.querySelectorAll('[data-rs-choice]').forEach(el=>el.removeAttribute('aria-pressed'));
      cancelAnimationFrame(pickerFrame);picker.classList.remove('is-pinned','is-unpinned');
      root.style.removeProperty('--rs-picker-height');
      root.querySelectorAll('.rs-record-unpinned').forEach(el=>el.classList.remove('rs-record-unpinned'));
      root.querySelectorAll('.cwds-table-scroll').forEach(el=>el.style.removeProperty('--rs-record-max'));
    }
    const instance={destroy(){controller.abort();restoreStatic();instances.delete(root);}};
    try {
      root.querySelectorAll('.rs-step-controls,.rs-evidence-control,.rs-sticky-actions').forEach(el=>{remember(el);el.hidden=false;});
      root.querySelectorAll('[data-rs-choice]').forEach(el=>{remember(el);el.hidden=false;});
      root.querySelectorAll('[data-rs-choice-static]').forEach(el=>{remember(el);el.hidden=true;});
      const move=next=>{
        const y=window.scrollY;nodeId=next;render();
        current().querySelector(`[data-rs-node="${nodeId}"]`)?.focus({preventScroll:true});
        window.scrollTo({top:y,behavior:'instant'});
      };
      const rewind=i=>{
        const entry=path[i];if(!entry)return;
        path=path.slice(0,i);
        if(current().dataset.caseId==='SC-05'){
          const review=[...path].reverse().find(p=>p.from==='s1');
          evidence.value=review?(review.choice==='supported'?'known':'unknown'):evidence.dataset.default;
        }
        move(entry.from);
      };
      on(back,'click',()=>rewind(path.length-1));on(resetButton,'click',reset);
      on(trail,'click',event=>{const button=event.target.closest('[data-rs-history]');if(button)rewind(Number(button.dataset.rsHistory));});
      on(archive,'click',event=>{const button=event.target.closest('[data-rs-history]');if(button)rewind(Number(button.dataset.rsHistory));});
      articles.forEach(article=>{
        const reference=article.querySelector('.rs-reference');referenceStates.set(reference,reference.open);reference.open=false;
        article.querySelectorAll('[data-rs-node]').forEach(node=>{
          node.querySelectorAll('[data-rs-choice]').forEach(button=>on(button,'click',()=>{
            let next=button.dataset.rsTarget;
            if(article.dataset.caseId==='SC-05'){
              if(node.dataset.rsNode==='s1')evidence.value=button.dataset.rsChoice==='supported'?'known':'unknown';
              if(node.dataset.rsNode==='s2'&&button.dataset.rsChoice==='supported'&&evidence.value==='unknown')next='x1';
            }
            path.push({from:node.dataset.rsNode,to:next,choice:button.dataset.rsChoice,title:node.dataset.rsTitle,label:button.querySelector('.cwds-outcome')?.textContent||button.textContent});
            move(next);
          }));
          node.querySelectorAll('[data-rs-return]').forEach(button=>on(button,'click',()=>rewind(path.length-1)));
        });
      });
      // The package has already pushed the selected case; drop a fragment that belongs to another case.
      on(selector,'change',()=>{normalize(false);reset();});
      cards.forEach(card=>on(card,'click',event=>{
        // Preserve native links for new tabs and static fallback. Ordinary selection updates the shared
        // selector in place, so choosing a card never performs fragment navigation or scrolls to the filter.
        if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey) return;
        event.preventDefault();
        const slug=card.hash.slice(1);
        if(selector.value===slug) return;
        selector.value=slug;
        selector.dispatchEvent(new Event('change',{bubbles:true}));
      }));
      on(window,'popstate',reset);
      on(window,'scroll',schedulePicker);
      on(window,'resize',()=>{historyNeedsSizing=true;schedulePicker();});
      root.addEventListener('toggle',schedulePicker,{capture:true,signal:controller.signal});
      on(window,'hashchange',()=>{normalize(true);follow();});
      on(evidence,'change',()=>{if(current().dataset.caseId==='SC-05'){path=[];nodeId='s1';}render();});
      on(window,'beforeprint',()=>{
        printing=true;
        root.querySelectorAll('[data-rs-step],[data-rs-variant]').forEach(el=>el.hidden=false);
        root.querySelectorAll('.rs-records,.rs-reference').forEach(el=>{detailStates.set(el,el.open);el.open=true;});
      });
      on(window,'afterprint',()=>{printing=false;detailStates.forEach((open,el)=>el.open=open);detailStates.clear();render();});
      render();normalize(false);follow();root.classList.add('rs-ready');schedulePicker();instances.set(root,instance);return instance;
    } catch(error){instance.destroy();throw error;}
  }
  window.ReportSprawl={init,version:'0.2.0'};
  try {init(document.body);} catch(error){console.error('Report Sprawl interaction unavailable; static guidance retained.',error);}
})();
