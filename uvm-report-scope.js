// The Cedar Grove report is a Jamie Rivers demo, not a combined team report.
export function scopeUvmReportRows(rows, projectUrl, groupId) {
  if (projectUrl !== 'https://rjozzwmkvlndanoaghtc.supabase.co' ||
      groupId !== 'c40d0ac1-0122-46f6-b358-fac283287bb5') return rows;
  const jamie='58d3ac51-3dc7-4ead-b22f-8cb5829a3bac';
  const names=['Jamie Rivers','Jamie Rivers — FICTIONAL'];
  return rows.filter(row => {
    const payload = row.payload || {};
    const id = row.individual_id || payload.individual_id;
    return id ? id === jamie : names.includes(payload.individual_name);
  }).map(row=>{
    // Canonicalize the known legacy demo names only in this group and project.
    // This keeps old and newly linked entries in one individual filter.
    const payload=row.payload||{};
    return {...row,individual_id:jamie,payload:{...payload,individual_id:jamie}};
  });
}

// This one pre-profile demo card is identified explicitly by its existing ID.
// Adapt it for display without changing the database's immutable ownership fields.
export function scopeUvmIsaCards(cards,projectUrl,groupId){
  if(projectUrl!=='https://rjozzwmkvlndanoaghtc.supabase.co'||groupId!=='c40d0ac1-0122-46f6-b358-fac283287bb5')return cards;
  return cards.map(card=>card.group_id===groupId && card.id==='f9e7beb4-a4eb-4c14-b890-957b6444ea9a' && !card.individual_id
    ? {...card,individual_id:'58d3ac51-3dc7-4ead-b22f-8cb5829a3bac'} : card);
}
