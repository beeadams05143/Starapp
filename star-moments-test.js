import {rest, requireSession} from './restClient.js';
import {ensureActiveGroupId} from './active-group.js';
import {SUPABASE_URL} from './supabaseClient.js';

const observations=['Seemed to enjoy it','Unsure','Seemed uncomfortable'];
const categories=['Work','Community','Home','Learning','Fun/Leisure','Other'];
const ratings=['I liked it','It was okay','I didn’t like it','I’m not sure'];
const repeats=['Yes','No','I’m not sure'];
const supports=['Answered independently','Answered after seeing choices','Answered with caregiver assistance'];
const root=document.querySelector('main');
const mode=new URLSearchParams(location.search).get('mode');
const daily=mode==='daily';
const review=daily||mode==='review';
const back=review?'my-star.html':'dashboard.html';
// Cedar Grove’s seeded Jamie Rivers record. Only used in the UVM demo.
const jamieDemo = {group:'c40d0ac1-0122-46f6-b358-fac283287bb5', id:'58d3ac51-3dc7-4ead-b22f-8cb5829a3bac', name:'Jamie Rivers'};
let api, uid, team, person, previewOnly=false;
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
  root.replaceChildren();
  if(previewOnly)element('p','Jamie Rivers · Fictional preview');
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
  if(!Speech)return;
  button('🎙 Dictate',()=> {
    const speech=new Speech();
    speech.lang='en-US';
    speech.onresult=event=>{input.value=(input.value+' '+event.results[0][0].transcript).trim().slice(0,input.maxLength);};
    speech.onerror=()=>announce('Microphone unavailable. You can type instead.');
    speech.start();
  },parent);
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
const rows=()=>api('star_moments_test?group_id=eq.'+team+'&individual_id=eq.'+person+'&select=id,label,category,created_at,star_moment_responses_test(*)&order=created_at.desc&limit=100');
const response=row=>row.star_moment_responses_test;
const loadPhoto=async row=>Object.assign(row,(await api('star_moments_test?id=eq.'+row.id+'&select=photo'))[0]);
async function respond(row,values) {
  if(previewOnly){
    await showReview();
    announce('You tried the review. Preview answers are temporary.');
    return;
  }
  if(response(row)) {
    await api('star_moment_responses_test?moment_id=eq.'+row.id+'&satisfaction=eq.Not%20now',{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)
    }).then(result=>{if(!result?.length)throw new Error('This moment already has a response.');});
  } else await post('star_moment_responses_test',{moment_id:row.id,...values});
  if(daily){location.href=back;return;}
  await showReview();
  announce(values.satisfaction==='Not now'?'You can come back to this photo.':'Your answer was saved.');
}
function questions(row) {
  page(row.label);
  photo(row);
  element('h2','How was this?');
  const defer=()=>respond(row,{satisfaction:'Not now',again:null,words:'',support:null});
  ratings.forEach(satisfaction=>button(satisfaction,()=>{
    page(row.label);
    photo(row);
    element('h2','Would you like to do this again?');
    repeats.forEach(again=>button(again,()=>{
      page(row.label);
      photo(row);
      const form=element('form','');
      const words=field('Your exact words (optional)','textarea',form);
      words.maxLength=2000;
      dictate(words,form);
      const support=select('How did you answer?',supports,form);
      const save=element('button',previewOnly?'Try saving my answer':'Save my answer',form);
      form.onsubmit=async event=>{
        event.preventDefault();
        save.disabled=true;
        try {await respond(row,{satisfaction,again,words:words.value,support:support.value});}
        catch(error){announce(error.message);}
        finally {save.disabled=false;}
      };
      button('Back to choices',()=>questions(row));
      button('Not now',defer);
    }));
    button('Back to choices',()=>questions(row));
    button('Not now',defer);
  }));
  button('Not now',defer);
}
async function showReview() {
  page('My Moments to Review');
  const available=(await rows()).filter(row=>!response(row)||response(row).satisfaction==='Not now');
  available.sort((a,b)=>Number(Boolean(response(a)))-Number(Boolean(response(b))));
  if(!available.length){if(daily){location.replace(back);return;}element('p','You have no photos waiting.');return;}
  const show=async index=>{
    const row=await loadPhoto(available[index]);
    page('My Moments to Review');
    photo(row);
    element('p',row.label);
    element('h2',daily?'Want to look at a moment today?':'Want to look at this moment?');
    button('Yes',()=>questions(row));
    button('Not now',()=>respond(row,{satisfaction:'Not now',again:null,words:'',support:null}));
    if(!daily&&available.length>1)button('Next photo',()=>show((index+1)%available.length));
  };
  await show(0);
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
        element('p',answer.satisfaction);
        element('p','Do it again? '+answer.again);
        if(answer.words)element('blockquote',answer.words);
        element('p',answer.support);
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
    }else if(!daily && demoProfile){
      person=demoProfile.individual_id;
      previewOnly=true;
    }else{
      if(daily){location.replace(back);return;}
      throw new Error('Sign in as the individual to review their moments.');
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
