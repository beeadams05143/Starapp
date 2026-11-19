import { loadRoleContext } from './role-context.js';
import { rest } from './restClient.js';

const $ = selector => document.querySelector(selector);
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&lt;','"':'&quot;'}[c])),fmt=s=>{const d=new Date(String(s).slice(0,10)+'T12:00:00');return Number.isFinite(+d)?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'Unknown date'},day=s=>String(s||'').slice(0,10);
let cards=[],checks=[],voices=[],choices=[],moments=[],events=[],ready=false;
function period(){const v=$('#period').value;if(v==='all')return '';let d=new Date();if(v==='1')d.setDate(1);else d.setMonth(d.getMonth()-3);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function current(){return cards.find(x=>x.id===$('#goal').value)||cards[0]}
function scope(){const from=period(),card=current(),c=checks.filter(x=>!from||day(x.date)>=from),v=voices.filter(x=>(!from||day(x.created_at)>=from)&&x.linked_outcome_id===card?.id),m=[];for(const x of c){let a=x.payload?.isa_entries;if(typeof a==='string'){try{a=JSON.parse(a)}catch{a=[]}}for(const y of Array.isArray(a)?a:[]){if(y?.outcome_id===card?.id&&y.value!==''&&y.value!==null&&y.value!==undefined)m.push({...y,date:x.date,caregiver:x.caregiver_name,checkin:x})}}m.sort((a,b)=>day(a.date).localeCompare(day(b.date)));return {c,v,m,from}}
const block=(title,html)=>'<div class="panel"><h2>'+title+'</h2>'+html+'</div>';
function chart(rows){let p=rows.filter(x=>typeof x.value==='number'||(typeof x.value==='string'&&x.value.trim()!==''&&Number.isFinite(+x.value))).slice(-10);if(!p.length)return '<p class="muted">No numeric participation measurements recorded for this outcome in this period. Text measurements are listed below.</p>';let w=500,h=240,max=Math.max(1,...p.map(x=>+x.value))*1.2,l=45,r=25,t=25,b=40;let xx=i=>l+(w-l-r)*(p.length===1?.5:i/(p.length-1)),yy=v=>t+(h-t-b)*(1-v/max),path=p.map((x,i)=>(i?'L':'M')+xx(i)+' '+yy(+x.value)).join(' ');return '<svg class="chart" viewBox="0 0 500 240" role="img" aria-label="Recorded measurements over time"><path d="'+path+'" fill="none" stroke="#3277bf" stroke-width="4"/>'+p.map((x,i)=>'<circle cx="'+xx(i)+'" cy="'+yy(+x.value)+'" r="5" fill="#3277bf"/><text x="'+xx(i)+'" y="'+(yy(+x.value)-12)+'" text-anchor="middle" font-size="13">'+E(x.value)+'</text><text x="'+xx(i)+'" y="226" text-anchor="middle" font-size="11">'+E(fmt(x.date))+'</text>').join('')+'</svg>'}
function supports(c){return c.flatMap(x=>(Array.isArray(x.payload?.shift_supports)?x.payload.shift_supports:[]).map(s=>({...s,date:x.date,caregiver:x.caregiver_name,checkin:x}))).sort((a,b)=>day(b.date).localeCompare(day(a.date)))}
function item(x){const p=x.checkin?.payload||{};return '<div class="entry"><strong>'+E(fmt(x.date))+' · '+E(x.support||'Support not specified')+' · '+E(x.location||'Location not specified')+'</strong><div>'+E(x.note||'No support note recorded')+'</div><div class="muted">Recorded by '+E(x.caregiver||'caregiver')+(p.prompting_level?' · Prompting: '+E(p.prompting_level):'')+'</div></div>'}
function voice(x){return '<div class="entry"><strong>'+E(fmt(x.created_at))+' · '+E(x.response_choice||'My STAR')+'</strong>“'+E(x.original_words||'No words recorded')+'”<div class="muted">Reviewed link to this ISA outcome, not a measurement</div></div>'}
function render(){if(!ready)return;const {c,v,m,from}=scope(),s=supports(c),nums=m.filter(x=>x.value!=null&&String(x.value).trim()!==''&&Number.isFinite(+x.value)),delta=nums.length>1?(+nums[nums.length-1].value)-(+nums[0].value):null,levels=c.map(x=>+x.payload?.prompting_level).filter(x=>Number.isFinite(x)&&x>=0);$('#isa').innerHTML='<div class="cards">'+block('📈 Participation Over Time',chart(m)+'<p class="muted small">Caregiver-recorded measurements. No automatic goal-achievement score.</p>')+block('📋 At a Glance','<div class="stat"><span>Measured change</span><b>'+(delta===null?'Not enough numeric data':(delta>0?'+':'')+delta)+'</b></div><div class="stat"><span>ISA entries</span><b>'+m.length+'</b></div><div class="stat"><span>Supports documented</span><b>'+s.length+'</b></div><div class="stat"><span>Prompt level</span><b>'+(levels.length?levels.reduce((a,b)=>a+b,0)/levels.length:'Not recorded')+'</b></div><div class="stat"><span>Locations</span><b>'+E([...new Set(s.map(x=>x.location).filter(Boolean))].join(', ')||'Not recorded')+'</b></div>')+block('📝 Caregiver Observations',s.slice(0,12).map(item).join('')||'<p class="muted">No supports documented in this period.</p>')+block('🗣️ Jamie’s Voice (My STAR)',v.map(voice).join('')||'<p class="muted">No reviewed My STAR responses linked to this outcome.</p>')+block('🤝 Supports & Experience',s.slice(0,30).map(item).join('')||'<p class="muted">No support records.</p>')+block('📊 Progress Summary (Evidence)','<p>✓ '+m.length+' submitted ISA measurements.</p><p>✓ '+s.length+' documented support entries across '+new Set(s.map(x=>x.location).filter(Boolean)).size+' recorded locations.</p><p>✓ '+v.length+' reviewed individual statements linked to this outcome.</p><p class="muted">Measurements and observations are distinct. The team determines whether an outcome has been met.</p>')+'</div>'+block('👥 Team Review — Saved Review','<p>Use the existing ISA outcomes workflow for official goal updates. This page does not write a determination without a verified review table and access rules.</p><a href="./isa-outcomes.html">Open ISA Outcomes</a>') ;
$('#voice').innerHTML='<h2>🗣️ Individual Voice</h2>'+v.map(voice).join('')+'<h3>Other My STAR choices</h3>'+choices.filter(x=>!from||day(x.checkin_date)>=from).slice(0,30).map(x=>'<div class="entry"><strong>'+fmt(x.checkin_date)+' · '+E(x.response_type)+'</strong>'+E(x.original_words||x.response_value||'No response')+'</div>').join('')+'<h3>My STAR Moments</h3>'+moments.filter(x=>!from||day(x.created_at)>=from).slice(0,20).map(x=>'<div class="entry"><strong>'+fmt(x.created_at)+' · '+E(x.label)+'</strong>'+E(x.category||'')+'</div>').join('');
$('#checkins').innerHTML='<h2>📝 Recorded Check-ins</h2>'+c.slice(0,70).map(x=>'<div class="entry"><strong>'+fmt(x.date)+' · '+E(x.caregiver_name)+'</strong>'+supports([x]).map(y=>'<div>'+E(y.support||'Support')+' · '+E(y.location||'Location not recorded')+' · '+E(y.note||'')+'</div>').join('')+'<div class="muted">'+E(x.payload?.home_notes||x.payload?.interaction_note||'')+'</div></div>').join('');
$('#charts').innerHTML='<h2>📊 More Charts</h2>'+block('Support types',Object.entries(s.reduce((a,x)=>(a[x.support||'Not recorded']=(a[x.support||'Not recorded']||0)+1,a),{})).map(([k,n])=>'<div class="entry">'+E(k)+' · '+n+' entries</div>').join(''))+block('Locations',Object.entries(s.reduce((a,x)=>(a[x.location||'Not recorded']=(a[x.location||'Not recorded']||0)+1,a),{})).map(([k,n])=>'<div class="entry">'+E(k)+' · '+n+' entries</div>').join(''))+block('ISA measurements',m.map(x=>'<div class="entry">'+fmt(x.date)+' · '+E(x.measurement_label||x.activity||'Measurement')+': '+E(x.value)+' '+E(x.unit||'')+'</div>').join(''));
$('#letters').innerHTML='<h2>📄 Provider Letters</h2><p>The established letter generator, wording, sections and review rules are retained.</p><a href="./caregiver-report.html">Open existing caregiver report and provider letters</a><p class="muted">No alternative letter language is generated here.</p>';
const cal=$('#health');cal.querySelector('.small.muted').innerHTML='Monthly calendar of saved group events; <a href="./calendar.html">open the full STAR calendar</a> for original records.';const picked=$('#eventDate').value;
$('#eventDetails').textContent=picked?events.filter(event=>day(event.start_date)===picked&&(!from||picked>=from)).map(event=>event.title).join(' · ')||'No events recorded on this date.':'';
}

async function readReportRows(table, query, options) {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await rest(table + '?' + query + '&limit=500&offset=' + offset, options);
    all.push(...rows);
    if (rows.length < 500) return all;
  }
}

