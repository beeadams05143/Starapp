import { normalizeCheckinDate, formatCheckinDate } from './caregiver-dates.js';

// Read-only view model for the existing browser recovery copies.
// This is NOT authorization: server-stored drafts must enforce ownership with RLS.
export function draftCatalog(recoveries, { userId, groupId, practice = false } = {}) {
  if (!userId || !groupId) return [];
  return (Array.isArray(recoveries) ? recoveries : [])
    .filter(item => item && item.context?.userId === userId &&
      item.context?.groupId === groupId && item.context?.practice === practice &&
      item.phase !== 'verified')
    .map(item => {
      const date = normalizeCheckinDate(item.draft?.data?.[0]?.entry_date || '');
      const pending = item.attempt?.sent === true;
      return {
        key: item.key,
        date,
        dateLabel: date ? formatCheckinDate(date, 'en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        }) : 'Date not selected',
        caregiverName: item.context.caregiverLabel || 'Caregiver',
        updatedAt: item.updatedAt || '',
        status: pending ? 'save-uncertain' : 'draft',
        // An uncertain submission must NEVER be offered as a new editable draft.
        canContinue: !pending,
        canCheckSaveStatus: pending,
      };
    })
    .filter(item => typeof item.key === 'string' && item.key.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function chooseDraft(catalog, key) {
  const match = catalog.find(item => item.key === key);
  if (!match) throw new Error('Draft not found in this caregiver and group.');
  if (!match.canContinue) throw new Error('This submission may already have been sent. Check save status instead.');
  return match;
}
