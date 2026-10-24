/* Cascadia Web Design System 2.0.0 progressive enhancement. Public lifecycle: CascadiaWebDesignSystem.init(root).destroy(). */
(() => {
  'use strict';
  const instances = new WeakMap();
  function init(root) {
    if (instances.has(root)) return instances.get(root);
    const controller = new AbortController(), cleanups = [], original = new Map();
    try {
    const on = (el, name, fn) => el?.addEventListener(name, fn, {signal:controller.signal});
    const all = s => [...root.querySelectorAll(s)];
    const remember = el => { if(!original.has(el)) original.set(el, el.getAttribute('hidden')); };
    const header=root.querySelector('.cwds-header'), menu=root.querySelector('.cwds-menu'), nav=root.querySelector('.cwds-nav');
    const index=root.querySelector('.cwds-index'), toggle=root.querySelector('.cwds-index-toggle');
    let frame=0;
    function close(el, button, focus=false) { el?.classList.remove('is-open');button?.setAttribute('aria-expanded','false');if(focus) button?.focus(); }
    function disclosure(el, button) {
      on(button,'click',()=>{const open=el.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));if(open)el.querySelector('a')?.focus({preventScroll:true});schedule();});
      on(el,'keydown',e=>{if(e.key==='Escape'){close(el,button,true);e.stopPropagation();}});
      on(el,'click',e=>{const a=e.target.closest('a');if(!a)return;close(el,button);const id=a.hash.slice(1), target=document.getElementById(id);if(target&&a.origin===location.origin&&a.pathname===location.pathname){target.tabIndex=-1;target.focus({preventScroll:true});}});
    }
    disclosure(nav,menu);disclosure(index,toggle);
    on(menu,'keydown',e=>{if(e.key==='Escape')close(nav,menu,true);});
    on(document,'keydown',e=>{if(e.key==='Escape'&&index?.classList.contains('is-open'))close(index,toggle,true);});
    const sections=all('[data-cwds-section],[data-cwds-subsection]'), links=all('.cwds-index a');
    const tables=all('.cwds-table-scroll');
    function measure() {
      frame=0;
      const headerHeight=header && getComputedStyle(header).position==='sticky'?header.getBoundingClientRect().height:0;
      root.style.setProperty('--cwds-header-height',`${headerHeight}px`);
      let stack=0;
      all('.cwds-toolbar,.cwds-table-frame').forEach(el=>{
        const rect=el.getBoundingClientRect(), boundary=el.closest('[data-cwds-section]').getBoundingClientRect();
        const active=rect.top<=headerHeight+1&&boundary.bottom>headerHeight+rect.height;
        el.classList.toggle('is-compact',active);
        const title=el.querySelector('.cwds-table-title'), scroll=el.querySelector('.cwds-table-scroll');
        const titleHeight=title?.getBoundingClientRect().height||0;
        const available=innerHeight-headerHeight-titleHeight-48;
        if(scroll)scroll.style.maxHeight=`${Math.max(140,Math.min(448,available))}px`;
        // Pin only long sections, and keep a useful reading viewport.
        const enabled=boundary.height>innerHeight-headerHeight && (scroll?available>=140:rect.height+headerHeight<=innerHeight*.45);
        el.style.position=enabled?'':'static';
        if(active&&enabled) stack=Math.max(stack,scroll?titleHeight:rect.height);
      });
      root.style.setProperty('--cwds-stack-height',`${stack}px`);
      tables.forEach(el=>{
        const overflow=el.scrollWidth>el.clientWidth+1;
        el.dataset.overflow=String(overflow);
        if(!overflow) el.scrollLeft=0;
        const hint=document.getElementById(el.getAttribute('aria-describedby'));
        if(hint){remember(hint);hint.hidden=!overflow;hint.textContent=el.scrollLeft+el.clientWidth>=el.scrollWidth-2?'Scroll left to return to earlier columns.':'Scroll horizontally for remaining columns. The field column stays visible.';}
      });
      const current=[...sections].reverse().find(el=>el.getClientRects().length&&el.getBoundingClientRect().top<=headerHeight+stack+45)||sections[0];
      links.forEach(a=>{
        if(a.hash===`#${current?.id}`)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');
        if(a.dataset.cwdsContext){remember(a);const target=document.getElementById(a.hash.slice(1));a.hidden=!target?.getClientRects().length||current?.closest('[data-cwds-section]')?.id!==a.dataset.cwdsContext;}
      });
    }
    function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
    const resize=new ResizeObserver(schedule);[header,...tables,...all('.cwds-toolbar,.cwds-table-title,.cwds-table-frame')].filter(Boolean).forEach(el=>resize.observe(el));cleanups.push(()=>resize.disconnect());
    on(window,'scroll',schedule);tables.forEach(el=>on(el,'scroll',schedule));on(root,'toggle',schedule);
    on(window,'resize',()=>{if(innerWidth>=768)close(nav,menu);if(innerWidth>=1440)close(index,toggle);schedule();});
    const selectors=all('[data-cwds-select]'), scenarios=all('[data-cwds-scenario]');
    function applyState(value,push=false){
      const chosen=scenarios.find(x=>x.dataset.cwdsScenario===value)||scenarios[0];
      if(!chosen)return;
      const focus=document.activeElement, oldTop=focus&&root.contains(focus)?focus.getBoundingClientRect().top:null;
      scenarios.forEach(el=>{remember(el);el.hidden=el!==chosen;});
      selectors.forEach(el=>el.value=chosen.dataset.cwdsScenario);
      all('[data-cwds-selected-label]').forEach(el=>el.textContent=chosen.dataset.label);
      if(push){const url=new URL(location.href);url.searchParams.set('scenario',chosen.dataset.cwdsScenario);history.pushState({},'',url);}
      if(focus?.closest('[hidden]')) {selectors[0]?.focus({preventScroll:true});selectors[0]?.scrollIntoView({block:'center'});}
      else if(oldTop!==null){const delta=focus.getBoundingClientRect().top-oldTop;if(delta)window.scrollBy(0,delta);}
      schedule();
    }
    selectors.forEach(el=>{remember(el.closest('.cwds-toolbar'));el.closest('.cwds-toolbar').hidden=false;on(el,'change',()=>applyState(el.value,true));});
    const routeState=()=>new URL(location.href).searchParams.get('scenario')||document.getElementById(location.hash.slice(1))?.dataset.cwdsScenario;
    on(window,'popstate',()=>applyState(routeState()));
    on(window,'hashchange',()=>{const target=document.getElementById(location.hash.slice(1));if(target?.dataset.cwdsScenario&&target.hidden){applyState(target.dataset.cwdsScenario);const url=new URL(location.href);url.searchParams.set('scenario',target.dataset.cwdsScenario);history.replaceState({},'',url);target.scrollIntoView();}});
    const printState=[];
    on(window,'beforeprint',()=>{scenarios.forEach(el=>{printState.push([el,el.hidden]);el.hidden=false;});});
    on(window,'afterprint',()=>{printState.splice(0).forEach(([el,hidden])=>el.hidden=hidden);schedule();});
    const instance={destroy(){controller.abort();cleanups.forEach(fn=>fn());cancelAnimationFrame(frame);root.classList.remove('cwds-ready');root.style.removeProperty('--cwds-header-height');root.style.removeProperty('--cwds-stack-height');original.forEach((value,el)=>{if(value===null)el.removeAttribute('hidden');else el.setAttribute('hidden',value);});close(nav,menu);close(index,toggle);all('.is-compact').forEach(el=>el.classList.remove('is-compact'));all('.cwds-toolbar,.cwds-table-frame').forEach(el=>el.style.removeProperty('position'));tables.forEach(el=>{delete el.dataset.overflow;el.style.removeProperty('max-height');});instances.delete(root);}};
    try {applyState(routeState());root.classList.add('cwds-ready');measure();instances.set(root,instance);return instance;}
    catch(error){instance.destroy();throw error;}
    } catch(error) {
      controller.abort();cleanups.forEach(fn=>fn());root.classList.remove('cwds-ready');
      original.forEach((value,el)=>{if(value===null)el.removeAttribute('hidden');else el.setAttribute('hidden',value);});
      throw error;
    }
  }
  window.CascadiaWebDesignSystem={version:'2.0.0',init};
  document.querySelectorAll('.cwds[data-cwds-auto]').forEach(root=>{try{init(root);}catch(error){console.error('Cascadia Web Design System enhancement failed; static content retained.',error);}});
})();
