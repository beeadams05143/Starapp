// Run with Playwright installed externally; all Supabase and external traffic is mocked.
// STAR_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node caregiver-submission.browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.STAR_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(new URL('.', import.meta.url).pathname);
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + '/')) throw Error('invalid path');
    res.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : extname(path) === '.css' ? 'text/css' : 'text/html');
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const userId = '11111111-1111-4111-8111-111111111111', groupId = '22222222-2222-4222-8222-222222222222';
let passed = 0;
async function fixture({ viewport = { width:1280, height:900 }, timezoneId = 'America/New_York', practice = false, storageFailure = false } = {}) {
  const context = await browser.newContext({ viewport, timezoneId, isMobile: viewport.width < 900, hasTouch: viewport.width < 900 });
  const state = { records:[], posts:0, mode:'normal', errors:[] };
  await context.addInitScript(({userId,groupId,storageFailure}) => {
    localStorage.setItem('supabase.auth.token:starapp:okfsobfyhpforyqogjea', JSON.stringify({currentSession:{access_token:'mock-only',refresh_token:'mock-only',expires_at:4102444800,user:{id:userId,user_metadata:{full_name:'Test Caregiver'}}}}));
    localStorage.setItem('currentGroupId',groupId);
    localStorage.setItem('currentGroupName','Test Group');
    if(storageFailure) {
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(key.startsWith('star-checkin-recovery'))throw Error('Storage blocked');return original.call(this,key,value);};
    }
  }, {userId,groupId,storageFailure});
  await context.route('**/*', async route => {
    const req=route.request(), url=new URL(req.url());
    if(url.origin===base) return route.continue();
    if(url.hostname!=='okfsobfyhpforyqogjea.supabase.co') return route.abort();
    const table=url.pathname.split('/').pop();
    let data=[];
    if(table==='group_members') data=[{user_id:userId,group_id:groupId,groups:{id:groupId,name:'Test Group'}}];
    if(table==='profiles') data=[{id:userId,group_id:groupId,full_name:'Test Caregiver',role:'caregiver',onboarding_complete:true}];
    if(table==='caregiver_checkins') {
      if(req.method()==='POST') {
        state.posts++;
        const row=req.postDataJSON()[0];
        if(state.mode==='pause') await new Promise(r=>setTimeout(r,300));
        if(state.mode==='disconnect') return route.abort('failed');
        if(state.mode==='mismatch') row.payload.entry_date='2026-10-07';
        state.records.push(row);
        if(state.mode==='lost-response') return route.abort('failed');
        data=[row];
      } else if(url.searchParams.has('id')) {
        data=state.records.filter(r=>`eq.${r.id}`===url.searchParams.get('id'));
      } else if(url.searchParams.get('select')==='id' && !url.searchParams.has('group_id')) {
        data=[{id:'legacy-config-fixture'}];
      } else {
        if(state.mode==='auth-failure') return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Authentication unavailable'})});
        data=state.records;
      }
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();
  page.on('pageerror',err=>state.errors.push(err.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(`${base}/caregiver-checkin.html${practice?'?onboarding=1':''}`);
  await page.waitForFunction(()=>!document.getElementById('checkinFields').disabled);
  async function select(date='2026-10-08') {
    await page.locator('#entryDateInput').fill(date);
    await page.locator('#caregiver_name').fill('Answers preserved');
    await page.locator('#checkinDateConfirmed').check();
  }
  return {context,page,state,select};
}
async function test(name,fn) { await fn(); console.log(`PASS ${name}`); passed++; }
try {
  for(const [label,viewport,timezoneId] of [
    ['desktop',{width:1280,height:900},'America/New_York'],
    ['iPad',{width:820,height:1180},'Pacific/Kiritimati'],
    ['mobile',{width:390,height:844},'America/Los_Angeles']
  ]) await test(`${label}: blank date, inline confirmation, backdating, exact verified save, new blank form`,async()=>{
    const f=await fixture({viewport,timezoneId}); const {page,state}=f;
    assert.equal(await page.locator('#entryDateInput').inputValue(),'');
    assert.equal(await page.locator('#submitAll').isDisabled(),true);
    await f.select('1900-01-01');
    assert.equal(await page.locator('#submitAll').isEnabled(),true);
    await page.locator('#entryDateInput').fill('2026-10-08');
    assert.equal(await page.locator('#checkinDateConfirmed').isChecked(),false);
    assert.equal(await page.locator('#submitAll').isDisabled(),true);
    assert.match(await page.locator('#checkinDateLabel').textContent(),/Thursday, October 8, 2026/);
    await page.locator('#checkinDateConfirmed').check();
    if(label==='mobile') await page.locator('#checkinSubmitPanel').screenshot({path:'/private/tmp/star-checkin-mobile-confirmation.png'});
    state.mode='pause';
    await page.locator('#submitAll').click();
    assert.equal(await page.locator('#caregiver_name').isDisabled(),true);
    await page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.startsWith('Saved and Verified'));
    assert.equal(state.posts,1);
    assert.equal(state.records[0].date,'2026-10-08');assert.equal(state.records[0].payload.entry_date,'2026-10-08');
    assert.equal(state.records[0].group_id,groupId);assert.equal(state.records[0].user_id,userId);
    assert.equal(state.records[0].payload.mood_engagement, null);
    assert.equal(state.records[0].payload.appetite_change_flag, null);
    assert.equal(state.records[0].payload.prn_used_today, null);
    assert.equal(state.records[0].payload.answer_quality_version, 1);
    assert.equal(await page.locator('#checkinDateConfirmed').isChecked(),false);
    assert.ok(page.url().includes('caregiver-checkin.html'));
    await page.locator('#startNewCheckin').click();
    assert.equal(await page.locator('#entryDateInput').inputValue(),'');
    assert.equal(await page.locator('#submitAll').isDisabled(),true);
    assert.deepEqual(state.errors,[]);
    await f.context.close();
  });
  await test('refresh recovery preserves answers and requires fresh date confirmation',async()=>{
    const f=await fixture();await f.select();await f.page.reload();
    await f.page.waitForFunction(()=>!document.getElementById('checkinFields').disabled);
    assert.equal(await f.page.locator('#entryDateInput').inputValue(),'');
    await f.page.locator('#resumeDraftBtn').click();
    assert.equal(await f.page.locator('#caregiver_name').inputValue(),'Answers preserved');
    assert.equal(await f.page.locator('#entryDateInput').inputValue(),'2026-10-08');
    assert.equal(await f.page.locator('#checkinDateConfirmed').isChecked(),false);
    assert.equal(await f.page.locator('#submitAll').isDisabled(),true);
    assert.equal(f.state.posts,0);await f.context.close();
  });
  await test('storage failure blocks POST and never claims Draft Saved',async()=>{
    const f=await fixture({storageFailure:true});await f.select();
    await f.page.locator('#submitAll').click();
    await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.includes('Save Failed'));
    assert.equal(f.state.posts,0);
    assert.equal(await f.page.locator('#caregiver_name').inputValue(),'Answers preserved');
    assert.match(await f.page.locator('#storageNotice').textContent(),/unavailable/);
    assert.equal(await f.page.locator('#caregiver_name').isEnabled(),true);
    await f.context.close();
  });
  await test('uncertain response survives refresh and status checks never POST again',async()=>{
    const f=await fixture();await f.select();f.state.mode='disconnect';
    await f.page.locator('#submitAll').click();
    await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.startsWith('Save Status Uncertain'));
    assert.equal(f.state.posts,1);
    await f.page.locator('#checkSaveStatus').click();assert.equal(f.state.posts,1);
    await f.page.reload();await f.page.waitForFunction(()=>!document.getElementById('checkinFields').disabled);
    await f.page.locator('#resumeDraftBtn').click();
    assert.equal(await f.page.locator('#submitAll').isDisabled(),true);
    assert.equal(await f.page.locator('#caregiver_name').inputValue(),'Answers preserved');
    await f.page.locator('#checkSaveStatus').click();assert.equal(f.state.posts,1);
    await f.context.close();
  });
  await test('a new form cannot bypass a pending save after refresh',async()=>{
    const f=await fixture();await f.select();f.state.mode='disconnect';
    await f.page.locator('#submitAll').click();
    await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.startsWith('Save Status Uncertain'));
    await f.page.reload();await f.page.waitForFunction(()=>!document.getElementById('checkinFields').disabled);
    await f.select();await f.page.locator('#submitAll').click();
    await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.includes('unresolved submission already exists'));
    assert.equal(f.state.posts,1);
    assert.equal(await f.page.locator('#caregiver_name').inputValue(),'Answers preserved');
    await f.context.close();
  });
  await test('commit with lost response is reconciled and verified',async()=>{
    const f=await fixture();await f.select();f.state.mode='lost-response';await f.page.locator('#submitAll').click();
    await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.startsWith('Saved and Verified'));
    assert.equal(f.state.posts,1);await f.context.close();
  });
  await test('saved payload date mismatch is never reported as success',async()=>{
    const f=await fixture();await f.select();f.state.mode='mismatch';await f.page.locator('#submitAll').click();
    await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.startsWith('Save Status Uncertain'));
    assert.equal(await f.page.locator('#caregiver_name').inputValue(),'Answers preserved');await f.context.close();
  });
  await test('duplicate warning requires explicit additional-entry decision',async()=>{
    const f=await fixture();await f.select();
    f.state.records.push({id:'existing',user_id:userId,group_id:groupId,date:'2026-10-08',payload:{entry_date:'2026-10-08'}});
    await f.page.locator('#submitAll').click();await f.page.locator('#duplicateNotice').waitFor({state:'visible'});
    assert.equal(f.state.posts,0);assert.equal(await f.page.locator('#submitAll').isDisabled(),true);
    await f.page.locator('#allowDuplicate').check();await f.page.locator('#submitAll').click();
    await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.startsWith('Saved and Verified'));
    assert.equal(f.state.records.length,2);assert.equal(f.state.records[0].id,'existing');await f.context.close();
  });
  for(const mode of ['auth-failure','changed-group','changed-caregiver']) await test(`${mode}: no POST and answers preserved`,async()=>{
    const f=await fixture();await f.select();
    if(mode==='changed-group')await f.page.evaluate(()=>localStorage.setItem('currentGroupId','different-group'));
    else if(mode==='changed-caregiver')await f.page.evaluate(()=>localStorage.setItem('supabase.auth.token:starapp:okfsobfyhpforyqogjea', JSON.stringify({currentSession:{user:{id:'different-caregiver'},access_token:'mock-only',expires_at:4102444800}})));
    else f.state.mode=mode;
    await f.page.locator('#submitAll').click();await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.startsWith('Save Failed'));
    assert.equal(f.state.posts,0);assert.equal(await f.page.locator('#caregiver_name').inputValue(),'Answers preserved');await f.context.close();
  });
  await test('handler rejects bypassed date confirmation and date change preserves answers',async()=>{
    const f=await fixture();await f.select();
    await f.page.locator('#checkinDateConfirmed').uncheck();
    await f.page.evaluate(()=>document.getElementById('cg-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));
    assert.equal(f.state.posts,0);
    assert.match(await f.page.locator('#submissionStatus').textContent(),/confirm it directly above Submit/);
    await f.page.locator('#changeCheckinDate').click();
    assert.equal(await f.page.locator('#caregiver_name').inputValue(),'Answers preserved');
    await f.page.locator('#entryDateInput').fill('2026-10-01');
    assert.equal(await f.page.locator('#checkinDateConfirmed').isChecked(),false);
    await f.context.close();
  });
  await test('navigation warning and recovery copy preserve in-progress answers',async()=>{
    const f=await fixture();await f.select();
    const guarded=await f.page.evaluate(()=>{
      const event=new Event('beforeunload',{cancelable:true});
      window.dispatchEvent(event);return event.defaultPrevented;
    });
    assert.equal(guarded,true);
    const stored=await f.page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('star-checkin-recovery-v2:')).map(key=>JSON.parse(localStorage.getItem(key))));
    assert.ok(stored.some(item=>item.draft.data[0].caregiver_name==='Answers preserved'));
    await f.context.close();
  });
  await test('storage cleanup failure cannot undo verified database success',async()=>{
    const f=await fixture();await f.select();
    await f.page.evaluate(()=>{const remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key.startsWith('star-checkin-recovery'))throw Error('cleanup denied');return remove.call(this,key);};});
    await f.page.locator('#submitAll').click();
    await f.page.waitForFunction(()=>document.getElementById('submissionStatus').textContent.startsWith('Saved and Verified'));
    assert.match(await f.page.locator('#storageNotice').textContent(),/cleanup failed/);
    assert.equal(f.state.posts,1);
    const guarded=await f.page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
    assert.equal(guarded,false);await f.context.close();
  });
  await test('practice completion never writes or says Saved and Verified',async()=>{
    const f=await fixture({practice:true});await f.select();await f.page.locator('#submitAll').click();
    assert.match(await f.page.locator('#submissionStatus').textContent(),/Practice complete.*NOT saved/);
    assert.equal(f.state.posts,0);assert.equal(f.state.records.length,0);await f.context.close();
  });
  for (const width of [1280, 820, 390]) await test(`provider letter and dashboard at ${width}px`, async () => {
    const f = await fixture({ viewport: { width, height: 900 } });
    f.state.records = [
      { id: 'letter-one', group_id: groupId, user_id: userId, date: '2026-10-01', payload: { entry_date: '2026-10-01', answer_quality_version: 1, sleep_onset_difficulty: true, caregiver_notes: 'Enjoyed painting.' } },
      { id: 'letter-eight', group_id: groupId, user_id: userId, date: null, payload: { entry_date: '2026-10-08', answer_quality_version: 1, mood_engagement: '1', caregiver_notes: 'Needed extra breaks.' } },
      { id: 'letter-foreign', group_id: 'foreign', user_id: userId, date: '2026-10-08', payload: { caregiver_notes: 'PRIVATE FOREIGN NOTE' } },
    ];
    await f.page.goto(`${base}/caregiver-report.html`);
    await f.page.locator('#parentLetterStart').fill('2026-10-01');
    await f.page.locator('#parentLetterEnd').fill('2026-10-14');
    await f.page.locator('#parentLetterApply').click();
    await f.page.waitForFunction(() => document.getElementById('parentLetterBody').textContent.includes('Overall Progress'));
    const letter = await f.page.locator('#parentLetterBody').textContent();
    assert.match(letter, /2 check-ins across 2 unique dates/);
    assert.match(letter, /Oct 1, 2026: “Enjoyed painting\.”/);
    assert.doesNotMatch(letter, /PRIVATE FOREIGN NOTE/);
    assert.equal(await f.page.locator('#parentLetterPrint').isEnabled(), true);
    const box = await f.page.locator('#parentLetterBody').boundingBox();
    assert.ok(box.width <= width);
    await f.page.locator('#providerIncludeQuotes').uncheck();
    assert.equal(await f.page.locator('#parentLetterPrint').isDisabled(), true);
    await f.page.locator('#parentLetterApply').click();
    assert.doesNotMatch(await f.page.locator('#parentLetterBody').textContent(), /“/);
    await f.context.addInitScript(() => { window.print = () => {}; });
    const popupPromise = f.page.waitForEvent('popup');
    await f.page.locator('#parentLetterPrint').click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(await popup.locator('h1').textContent(), 'Provider Letter');
    assert.match(await popup.locator('.body').textContent(), /excluded for privacy review/);
    assert.doesNotMatch(await popup.locator('.body').textContent(), /PRIVATE FOREIGN NOTE/);
    await popup.emulateMedia({ media: 'print' });
    if (width === 390) await popup.screenshot({ path: '/private/tmp/star-provider-letter-print.png', fullPage: true });
    await popup.close();
    // Verify print receives the reviewed text, without regenerating it.
    await f.page.evaluate(() => { window.starPrintParentLetterOnly = value => { window.__printedLetter = value; }; });
    await f.page.locator('#parentLetterPrint').click();
    assert.match(await f.page.evaluate(() => window.__printedLetter.bodyText), /excluded for privacy review/);
    await f.page.evaluate(() => { window.__printedLetter = null; localStorage.setItem('currentGroupId', 'changed-group'); });
    await f.page.locator('#parentLetterPrint').click();
    assert.equal(await f.page.evaluate(() => window.__printedLetter), null);
    await f.page.locator('#parentLetterApply').click();
    assert.equal(await f.page.locator('#parentLetterBody').textContent(), '');
    assert.match(await f.page.locator('#parentLetterRange').textContent(), /active group changed/);
    await f.page.evaluate(id => localStorage.setItem('currentGroupId', id), groupId);
    await f.page.goto(`${base}/dashboard.html`);
    await f.page.waitForFunction(() => document.getElementById('dashboardDate')?.textContent.length > 0);
    assert.equal(await f.page.locator('#dashboardDate').textContent(), await f.page.evaluate(() => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })));
    assert.match(await f.page.locator('#dashboardGreeting').textContent(), /^Good (morning|afternoon|evening)$/);
    assert.equal(f.state.posts, 0);
    await f.context.close();
  });
  console.log(`${passed} browser scenarios passed; all remote traffic mocked.`);
} finally { await browser.close();server.close(); }
