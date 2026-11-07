import {rest, requireSession} from './restClient.js';
import {ensureActiveGroupId} from './active-group.js';
import {SUPABASE_URL} from './supabaseClient.js';

const observations=['Seemed to enjoy it','Unsure','Seemed uncomfortable'];
const categories=['Work','Community','Home','Learning','Fun/Leisure','Other'];
const ratings=['I liked it','It was okay','I didn’t like it','I’m not sure'];
const root=document.querySelector('main');
const mode=new URLSearchParams(location.search).get('mode');
const daily=mode==='daily';
const review=daily||mode==='review';
const back=review?'my-star.html':'dashboard.html';
// Cedar Grove’s seeded Jamie Rivers record. Only used in the UVM demo.
const jamieDemo = {group:'c40d0ac1-0122-46f6-b358-fac283287bb5', id:'58d3ac51-3dc7-4ead-b22f-8cb5829a3bac', name:'Jamie Rivers'};
let api, uid, team, person, sharedDevice=false, personName='';
let reviewPeople=[];
let activeDictation=null;
function element(tag, value, parent=root) {
  const node=document.createElement(tag);
  node.textContent=value;
  parent.append(node);
  return node;
}
function button(label, action, parent=root) {
  const node=element('button',label,parent);
  node.type='button';
  node.onclick=async()=> {
    node.disabled=true;
    try {await action();} catch(error){announce(error.message);}
    finally {node.disabled=false;}
  };
  return node;
}
function announce(message) {document.querySelector('#status').textContent=message;}
function page(title) {
  window.speechSynthesis?.cancel();
  activeDictation?.abort();
  activeDictation=null;
  root.className=review?'moment-review':'';
  root.replaceChildren();
  const link=element('a',daily?'Finish check-in':'Back',root);
  link.href=back;
  element('h1',title);
  const status=element('p','');
  status.id='status';
  status.setAttribute('role','status');
}
function field(label,tag,parent=root) {
  return element(tag,'',element('label',label,parent));
}
function select(label, values, parent=root) {
  const node=field(label,'select',parent);
  element('option','Choose…',node).value='';
  values.forEach(value=>element('option',value,node));
  node.required=true;
  return node;
}
function dictate(input,parent) {
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  const mic=button('🎙 Dictate',()=>{
    if(!Speech){
      input.focus();
      announce('Use the microphone on your keyboard to speak, or type your words.');
      return;
    }
    if(activeDictation){activeDictation.stop();return;}
    window.speechSynthesis?.cancel();
    const speech=new Speech();
    activeDictation=speech;
    speech.lang='en-US';
    mic.textContent='⏹ Stop dictation';
    mic.setAttribute('aria-pressed','true');
    speech.onresult=event=>{
      if(activeDictation!==speech)return;
      input.value=(input.value+' '+event.results[0][0].transcript).trim().slice(0,input.maxLength);
      input.oninput?.();
      announce('Your words are ready. You can change them, then tap Save.');
    };
    speech.onerror=event=>{if(event.error!=='aborted')announce('Microphone unavailable. You can use your keyboard microphone or type instead.');};
    speech.onend=()=>{
      if(activeDictation===speech)activeDictation=null;
      mic.textContent='🎙 Dictate';
      mic.setAttribute('aria-pressed','false');
    };
    try{speech.start();announce('Listening…');}
    catch(error){activeDictation=null;mic.textContent='🎙 Dictate';throw error;}
  },parent);
  mic.setAttribute('aria-pressed','false');
}

