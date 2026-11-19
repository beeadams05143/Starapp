import { requireSession, rest } from './restClient.js';
import { resolveActiveGroup } from './active-group.js';

async function requireIndividualScope() {
  const { user } = await requireSession();
  const { groupId, memberships } = await resolveActiveGroup(user.id);
  if (!groupId || !memberships.some(member => member.group_id === groupId)) {
    throw new Error('Join your STAR group before saving.');
  }
  return { groupId, userId: user.id };
}

function localDate() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(part => String(part).padStart(2, '0')).join('-');
}

export async function saveCheckin({ responseType, responseValue, originalWords = '', offeredOptions = [], supportKind, requestId }) {
  const { groupId, userId } = await requireIndividualScope();
  await rest('rpc/star_save_individual_checkin', {
    method: 'POST',
    expectedUserId: userId,
    body: JSON.stringify({
      request_id: requestId,
      team: groupId,
      care_date: localDate(),
      kind: responseType,
      answer: String(responseValue).trim(),
      words: String(originalWords).trim(),
      choices: offeredOptions.map(value => String(value).slice(0, 160)).slice(0, 20),
      support: String(supportKind || 'not_reported').slice(0, 160),
    }),
  });
}

export async function saveObservation({ words, choice = '', supportKind, requestId }) {
  const { groupId, userId } = await requireIndividualScope();
  const originalWords = String(words || '').trim() || String(choice).trim();
  await rest('star_individual_observations?on_conflict=id', {
    method: 'POST',
    expectedUserId: userId,
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      id: requestId,
      group_id: groupId,
      individual_id: userId,
      original_words: originalWords,
      response_choice: choice,
      support_kind: String(supportKind || 'not_reported').slice(0, 160),
    }),
  });
}
