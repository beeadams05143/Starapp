// The Cedar Grove report is a Jamie Rivers demo, not a combined team report.
export function scopeUvmReportRows(rows, projectUrl, groupId) {
  if (projectUrl !== 'https://rjozzwmkvlndanoaghtc.supabase.co' ||
      groupId !== 'c40d0ac1-0122-46f6-b358-fac283287bb5') return rows;
  return rows.filter(row => {
    const payload = row.payload || {};
    const id = row.individual_id || payload.individual_id;
    return id ? id === '58d3ac51-3dc7-4ead-b22f-8cb5829a3bac' :
      payload.individual_name === 'Jamie Rivers — FICTIONAL';
  });
}