function photo(row) {
  const img=element('img','');
  img.alt=row.label;
  img.src=row.photo;
}
async function compress(file) {
  // data: images are permitted by our CSP; blob: object URLs are not.
  const source=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('Could not read this photo. Please choose it again.'));
    reader.onabort=()=>reject(new Error('Photo loading was cancelled. Please choose it again.'));
    reader.readAsDataURL(file);
  });
  const img=new Image();
  await new Promise((resolve,reject)=>{
    img.onload=resolve;
    img.onerror=()=>reject(new Error('Could not open this photo. Please try a JPEG or PNG photo.'));
    img.src=source;
  });
  const scale=Math.min(1,1000/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.width*scale));
  canvas.height=Math.max(1,Math.round(img.height*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.78);
}
const post=(path,body)=>api(path,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
function add() {
  page('Add a Moment');
  const form=element('form','');
  const capture=field('Take a photo','input',form);
  const upload=field('Choose an existing photo','input',form);
  for(const input of [capture,upload]) {
    input.type='file';
    input.accept='image/*';
    input.onchange=()=>{(input===capture?upload:capture).value='';};
  }
  capture.setAttribute('capture','environment');
  const activity=field('Short activity label','input',form);
  activity.required=true;
  activity.maxLength=100;
  dictate(activity,form);
  const category=select('Category',categories,form);
  const observed=select('Caregiver observation',observations,form);
  const note=field('Short observation (optional)','textarea',form);
  note.maxLength=500;
  const save=element('button','Save moment',form);
  // Show feedback beside Save on long mobile forms.
  form.append(document.querySelector('#status'));
  form.onsubmit=async event=>{
    event.preventDefault();
    const file=capture.files[0]||upload.files[0];
    if(!file){announce('Choose or take a photo.');return;}
    save.disabled=true;
    save.textContent='Saving…';
    announce('Preparing your photo…');
    try {
      const image=await compress(file);
      announce('Saving your moment…');
      await post('rpc/star_add_moment_test',{moment:crypto.randomUUID(),team,person,activity:activity.value.trim(),kind:category.value,image,observed:observed.value,detail:note.value});
      form.reset();
      announce('Moment saved.');
    } catch(error){announce('Moment was not saved. '+(error.message||'Please try again.'));}
    finally {save.disabled=false;save.textContent='Save moment';}
  };
}
async function rows(){
  const list=[];
  let batch;
  do{
    batch=await api('star_moments_test?group_id=eq.'+team+'&individual_id=eq.'+person+'&select=id,label,category,created_at,star_moment_responses_test(*)&order=created_at.desc,id&limit=500&offset='+list.length);
    list.push(...batch);
  }while(batch.length===500);
  return list;
}
const response=row=>row.star_moment_responses_test;
const loadPhoto=async row=>Object.assign(row,(await api('star_moments_test?id=eq.'+row.id+'&select=photo'))[0]);
async function respond(row,values) {
  if(response(row)) {
    await api('star_moment_responses_test?moment_id=eq.'+row.id+'&satisfaction=eq.Not%20now',{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)
    }).then(result=>{if(!result?.length)throw new Error('This moment already has a response.');});
  } else await post('star_moment_responses_test',{moment_id:row.id,...values});
  window.speechSynthesis?.cancel();
  if(values.satisfaction==='Not now'){
    location.href=back;
    return;
  }
  page('⭐ My choice is saved');
  if(values.satisfaction!=='In my own words')element('p',values.satisfaction);
  if(values.words)element('blockquote',values.words);
  if(!daily)button('Next photo',showReview).className='moment-save';
  const finish=element('a','Back to My STAR');
  finish.href=back;
}
const isWaiting=row=>!response(row)||response(row).satisfaction==='Not now';
function speakMoment(text,force=false) {
  let enabled=false;
  try {enabled=localStorage.getItem('star_my_star_read_aloud_enabled')==='on';}catch{}
  if(!force&&!enabled)return;
  if(!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined'){
    if(force)announce('Read aloud is unavailable on this device. A helper can read the choices.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='en-US';
  utterance.rate=0.85;
  window.speechSynthesis.speak(utterance);
}
function reviewSubject(){
  if(sharedDevice){
    if(reviewPeople.length>1){
      const who=field('Reviewing for','select');
      reviewPeople.forEach(item=>{element('option',item.name,who).value=item.id;});
      who.value=person;
      who.onchange=async()=>{person=who.value;personName=reviewPeople.find(item=>item.id===person).name;try{localStorage.setItem('star_moments_person:'+team,person);}catch{};try{await showReview();}catch(error){announce(error.message);}};
    }else element('p',personName);
  }
}
function questions(row,count=1) {
  page('My Moments');
  reviewSubject();
  element('p',count+' photo'+(count===1?'':'s')+' waiting').className='moment-count';
  const prompt=row.label+'. How was this? I liked it. It was okay. I did not like it. I am not sure. Choose a face or tell me in your words, then tap Save. You can choose Not now.';
  button('🔊 Read to me',()=>speakMoment(prompt,true)).className='moment-hear';
  photo(row);
  element('h2',row.label).className='moment-label';
  element('h2','How was this?');
  const form=element('form','');
  const choices=element('div','',form);
  choices.className='moment-choices';
  choices.setAttribute('role','group');
  choices.setAttribute('aria-label','How was this?');
  let satisfaction='';
  const faces=['😊','😐','🙁','🤔'];
  const choiceButtons=ratings.map((value,index)=>{
    const node=button('',()=>{
      satisfaction=value;
      choiceButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===node)));
      save.disabled=false;
      announce(value+'. Tap Save.');
      speakMoment(value+'. Tap Save.');
    },choices);
    node.className='moment-choice';
    node.setAttribute('aria-pressed','false');
    const emoji=element('span',faces[index],node);
    emoji.className='moment-face';
    emoji.setAttribute('aria-hidden','true');
    element('span',value,node);
    return node;
  });
  const words=field('My words (optional)','textarea',form);
  words.maxLength=2000;
  words.rows=2;
  words.placeholder='Tell me about it';
  dictate(words,form);
  const save=element('button','Save',form);
  words.oninput=()=>{save.disabled=!satisfaction&&!words.value.trim();};
  save.type='submit';
  save.className='moment-save';
  save.disabled=true;
  const later=button('Not now',()=>respond(row,{satisfaction:'Not now',again:null,words:'',support:null}),form);
  later.className='moment-later';
  form.append(document.querySelector('#status'));
  let saving=false;
  form.onsubmit=async event=>{
    event.preventDefault();
    if((!satisfaction&&!words.value.trim())||saving)return;
    activeDictation?.abort();
    activeDictation=null;
    saving=true;
    save.disabled=true;
    later.disabled=true;
    choiceButtons.forEach(node=>node.disabled=true);
    announce('Saving your choice…');
    try {
      await respond(row,{satisfaction:satisfaction||'In my own words',again:null,words:words.value,support:null});
    }catch(error){announce('Your choice was not saved. '+error.message);}
    finally {
      saving=false;
      save.disabled=false;
      later.disabled=false;
      choiceButtons.forEach(node=>node.disabled=false);
    }
  };
  speakMoment(prompt);
}
async function showReview() {
  page('My Moments');
  const available=(await rows()).filter(isWaiting);
  available.sort((a,b)=>Number(Boolean(response(a)))-Number(Boolean(response(b))));
  if(!available.length){
    reviewSubject();
    element('p','You have no photos waiting.');
    const home=element('a','Back to My STAR');home.href=back;
    return;
  }
  const row=await loadPhoto(available[0]);
  questions(row,available.length);
}

