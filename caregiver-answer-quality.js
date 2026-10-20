// Persist this marker only for future submissions. Historical values must not
// acquire an assurance about answeredness that their original form did not keep.
export const ANSWER_VERSION = 1;
export function optionalAnswer(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return String(value).trim();
}
export function optionalEngagement(value) {
  const answer = optionalAnswer(value);
  return answer !== null && ['0', '1', '2', '3'].includes(answer) ? Number(answer) : null;
}
export function optionalYesNo(value) {
  const answer = optionalAnswer(value)?.toLowerCase();
  if (['yes', 'true'].includes(answer) || value === true) return 'yes';
  if (['no', 'false'].includes(answer) || value === false) return 'no';
  return null;
}
