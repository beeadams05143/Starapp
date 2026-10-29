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
export function chooseDefaultIsaChartMetric(metrics,report,requestedId=''){
  if(!Array.isArray(metrics)||!metrics.length)return null;
  const valid=metrics.find(option=>option.id===requestedId);
  if(valid)return valid;
  const ranked=metrics.map(option=>({
    ...option,series:buildIsaChartSeries(report,option.goalId,option.measurementId)
  }));
  // Prefer a documented duration series; never default to undefined task steps.
  return ranked.find(r=>r.series.kind==='numeric'&&/minutes?|hours?|seconds?/i.test(r.series.unit))||
    ranked.find(r=>r.series.kind==='numeric'&&r.series.points.length)||
    ranked.find(r=>r.series.kind==='categories'&&r.series.categories.length)||
    ranked.find(r=>r.series.kind!=='undefined-steps'&&r.series.kind!=='empty')||
    ranked[0];
}
export function buildChoiceSatisfactionData(checkins,scope={}){
  const groupId=String(scope.groupId||'');
  const individualId=scope.individualId==null?null:String(scope.individualId);
  const start=String(scope.start||''),end=String(scope.end||'');
  if(!groupId)throw Error('Select a STAR group.');
  if(start&&end&&start>end)throw Error('Start date must precede end date.');
  const satisfaction=new Map(),choices=new Map(),activityRatings=new Map(),seen=new Set(),notes=[];
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
      // The exact optional "Which activity?" response is used, never extracted
      // or guessed from a vague like/dislike answer.
      const activity=words||'Activity not specified';
      const rated=activityRatings.get(activity)||{activity,ratings:{},total:0};
      rated.ratings[value]=(rated.ratings[value]||0)+1;
      rated.total++;
      activityRatings.set(activity,rated);
    }else{
      choices.set(value,(choices.get(value)||0)+1);
      choiceTotal++;
    }
    if(notes.length<500)notes.push({date,type,value,words,activity:words||'Activity not specified',
      offered:Array.isArray(row.offered_options)?row.offered_options.map(String):[]});
  }
  return {satisfaction:[...satisfaction].map(([label,count])=>({label,count})),
    choices:[...choices].map(([label,count])=>({label,count})),
    activityRatings:[...activityRatings.values()].sort((a,b)=>b.total-a.total||a.activity.localeCompare(b.activity)),
    satisfactionTotal,choiceTotal,activitiesUnspecified,
    notes:notes.sort((a,b)=>b.date.localeCompare(a.date))};
}

