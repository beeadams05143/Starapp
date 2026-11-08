export function assignedRole(member) {
  if (!member) throw Error('Your membership could not be verified.');
  if (member.membership_role === 'admin') return 'administrator';
  return ['individual','caregiver','case_manager'].includes(member.assigned_role) ? member.assigned_role : 'caregiver';
}
export const roleLabels = {administrator:'Administrator',caregiver:'Caregiver',individual:'Individual',case_manager:'Case Manager'};
const card = (title, description, href, urgent=false) => ({title,description,href,urgent});
export function roleHome(role, name='the individual') {
  if (!roleLabels[role]) throw Error('Unknown team role');
  const review = [card('ISA outcomes','Review active outcomes and documented progress.','isa-outcomes.html'),card('Reports & Date Filters','Choose the individual and dates to review supports, locations, observations, and individual feedback.','caregiver-report.html'),card('Communication Supports',`Read ${name}’s preferences and shared communication guidance.`,'communication.html'),card('Understanding My Support Needs','Prepare together using the individual’s voice and dated team observations.','support-preparation.html')];
  const coordinate = [card('Calendar','Coordinate reviews and see team plans.','calendar.html'),card('Documents','Find and share important care documents.','documents/index.html'),card('Group Chat','Communicate with the team.','chat.html')];
  const daily = [card('Daily check-in','Record the shift, supports provided, locations, and observations.','caregiver-checkin.html'),card('My STAR Moments',`Add a photo and a short observation to share with ${name}.`,'star-moments-test.html?mode=add'),card('Reports','Review entries and the individual’s own responses.','caregiver-report.html')];
  const more = [card('My Month','Look back at experiences, photos, and responses.','star-moments-test.html?mode=month'),card('Saved Drafts','Finish check-ins you started on this device.','saved-drafts.html'),card('Focus','See the team’s weekly focus.','focus-week.html'),card('Team Updates','Read important team updates.','team-updates.html'),card('Feature Guide & Resources','Learn how to use STAR and find Vermont resources.','feature-guide.html'),card('Emergency information','Read the individual’s shared emergency sheet.','emergency-medical.html')];
  if (role==='individual') return {title:`My STAR · Hi, ${name}! ☆`,text:'What would you like to share today?',sections:[{title:'',cards:[card('Help Now','Tell my team I need help.','my-star.html?page=urgent',true),card('Something Hurts','Show my team where my body hurts.','my-star.html?page=pain',true),card('This Is How I Feel','Choose how I am feeling.','my-star.html?page=feel'),card('My Day','Share what I did and what I thought.','my-star.html?page=day'),card('My STAR Moments','Look at my photos and say what I liked.','star-moments-test.html?mode=review'),card('My Team Chat','Talk with my team.','chat.html'),card('How I Communicate','Tell people what helps me.','communication.html?view=mine'),card('What Helps Me','Share what helps me feel comfortable.','support-preparation.html'),card('Something I Did','Tell what I did, tried, or learned.','my-star.html?page=goals'),card('Would You Rather?','Choose what I like.','my-star.html?page=rather'),card('Picture Communication','Use my picture cards.','my-star-voice.html')]}]};
  if (role==='case_manager') return {title:name.startsWith('the individual')?'Your team overview':`${name}’s team overview`,text:`Review what ${name} and the team have shared.`,sections:[{title:'Review & support',cards:review},{title:'Calendar, Documents & Chat',cards:coordinate},{title:'More team tools',cards:more}]};
  const sections=[{title:'Daily support',cards:daily},{title:'Calendar & Group Chat',cards:coordinate},{title:'Communication & Support',cards:[...review.filter(c=>!['isa-outcomes.html','caregiver-report.html'].includes(c.href)),card('Open My STAR together','Help the individual share answers on your phone or tablet. Your own account stays signed in.','my-star.html')]},{title:'More team tools',cards:[review[0],...more]}];
  if (role==='administrator') sections.unshift({title:'Administration',cards:[card('Team members & roles','Manage every team member, including the individual.','settings-admin.html'),card('Group Settings & Invitations','Find your group invitation code and invite your team.','group-settings.html'),card('Review My STAR Observations','Review the individual’s shared accomplishments.','my-star-isa-review.html'),card('Configure caregiver check-in','Choose the sections and questions your team uses.','caregiver-checkin-setup/'),card('View other roles','Preview role dashboards without changing your account.','role-preview.html') ]});
  return {title:role==='administrator'?'Your team administration':'Welcome to your team',text:`Support ${name} and keep the team connected.`,sections};
}

// Read-only resolution: never change an account role based on a URL or cached menu mode.
export async function resolveRoleContext({session,ensureGroup,api}) {
  const uid=session?.user?.id;
  if (!uid) throw Error('Sign in to open your STAR home.');
  const group=await ensureGroup(uid);
  if (!group) return {uid,group:null};
  const members=await api('rpc/star_test_team_members',{method:'POST',body:JSON.stringify({p_group_id:group})});
  const self=members.find(m=>m.user_id===uid),role=assignedRole(self);
  return {uid,group,role,members,self};
}
