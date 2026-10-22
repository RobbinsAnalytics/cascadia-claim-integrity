"use strict";
(() => {
 const rail=document.querySelector('.page-rail');
 const toggle=rail?.querySelector('.playbook-contents-toggle');
 if(!toggle)return;
 function setOpen(open){rail.classList.toggle('is-open',open);toggle.setAttribute('aria-expanded',String(open));}
 toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
 rail.addEventListener('keydown',event=>{if(event.key==='Escape'){setOpen(false);toggle.focus();}});
 rail.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>setOpen(false)));
 document.addEventListener('click',event=>{if(!rail.contains(event.target))setOpen(false);});
})();
