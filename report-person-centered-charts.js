// UVM STAR TEST: two person-centered charts, drawn from existing saved evidence.
// Caregiver ISA measurements and voluntary My STAR answers are different sources.
// A chart is never a score, pass/fail determination, or proof of goal achievement.
import { buildIsaProgress } from './isa-progress-report-embedded.js?v=2026.10.29A';

export function buildIsaChartSeries(isaReport, goalId, measurementId) {
  const outcome=(isaReport?.outcomes||[]).find(row=>String(row.id)===String(goalId));
  const metric=outcome?.measurements?.find(row=>String(row.id)===String(measurementId));
  if(!outcome||!metric)return {kind:'empty',reason:'Select an ISA goal measurement.'};
  const entries=(metric.answers||[]).filter(row=>row&&row.value!==null&&row.value!==undefined&&String(row.value).trim()!=='');
  const unit=String(metric.unit||entries[0]?.unit||'').trim();
  // An unnamed number of task steps is not a chartable description of skills.
  if(/^steps?$/i.test(unit)){
    return {kind:'undefined-steps',label:metric.label,
      reason:'This ISA card records how many steps, but does not name which steps were completed. Define the steps in the ISA card before charting skill progress. Existing numbers remain in dated evidence.'};
  }
  if(!entries.length)return {kind:'empty',label:metric.label,reason:'No recorded answers for this goal and date range.'};
  const numeric=entries.every(row=>/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(String(row.value).trim())) &&
    new Set(entries.map(row=>String(row.unit||unit).trim())).size===1;
  if(numeric){
    // Every recorded answer remains an individual dot; never invent values
    // for missing dates or combine separate visits into a fake monthly score.
    const points=entries.map(row=>({
      date:String(row.date||'').slice(0,10),value:Number(row.value),
      caregiver:String(row.caregiver||''),activity:String(row.activity||'')
    })).sort((a,b)=>a.date.localeCompare(b.date));
    return {kind:'numeric',label:String(metric.label||''),unit,points,
      note:points.length+' caregiver-recorded measurement'+(points.length===1?'':'s')+
        ' on '+new Set(points.map(p=>p.date)).size+' date(s). No values were inferred for other dates.'};
  }
  const counts=new Map();
  for(const row of entries){
    const text=String(row.value).trim();
    counts.set(text,(counts.get(text)||0)+1);
  }
  return {kind:'categories',label:String(metric.label||''),unit,
    categories:[...counts].map(([label,count])=>({label,count})),
    note:entries.length+' caregiver-recorded answers. Responses describe what was documented; they are not an ISA completion score.'};
}
export function buildChoiceSatisfactionData(checkins,scope={}){
  const groupId=String(scope.groupId||'');
  const individualId=scope.individualId==null?null:String(scope.individualId);
  const start=String(scope.start||''),end=String(scope.end||'');
  if(!groupId)throw Error('Select a STAR group.');
  if(start&&end&&start>end)throw Error('Start date must precede end date.');
  const satisfaction=new Map(),choices=new Map(),seen=new Set(),notes=[];
  let activitiesUnspecified=0,satisfactionTotal=0,choiceTotal=0;
  for(const row of Array.isArray(checkins)?checkins:[]){
    if(!row||String(row.group_id||'')!==groupId||
      (individualId!==null&&String(row.individual_id||'')!==individualId)||
      row.is_fictional!==true)continue;
    const type=String(row.response_type||'');
    if(type!=='daily_experience'&&type!=='leisure_preference')continue;
    const date=String(row.checkin_date||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||(start&&date<start)||(end&&date>end))continue;
    if(row.id&&seen.has(String(row.id)))continue;
    if(row.id)seen.add(String(row.id));
    const value=String(row.response_value||'').trim();
    if(!value)continue;
    const words=String(row.original_words||'').trim();
    if(type==='daily_experience'){
      satisfaction.set(value,(satisfaction.get(value)||0)+1);
      satisfactionTotal++;
      if(!words)activitiesUnspecified++;
    }else{
      choices.set(value,(choices.get(value)||0)+1);
      choiceTotal++;
    }
    if(notes.length<30)notes.push({date,type,value,words,offered:Array.isArray(row.offered_options)?row.offered_options.map(String):[]});
  }
  return {satisfaction:[...satisfaction].map(([label,count])=>({label,count})),
    choices:[...choices].map(([label,count])=>({label,count})),
    satisfactionTotal,choiceTotal,activitiesUnspecified,
    notes:notes.sort((a,b)=>b.date.localeCompare(a.date))};
}

