import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {assignedRole,roleHome,resolveRoleContext} from './role-home-model.mjs';
const roles=['administrator','caregiver','case_manager','individual'];
const member=role=>({user_id:'self',membership_role:role==='administrator'?'admin':'member',assigned_role:role,display_name:'Alex Example'});
for(const role of roles)test(`${role} resolves from verified membership, not another member`,async()=>{
 const calls=[];const ctx=await resolveRoleContext({session:{user:{id:'self'}},ensureGroup:async uid=>{assert.equal(uid,'self');return 'group';},api:async(path,options)=>{calls.push([path,options]);return [member(role),{...member('administrator'),user_id:'other'}];}});
 assert.equal(ctx.role,role);assert.deepEqual(calls.map(x=>x[0]),['rpc/star_test_team_members']);assert.deepEqual(JSON.parse(calls[0][1].body),{p_group_id:'group'});
});
test('administrator label without admin membership cannot grant administration',()=>{
 assert.equal(assignedRole({membership_role:'member',assigned_role:'administrator'}),'caregiver');
 assert.equal(assignedRole({membership_role:'admin',assigned_role:'individual'}),'administrator');
 assert.throws(()=>assignedRole(null),/verified/);
});
test('missing or failed membership never falls back to an administrator dashboard',async()=>{
 await assert.rejects(resolveRoleContext({session:{user:{id:'self'}},ensureGroup:async()=> 'g',api:async()=> []}),/verified/);
 await assert.rejects(resolveRoleContext({session:{user:{id:'self'}},ensureGroup:async()=> 'g',api:async()=> {throw Error('offline');}}),/offline/);
 await assert.rejects(resolveRoleContext({session:null}),/Sign in/);
 assert.deepEqual(await resolveRoleContext({session:{user:{id:'self'}},ensureGroup:async()=>null}),{uid:'self',group:null});
});
test('all role cards open existing pages and preserve core individual tools',()=>{
 for(const role of roles)for(const section of roleHome(role,'Alex').sections)for(const c of section.cards){const path=c.href.split('?')[0];assert.ok(existsSync(path)||existsSync(path+'index.html'),c.href);}
 const cards=roleHome('individual','Alex').sections.flatMap(x=>x.cards);assert.equal(cards.length,11);
 for(const title of ['Help Now','Something Hurts','This Is How I Feel','My Day','My STAR Moments','My Team Chat','Picture Communication','Something I Did','Would You Rather?','What Helps Me','How I Communicate'])assert.ok(cards.some(c=>c.title===title),title);
 assert.match(roleHome('individual','Alex').title,/Alex/);assert.doesNotMatch(JSON.stringify(roleHome('case_manager','Alex')),/Jamie|Morgan|Benny/);
});
test('only administrator home contains team-role, invitation and configuration controls',()=>{
 const admin=JSON.stringify(roleHome('administrator'));
 for(const target of ['settings-admin.html','group-settings.html','caregiver-checkin-setup/','my-star-isa-review.html']){assert.ok(admin.includes(target));for(const role of roles.filter(r=>r!=='administrator'))assert.ok(!JSON.stringify(roleHome(role)).includes(target));}
 const cm=roleHome('case_manager','Alex').sections[0].cards;assert.deepEqual(cm.map(c=>c.href),['isa-outcomes.html','caregiver-report.html','communication.html','support-preparation.html']);
});
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.hidden=true;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(){this.children=[];}
 setAttribute(k,v){this.attrs[k]=v;}
 querySelector(){return null;}
}
const renderSource=readFileSync('role-home-render.js','utf8').replace(/^import.*\n/,'').replaceAll('export function','function');
function renderer(){const context=vm.createContext({roleHome,roleLabels:{administrator:'Administrator',caregiver:'Caregiver',individual:'Individual',case_manager:'Case Manager'},document:{createElement:tag=>new Element(tag)}});vm.runInContext(renderSource,context);return context.renderRoleHome;}
const flatten=n=>[n,...n.children.flatMap(flatten)];
test('working dashboards contain links; read-only previews share cards but cannot navigate or save',()=>{
 const render=renderer();for(const role of roles){const live=new Element('main'),preview=new Element('main');render(live,role,'Alex');render(preview,role,'Alex',{preview:true});const links=flatten(live).filter(n=>n.tagName==='a');assert.ok(links.length>3);assert.equal(flatten(preview).filter(n=>n.tagName==='a'||n.tagName==='button'||n.tagName==='form').length,0);assert.deepEqual(links.map(n=>n.children[0].textContent),flatten(preview).filter(n=>n.attrs['aria-disabled']==='true').map(n=>n.children[0].textContent));}
});
test('names are rendered as text, never interpreted as markup',()=>{const root=new Element('main');renderer()(root,'case_manager','<img src=x onerror=alert(1)>');assert.ok(flatten(root).some(n=>n.textContent?.includes('<img')));assert.ok(flatten(root).every(n=>n.innerHTML===undefined));});
const dash=readFileSync('role-dashboard.js','utf8').replace(/^import.*\n/gm,'').replace("await import('./home-activity.js')",'Promise.resolve()').replace(/init\(\)\.catch[\s\S]*$/,'globalThis.boot=init;');
for(const role of roles)test(`${role} opens its working home after sign-in`,async()=>{
 const elements=Object.fromEntries(['homeStatus','roleHome','activitySection'].map(id=>[id,new Element('div')]));const replacements=[],renders=[];
 const context=vm.createContext({setRoleBadge:()=>{},unreadMessagesQuery:()=>'',document:{getElementById:id=>elements[id]},window:{},location:{replace:path=>replacements.push(path)},loadRoleContext:async()=>({uid:'self',group:'g',role,self:member(role),members:[member('individual')]}),renderRoleHome:(root,role,name)=>renders.push({role,name}),getSessionFromStorage:()=>({user:{id:'self'}}),getSavedDraftCount:async()=>0,rest:async()=>[]});
 vm.runInContext(dash,context);await context.boot();
 if(role==='individual'){assert.deepEqual(replacements,['my-star.html']);assert.equal(renders.length,0);}else{assert.equal(renders[0].role,role);assert.equal(renders[0].name,'Alex Example');assert.equal(elements.roleHome.hidden,false);assert.equal(elements.homeStatus.textContent,'Signed in as Alex Example.');assert.equal(replacements.length,0);}
});
test('My STAR deep links open questions without submitting, and preserve optional voice controls',()=>{
 const html=readFileSync('my-star.html','utf8');assert.match(html,/render\(\['urgent','pain','feel','day','goals','rather','tell'\]\.includes\(requestedPage\)\?requestedPage:'home'\)/);assert.match(html,/star:identity/);assert.match(html,/updateReadButton/);assert.match(html,/Mic Setup/);assert.match(html,/tile\('chat'.*'My Team Chat'/);
 assert.doesNotMatch(readFileSync('role-context.js','utf8'),/localStorage|assign_team_role/);
});