export function createPersonCenteredCharts({rest,document:doc=document,clock=()=>new Date()}){
  const $=id=>doc.getElementById(id),graphs={isa:null,satisfaction:null,choices:null};
  let groupId='',caregiverEntries=[],cards=[],checkins=[],loadVersion=0,loadError='';
  let requestedMetricId='';
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
  function chartArea(canvas,show){
    const host=canvas?.parentElement;
    if(host)host.hidden=!show;
    if(canvas)canvas.hidden=!show;
  }
  function drawBars(id,key,rows,caption){
    const canvas=$(id);
    if(!canvas)return;
    graphs[key]?.destroy();graphs[key]=null;
    if(!rows.length){chartArea(canvas,false);return;}
    chartArea(canvas,true);
    if(typeof Chart==='undefined')throw Error('Chart library unavailable on this device.');
    graphs[key]=new Chart(canvas,{
      type:'bar',data:{
        labels:rows.map(r=>r.label),
        datasets:[{label:caption,data:rows.map(r=>r.count),
          backgroundColor:'#5b8c89',borderRadius:6,maxBarThickness:32}]
      },options:{
        indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},datalabels:{display:false},
          tooltip:{callbacks:{label:ctx=>ctx.parsed.x+' recorded choice(s)'}}},
        scales:{x:{beginAtZero:true,ticks:{precision:0},title:{display:true,text:'Recorded choices'}},
          y:{ticks:{autoSkip:false,font:{size:11}}}}
      }
    });
  }
  function drawActivitySatisfaction(feedback){
    const canvas=$('pcSatisfactionChart');
    if(!canvas)return;
    graphs.satisfaction?.destroy();graphs.satisfaction=null;
    const records=feedback.activityRatings||[];
    const shown=records.slice(0,8);
    chartArea(canvas,shown.length>0);
    const wrapper=canvas.parentElement;
    if(wrapper&&shown.length)wrapper.style.height=Math.max(180,Math.min(500,65*shown.length+65))+'px';
    // Separate dated, exact activity names stay readable even on narrow phones.
    const list=$('pcActivityFeedbackList');
    if(list){
      list.replaceChildren();
      const entries=feedback.notes.filter(n=>n.type==='daily_experience').slice(0,8);
      for(const record of entries){
        const item=doc.createElement('li');
        const activity=doc.createElement('strong');
        activity.textContent=record.activity;
        const detail=doc.createElement('span');
        detail.textContent=' — '+record.value+' · '+record.date;
        item.append(activity,detail);
        list.append(item);
      }
      if(feedback.satisfactionTotal>entries.length){
        const more=doc.createElement('li');
        more.textContent=(feedback.satisfactionTotal-entries.length)+' additional responses are available in Individual Voice.';
        list.append(more);
      }
      if(!entries.length){
        const empty=doc.createElement('li');
        empty.textContent='No activity feedback recorded for these dates.';
        list.append(empty);
      }
    }
    if(!shown.length)return;
    if(typeof Chart==='undefined')throw Error('Chart library unavailable on this device.');
    const ratings=[...new Set(shown.flatMap(row=>Object.keys(row.ratings)))];
    const priorities=['Liked it','Okay','Did not like','No activity','Not today'];
    ratings.sort((a,b)=>{
      const aIndex=priorities.indexOf(a),bIndex=priorities.indexOf(b);
      return (aIndex<0?999:aIndex)-(bIndex<0?999:bIndex)||a.localeCompare(b);
    });
    const colors={
      'Liked it':'#5b8c89','Okay':'#b48656','Did not like':'#af6770',
      'No activity':'#7f8998','Not today':'#7f8998'
    };
    graphs.satisfaction=new Chart(canvas,{
      type:'bar',data:{
        labels:shown.map(row=>row.activity),
        datasets:ratings.map((rating,index)=>({
          label:rating,data:shown.map(row=>row.ratings[rating]||0),
          backgroundColor:colors[rating]||['#946c40','#9a87af','#b07967'][index%3],
          maxBarThickness:35
        }))
      },options:{
        indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}},
          datalabels:{display:false},
          tooltip:{callbacks:{
            title:items=>shown[items[0]?.dataIndex]?.activity||'Activity not specified',
            label:item=>item.dataset.label+': '+item.parsed.x+' response(s)'
          }}
        },
        scales:{
          x:{stacked:true,beginAtZero:true,ticks:{precision:0},
            title:{display:true,text:'Recorded satisfaction answers'}},
          y:{stacked:true,ticks:{autoSkip:false,font:{size:11},
            callback:function(value){const full=this.getLabelForValue(value);
              return full.length>23?full.slice(0,22)+'…':full;}}}
        }
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
      chartArea(canvas,false);
      setState(series.reason);
      if(note)note.textContent='';
      return;
    }
    if(series.kind==='categories'){
      // Use the same chart canvas for categories while making the chart type clear.
      drawBars('pcIsaChart','isa',series.categories,'Recorded responses');
      setState(series.label+' — recorded answer breakdown (not scored progress).');
      if(note)note.textContent=series.note;
      return;
    }
    chartArea(canvas,true);
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
      const chosen=chooseDefaultIsaChartMetric(metrics,report,requestedMetricId);
      if(select){
        select.replaceChildren();
        for(const option of metrics){
          const el=doc.createElement('option');el.value=option.id;el.textContent=option.label;select.append(el);
        }
        if(chosen)select.value=chosen.id;
      }
      if(!metrics.length)drawISA({kind:'empty',reason:'No ISA measurements found for this group.'});
      else{
        drawISA(buildIsaChartSeries(report,chosen.goalId,chosen.measurementId));
      }
      const feedback=buildChoiceSatisfactionData(checkins,{groupId,individualId:'',...range});
      drawActivitySatisfaction(feedback);
      drawBars('pcLeisureChart','choices',feedback.choices,'Expressed choices');
      if($('pcSatisfactionStatus'))$('pcSatisfactionStatus').textContent=feedback.satisfactionTotal
        ? feedback.satisfactionTotal+' optional satisfaction answer(s), shown by the activity exactly as entered. A rating is the individual’s opinion, not a goal score.'
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
    cards=[];checkins=[];requestedMetricId='';wasLoaded=false;clearCharts();
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
    requestedMetricId=$('pcIsaGraphMeasure').value;
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