async function load() {
  const context = await loadRoleContext();
  if (!['administrator', 'caregiver', 'case_manager'].includes(context.role)) throw Error('Sign in as a team member to open reports.');
  const people = context.members.filter(member => member.assigned_role === 'individual');
  const select = $('#individual');
  select.replaceChildren(...people.map(person => new Option(person.display_name, person.user_id)));
  const preferred = new URLSearchParams(location.search).get('individual');
  if (people.some(person => person.user_id === preferred)) select.value = preferred;
  select.disabled = people.length < 2;
  const scope = 'group_id=eq.' + encodeURIComponent(context.group);
  const opts = { expectedUserId: context.uid };
  let loading = 0;

  async function selectPerson() {
    const attempt = ++loading;
    const person = select.value;
    ready = false;
    $('#dataStatus').textContent = 'Loading saved records…';
    for (const id of ['isa','voice','checkins','charts','letters','eventDetails']) $('#' + id).replaceChildren();
    if (!person) {
      $('#goal').replaceChildren();
      $('#dataStatus').textContent = 'No Individual account is linked to this group yet.';
      return;
    }
    const scopedPerson = scope + '&individual_id=eq.' + encodeURIComponent(person);
    const safeLegacy = people.length === 1;
    const cardScope = safeLegacy ? scope + '&or=(individual_id.eq.' + encodeURIComponent(person) + ',individual_id.eq."")' : scopedPerson;
    const [a,b,c,d,e,f] = await Promise.allSettled([
      readReportRows('star_isa_outcomes','select=id,individual_id,title,category,outcome_text,status&' + cardScope + '&order=created_at.asc,id.asc',opts),
      readReportRows('caregiver_checkins','select=id,date,caregiver_name,payload&' + scope + '&order=date.desc,id.desc',opts),
      readReportRows('star_individual_observations','select=id,original_words,response_choice,created_at,linked_outcome_id&' + scopedPerson + '&review_status=eq.linked_observation&order=created_at.desc,id.desc',opts),
      readReportRows('star_individual_checkins','select=id,checkin_date,response_type,response_value,original_words&' + scopedPerson + '&order=checkin_date.desc,id.desc',opts),
      context.role === 'case_manager' ? Promise.resolve([]) : readReportRows('star_moments','select=id,created_at,label,category&' + scopedPerson + '&order=created_at.desc,id.desc',opts),
      readReportRows('calendar_events','select=id,start_date,title&' + scope + '&order=start_date.desc,id.desc',opts)
    ]);
    if (attempt !== loading) return;
    const rows = result => result.status === 'fulfilled' ? result.value : [];
    cards = rows(a);
    checks = rows(b).filter(entry => entry.payload?.individual_id ? entry.payload.individual_id === person : safeLegacy && !entry.payload?.individual_name);
    voices = rows(c);
    choices = rows(d);
    moments = rows(e);
    events = rows(f);
    $('#goal').replaceChildren(...cards.map(card => new Option(card.title, card.id)));
    ready = true;
    render();
    $('#dataStatus').textContent = [a,b,c,d,e,f].some(result => result.status === 'rejected')
      ? 'Some report records could not load. Available data is shown.'
      : checks.length + ' saved caregiver check-ins for the selected individual.';
  }
  select.addEventListener('change', selectPerson);
  for (const id of ['goal','period','eventDate']) $('#' + id).addEventListener('change', render);
  document.querySelectorAll('#menu button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('#menu button').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('section.page').forEach(item => item.classList.toggle('hidden', item.id !== button.dataset.page));
  }));
  await selectPerson();
}
load().catch(error => { $('#dataStatus').textContent = error.message || 'Reports could not load.'; });