function localMonth(date) {
  const value=new Date(date);
  return value.getFullYear()+'-'+String(value.getMonth()+1).padStart(2,'0');
}
async function month() {
  const list=await rows();
  page('My Month');
  const picker=field('Month','input');
  picker.type='month';
  picker.value=localMonth(new Date());
  const selection=element('section','');
  const render=()=>{
    selection.replaceChildren();
    const matching=list.filter(row=>localMonth(row.created_at)===picker.value||response(row)&&localMonth(response(row).reviewed_at)===picker.value);
    if(!matching.length)element('p','No moments this month.',selection);
    matching.forEach(row=>button(row.label,async()=>{
      const notes=await api('star_moment_notes_test?moment_id=eq.'+row.id+'&select=observation,note');
      await loadPhoto(row);
      page('My Month');
      button('Back to month',()=>{month().then(()=>{const input=root.querySelector('input');input.value=selected;input.onchange();}).catch(error=>announce(error.message));});
      element('h2',row.label);
      photo(row);
      const answer=response(row);
      const done=answer&&answer.satisfaction!=='Not now';
      element('p',done?'Individual responded':answer?'Not now—ask another time':'Waiting for individual response');
      if(done){
        element('h3','Individual reported');
        if(answer.satisfaction!=='In my own words')element('p',answer.satisfaction);
        if(answer.recorded_by && answer.recorded_by!==person)element('p','Shared device · Saved using a caregiver account');
        if(answer.again)element('p','Do it again? '+answer.again);
        if(answer.words)element('blockquote',answer.words);
        if(answer.support)element('p',answer.support);
      }
      if(done&&notes[0]){
        element('h3','Caregiver observed');
        element('p',notes[0].observation);
        if(notes[0].note)element('p',notes[0].note);
      }
    },selection));
    selected=picker.value;
  };
  let selected;
  picker.onchange=render;
  render();
}
async function start() {
  page('My STAR Moments');
  if(SUPABASE_URL!=='https://rjozzwmkvlndanoaghtc.supabase.co'||location.hostname!=='star-uvm-testing.netlify.app')throw new Error('Available only in STAR UVM Testing.');
  const session=await requireSession();
  uid=session.user.id;
  api=(path,options)=>rest(path,{...options,expectedUserId:uid});
  team=await ensureActiveGroupId(uid);
  if(!team)throw new Error('Choose a test group first.');
  const people=await api('star_moments_test_people?group_id=eq.'+team+'&select=individual_id');
  const ownProfile=people.find(row=>row.individual_id===uid);
  const demoProfile=team===jamieDemo.group && people.find(row=>row.individual_id===jamieDemo.id);
  if(review) {
    if(ownProfile){
      person=ownProfile.individual_id;
    }else if(people.length){
      sharedDevice=true;
      const profiles=await api('profiles?select=id,public_name,display_name,full_name&id=in.('+people.map(row=>row.individual_id).join(',')+')');
      reviewPeople=people.map((row,index)=>{
        const profile=profiles.find(item=>item.id===row.individual_id);
        return {id:row.individual_id,name:row.individual_id===demoProfile?.individual_id?jamieDemo.name:profile?.public_name||profile?.display_name||profile?.full_name||'Individual '+(index+1)};
      });
      let preferred;
      try{preferred=localStorage.getItem('star_moments_person:'+team);}catch{}
      person=reviewPeople.some(item=>item.id===preferred)?preferred:demoProfile?.individual_id||reviewPeople[0].id;
      try{localStorage.setItem('star_moments_person:'+team,person);}catch{}
      personName=reviewPeople.find(item=>item.id===person).name;
    }else{
      throw new Error('No individuals are linked to this group yet.');
    }
    await showReview();
    return;
  }
  if(people.some(row=>row.individual_id===uid))throw new Error('Use My Moments to Review from My STAR.');
  if(!people.length)throw new Error('No fictional individuals are set up for Moments in this group.');
  const profiles=await api('profiles?select=id,public_name,display_name,full_name&id=in.('+people.map(row=>row.individual_id).join(',')+')');
  const dropdown=field('Individual','select');
  people.forEach((row,index)=>{
    const profile=profiles.find(item=>item.id===row.individual_id);
    const label=row.individual_id===demoProfile?.individual_id ? jamieDemo.name :
      profile?.public_name || profile?.display_name || profile?.full_name || 'Fictional individual '+(index+1);
    element('option',label,dropdown).value=row.individual_id;
  });
  if(demoProfile)dropdown.value=demoProfile.individual_id;
  button('Continue',async()=>{person=dropdown.value;if(mode==='add')add();else await month();});
}
start().catch(error=>announce(error.message));
