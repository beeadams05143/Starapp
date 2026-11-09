// Group navigation changes presentation only; assigned membership controls permissions.
export function dashboardGroups(view,role){
  const cards=[...new Map(view.sections.flatMap(s=>s.cards).filter(c=>c.href!=='role-preview.html').map(c=>[c.href,c])).values()];
  const home=role==='case_manager'?['isa-outcomes.html','caregiver-report.html','chat.html','calendar.html','communication.html','support-preparation.html']:['caregiver-checkin.html','caregiver-report.html','isa-outcomes.html','chat.html','saved-drafts.html','star-moments-test.html?mode=add'];
  const admin=['settings-admin.html','group-settings.html','my-star-isa-review.html','caregiver-checkin-setup/'];
  const team=['calendar.html','documents/index.html','team-updates.html','communication.html','support-preparation.html'];
  const take=targets=>targets.map(h=>cards.find(c=>c.href===h)).filter(Boolean);
  const first=take(home),administration=role==='administrator'?take(admin):[];
  const used=new Set([...first,...administration].map(c=>c.href));
  const shared=take(team).filter(c=>!used.has(c.href));shared.forEach(c=>used.add(c.href));
  const more=cards.filter(c=>!used.has(c.href));
  return [{id:'overview',title:'Overview',heading:role==='case_manager'?'Review & coordinate':'Everyday actions',cards:first},
    {id:'team',title:'Team',heading:'Connect & plan',cards:shared},
    {id:'tools',title:'More Tools',heading:'More ways to support',cards:more},
    {id:'admin',title:'Admin',heading:'Manage your team',cards:administration}].filter(g=>g.cards.length);
}
export const shortTitles={
  'caregiver-checkin.html':'Check-in','caregiver-report.html':'Reports','isa-outcomes.html':'ISA Outcomes','chat.html':'Team Chat','saved-drafts.html':'Saved Drafts',
  'star-moments-test.html?mode=add':'Add a Moment','star-moments-test.html?mode=month':'My Month','settings-admin.html':'Team & Roles','group-settings.html':'Invitations',
  'my-star-isa-review.html':'Review Observations','caregiver-checkin-setup/':'Check-in Setup','feature-guide.html':'Guide & Resources','support-preparation.html':'Support Needs','my-star.html':'Open My STAR'
};
// Consistent 24px outline symbols, drawn locally rather than platform-dependent glyphs.
export function iconPaths(href){
  if(href.includes('settings-admin'))return ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8','M17 4a4 4 0 0 1 0 8','M22 21v-2a4 4 0 0 0-3-3.87'];
  if(href.includes('group-settings'))return ['M21 8v12H3V4h12','M3 6l9 7 5-3','M19 1v6','M16 4h6'];
  if(href.includes('isa-review'))return ['M9 3H5v18h14V3h-4','M9 2h6v4H9z','m8 13 3 3 5-6'];
  if(href.includes('checkin-setup'))return ['M4 6h16','M4 12h16','M4 18h16','M8 3v6','M16 9v6','M10 15v6'];
  if(href.includes('checkin'))return ['M9 3H4v18h16V3h-5','M9 2h6v4H9z','m8 13 3 3 5-6'];
  if(href.includes('report'))return ['M3 3v18h18','M7 16v-5','M12 16V7','M17 16V4'];
  if(href.includes('isa'))return ['M21 12a9 9 0 1 1-9-9','M17 12a5 5 0 1 1-5-5','m12 12 9-9','M16 3h5v5'];
  if(href.includes('chat')||href.includes('communication'))return ['M21 15a3 3 0 0 1-3 3H8l-5 4V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z','M7 8h10','M7 12h7'];
  if(href.includes('calendar')||href.includes('month'))return ['M3 5h18v16H3z','M7 2v6','M17 2v6','M3 10h18','M7 14h2','M13 14h2','M7 18h2'];
  if(href.includes('moment'))return ['M3 6h4l2-3h6l2 3h4v15H3z','M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0'];
  if(href.includes('draft'))return ['M14 2H4v20h16V8z','M14 2v6h6','M8 12h8','M8 16h6'];
  if(href.includes('focus'))return ['m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z'];
  if(href.includes('emergency'))return ['M4 3h16v18H4z','M12 7v10','M7 12h10'];
  if(href.includes('support'))return ['M12 21S2 15 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13z'];
  if(href.includes('team-updates'))return ['M3 10v4h4l10 5V5L7 10z','m7 14 2 7h4l-3-6','M21 8v8'];
  if(href.includes('guide'))return ['M12 5C8 2 3 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-2-7-2-10 1z','M12 5v15'];
  if(href.includes('document'))return ['M2 6h8l2 3h10v12H2z','M2 6V3h7l3 3h8v3'];
  return ['M12 3v18','M3 12h18','M6 6l12 12','M6 18 18 6'];
}
