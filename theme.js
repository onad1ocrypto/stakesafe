(() => {
 const system=matchMedia('(prefers-color-scheme: dark)');
 let preference='system';
 try{const stored=localStorage.getItem('stakesafe.theme');if(['light','dark','system'].includes(stored))preference=stored}catch{}
 function apply(){const actual=preference==='system'?(system.matches?'dark':'light'):preference;document.documentElement.dataset.theme=actual;document.documentElement.style.colorScheme=actual;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=actual==='dark'?'#101925':'#f6f8fb';document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===preference)));}
 window.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>{preference=b.dataset.themeChoice;try{localStorage.setItem('stakesafe.theme',preference)}catch{}apply()}));apply()});
 system.addEventListener('change',()=>{if(preference==='system')apply()});apply();
})();
