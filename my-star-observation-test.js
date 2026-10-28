// UVM sandbox only. Preserve the individual's response exactly as supplied;
// no matching or ISA progress is awarded by this submission.
import { rest, getSessionFromStorage } from './restClient.js?v=2026.10.28UVM2';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.28UVM2';
import { SUPABASE_URL } from './supabaseClient.js?v=2026.10.28UVM2';

export async function saveFictionalMyStarObservation({words, choice = '', supportKind = 'not_reported'}) {
  // Fail closed if the staging-only UI is ever copied to another environment.
  if (SUPABASE_URL !== 'https://rjozzwmkvlndanoaghtc.supabase.co'
      || !['star-uvm-testing.netlify.app', 'localhost', '127.0.0.1'].includes(location.hostname)) {
    throw new Error('Saving is available only in the separate UVM STAR testing app.');
  }

  const originalWords = String(words || '').trim();
  const originalChoice = String(choice || '').trim();
  if (!originalWords && !originalChoice) throw new Error('Choose a picture or say what you did first.');
  if (originalWords.length > 2000) throw new Error('The answer is too long.');
  const session = getSessionFromStorage();
  const userId = session?.user?.id;
  if (!userId || !session.access_token) throw new Error('Sign into STAR TEST to save the fictional answer.');
  const groupId = await ensureActiveGroupId(userId);
  if (!groupId || getSessionFromStorage()?.user?.id !== userId)
    throw new Error('Your test account or test group changed. Sign in again and retry.');

  // A selected picture is itself a response. Never invent a spoken sentence.
  const payload = {
    group_id: groupId,
    individual_id: '',
    author_user_id: userId,
    original_words: originalWords || originalChoice,
    expression_type: 'accomplishment',
    response_choice: originalChoice,
    // Unchecked "help" is not evidence that the activity was independent.
    support_kind: String(supportKind || 'not_reported').slice(0, 160),
    possible_matches: []
  };
  await rest('star_individual_observations_test', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    expectedUserId: userId,
    body: JSON.stringify(payload)
  });
  return { saved: true };
}