export function createPersonCenteredCharts({rest,document:doc=document,clock=()=>new Date()}){
  const $=id=>doc.getElementById(id),graphs={isa:null,satisfaction:null,choices:null};
  let groupId='',caregiverEntries=[],cards=[],checkins=[],loadVersion=0,loadError='';
  let wasLoaded=false;
  const dateKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const values=()=>{
    const period=$('pcGraphPeriod')?.value||'month',now=clock();
    if(period==='all')return {start:'',end:''};
    if(period==='custom')return {start:$('pcGraphStart')?.value||'',end:$('pcGraphEnd')?.value||''};
    const start=period==='quarter'?new Date(now.getFullYear(),now.getMonth()-2,1):
      new Date(now.getFullYear(),now.getMonth(),1);
    return {start:dateKey(start),end:dateKey(now)};
  };
  function setRangeState(){
    const custom=$('pcGraphCustom');
    if(custom)custom.hidden=$('pcGraphPeriod')?.value!=='custom';
    const status=$('pcGraphRangeStatus'),range=values();
    if(status)status.textContent=range.start&&range.end
      ? 'Selected dates: '+range.start+' to '+range.end
      : 'All recorded dates';
  }
  function clearCharts(){
    for(const key of Object.keys(graphs)){
      graphs[key]?.destroy();
      graphs[key]=null;
    }
  }
  async function readAll(table,fields,order,group){
    const all=[];
    for(let offset=0;offset<10000;offset+=500){
      const rows=await rest(table+'?select='+fields+'&group_id=eq.'+encodeURIComponent(group)+
        '&order='+order+'&limit=500&offset='+offset);
      if(!Array.isArray(rows))throw Error('Could not load '+table+' for this group.');
      all.push(...rows);
      if(rows.length<500)return all;
    }
    throw Error('The chart dataset is too large to load completely. Choose a narrower period.');
  }
  function drawBars(id,key,rows,caption){
    const canvas=$(id);
    if(!canvas)return;
    graphs[key]?.destroy();graphs[key]=null;
    if(!rows.length){canvas.hidden=true;return;}
    canvas.hidden=false;
    if(typeof Chart==='undefined')throw Error('Chart library unavailable on this device.');
    graphs[key]=new Chart(canvas,{
      type:'bar',data:{
        labels:rows.map(r=>r.label),
        datasets:[{label:caption,data:rows.map(r=>r.count),
          backgroundColor:['#946c40','#5b8c89','#b48656','#9a87af','#7f8998','#b07967'],
          borderRadius:6,maxBarThickness:58}]
      },options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},datalabels:{display:false},
          tooltip:{callbacks:{label:ctx=>ctx.parsed.y+' recorded response(s)'}}},
        scales:{y:{beginAtZero:true,ticks:{precision:0},title:{display:true,text:'Recorded responses'}},
          x:{ticks:{autoSkip:false,maxRotation:30,font:{size:11}}}}
      }
    });
  }
  function drawISA(series){
    const canvas=$('pcIsaChart');
    graphs.isa?.destroy();graphs.isa=null;
    const status=$('pcIsaChartStatus'),note=$('pcIsaChartNote');
    const setState=message=>{if(status)status.textContent=message};
    if(!canvas)return;
    if(series.kind==='empty'||series.kind==='undefined-steps'){
      canvas.hidden=true;setState(series.reason);if(note)note.textContent='';
      return;
    }
    if(series.kind==='categories'){
      canvas.hidden=true;
      // Use the same chart canvas for categories while making the chart type clear.
      drawBars('pcIsaChart','isa',series.categories,'Recorded responses');
      setState(series.label+' — recorded answer breakdown (not scored progress).');
      if(note)note.textContent=series.note;
      return;
    }
    canvas.hidden=false;
    if(typeof Chart==='undefined')throw Error('Chart library unavailable on this device.');
    const labels=series.points.map(p=>{
      const d=new Date(p.date+'T12:00:00');
      return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
    });
    graphs.isa=new Chart(canvas,{
      type:'line',data:{labels,datasets:[{
        label:series.unit?series.label+' ('+series.unit+')':series.label,
        data:series.points.map(p=>p.value),
        borderColor:'#5b8c89',backgroundColor:'#5b8c89',
        pointBackgroundColor:'#724016',pointRadius:4,pointHoverRadius:6,
        tension:0.12,fill:false,spanGaps:false
      }]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},datalabels:{display:false},
          tooltip:{callbacks:{title:items=>series.points[items[0]?.dataIndex]?.date||'',
            label:item=>series.points[item.dataIndex]?.value+' '+(series.unit||'recorded value')}}},
        scales:{
          x:{title:{display:true,text:'Recorded check-in date'},
            ticks:{autoSkip:true,maxTicksLimit:7,maxRotation:0,font:{size:11}}},
          y:{beginAtZero:true,title:{display:true,text:series.unit||series.label}}
        }
      }
    });
    setState(series.label+' — recorded values by check-in date (not an ISA goal score).');
    if(note)note.textContent=series.note;
  }
  function listMetrics(report){
    const options=[];
    for(const outcome of report.outcomes){
      for(const measure of outcome.measurements){
        options.push({id:outcome.id+'|'+measure.id,
          label:outcome.title+' — '+measure.label,goalId:outcome.id,measurementId:measure.id,
          category:outcome.category});
      }
    }
    return options;
  }
  function redraw(){
    if(!groupId||!wasLoaded)return;
    if(doc.body.dataset.reportView!=='charts'&&!doc.body.classList.contains('print-export'))return;
    const range=values(),overall=$('pcGraphStatus');
    if(range.start&&range.end&&range.start>range.end){
      if(overall)overall.textContent='Please choose a valid date range.';
      clearCharts();return;
    }
    try{
      const report=buildIsaProgress(caregiverEntries,cards,{groupId,individualId:'',...range});
      const metrics=listMetrics(report),select=$('pcIsaGraphMeasure');
      const prior=select?.value;
      if(select){
        select.replaceChildren();
        for(const option of metrics){
          const el=doc.createElement('option');el.value=option.id;el.textContent=option.label;select.append(el);
        }
        if(metrics.some(x=>x.id===prior))select.value=prior;
        // Prefer a meaningful duration measurement over undefined "steps".
        else if(metrics.length){
          const best=metrics.find(x=>x.id.toLowerCase().includes('duration'))||
            metrics.find(x=>x.label.toLowerCase().includes('minutes'))||metrics[0];
          select.value=best.id;
        }
      }
      if(!metrics.length)drawISA({kind:'empty',reason:'No ISA measurements found for this group.'});
      else{
        const selected=metrics.find(x=>x.id===select?.value)||metrics[0];
        drawISA(buildIsaChartSeries(report,selected.goalId,selected.measurementId));
      }
      const feedback=buildChoiceSatisfactionData(checkins,{groupId,individualId:'',...range});
      drawBars('pcSatisfactionChart','satisfaction',feedback.satisfaction,'Recorded activity ratings');
      drawBars('pcLeisureChart','choices',feedback.choices,'Expressed choices');
      if($('pcSatisfactionStatus'))$('pcSatisfactionStatus').textContent=feedback.satisfactionTotal
        ? feedback.satisfactionTotal+' optional activity feedback answer(s).'
        : 'No activity satisfaction answers for this date range.';
      if($('pcLeisureStatus'))$('pcLeisureStatus').textContent=feedback.choiceTotal
        ? feedback.choiceTotal+' voluntary leisure choice(s). Choosing does not mean an activity took place.'
        : 'No leisure choices recorded for this date range.';
      if($('pcActivityContext'))$('pcActivityContext').textContent=feedback.activitiesUnspecified
        ? feedback.activitiesUnspecified+' satisfaction response(s) did not name the activity; STAR will not guess which activity was rated.'
        : 'Activity names come only from what the individual actually reported.';
      if(overall)overall.textContent='Showing fictional STAR Test data. Blank or skipped answers are not counted.';
    }catch(error){
      clearCharts();
      if(overall)overall.textContent='Unable to draw charts: '+(error?.message||error);
    }
  }
  async function refresh(group,entries){
    const current=++loadVersion;
    groupId=String(group||'');caregiverEntries=Array.isArray(entries)?entries:[];
    cards=[];checkins=[];wasLoaded=false;clearCharts();
    const overall=$('pcGraphStatus');
    if(!groupId){if(overall)overall.textContent='Choose a STAR Test group to see charts.';return;}
    if(overall)overall.textContent='Loading ISA and Individual Voice chart data…';
    try{
      const result=await Promise.all([
        readAll('star_isa_outcomes','id,group_id,individual_id,title,category,status,measurements',
          'created_at.asc',groupId),
        readAll('star_individual_checkins_test',
          'id,group_id,individual_id,checkin_date,response_type,response_value,original_words,offered_options,is_fictional',
          'checkin_date.desc',groupId)
      ]);
      if(current!==loadVersion)return;
      [cards,checkins]=result;
      wasLoaded=true;loadError='';redraw();
      if(doc.body.dataset.reportView!=='charts'&&overall)
        overall.textContent='Chart data ready. Open More Charts to view.';
    }catch(error){
      if(current!==loadVersion)return;
      loadError=String(error?.message||error);
      if(overall)overall.textContent='Chart data could not be loaded: '+loadError;
      clearCharts();
    }
  }
  $('pcGraphPeriod')?.addEventListener('change',()=>{setRangeState();redraw();});
  for(const id of ['pcGraphStart','pcGraphEnd'])
    $(id)?.addEventListener('change',()=>{setRangeState();redraw();});
  $('pcIsaGraphMeasure')?.addEventListener('change',()=>{
    // The existing goal selection must remain in place on redraw.
    redraw();
  });
  doc.getElementById('reportViewNav')?.addEventListener('star-report-view-changed',event=>{
    if(event.detail?.view==='charts')requestAnimationFrame(()=>requestAnimationFrame(redraw));
    else clearCharts();
  });
  window.addEventListener('resize',()=>{
    for(const chart of Object.values(graphs))chart?.resize();
  });
  setRangeState();
  return {refresh,redraw};
}
