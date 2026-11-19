// STAR Reports: presentation-only topic navigation. Do not change data loading or exports.
(function(){
  const choices={
    letter:'Generate, copy, or print a focused provider letter.',
    isa:'Individualized ISA goals with concise measurement summaries and expandable dated evidence.',
    individual:'Voluntary My STAR answers, with the individual’s words kept separate from caregiver observations.',
    checkins:'Find and print individual caregiver check-ins.',
    calendar:'Review health dates, mood information, and calendar observations.',
    charts:'Optional historical caregiver charts. These are not ISA outcome measurements.'
  };
  function init(){
    const nav=document.getElementById('reportViewNav');
    if(!nav)return;
    const buttons=Array.from(nav.querySelectorAll('[data-report-view-button]'));
    const desc=document.getElementById('reportViewDescription');
    function setView(next){
      if(!Object.hasOwn(choices,next))next='letter';
      document.body.dataset.reportView=next;
      for(const btn of buttons)btn.setAttribute('aria-pressed',String(btn.dataset.reportViewButton===next));
      if(desc)desc.textContent=choices[next];
      try{sessionStorage.setItem('starReportsSelectedView',next)}catch{}
      if(next==='charts'||next==='calendar'){
        // Chart.js and calendar canvases may have been initialized while hidden.
        requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
      }
      nav.dispatchEvent(new CustomEvent('star-report-view-changed',{detail:{view:next}}));
    }
    for(const btn of buttons){
      btn.addEventListener('click',()=>setView(btn.dataset.reportViewButton));
    }
    let initial='letter';
    const requested=new URLSearchParams(location.search).get('view');
    if(requested&&Object.hasOwn(choices,requested))initial=requested;
    else {
      try{const saved=sessionStorage.getItem('starReportsSelectedView');if(saved&&Object.hasOwn(choices,saved))initial=saved}catch{}
    }
    setView(initial);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
