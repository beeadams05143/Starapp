import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';
import { downloadJsonFromBucket, uploadJsonToBucket } from './shared-storage.js?v=2025.01.09E';

const SHARED_BUCKET = 'documents';
const FOCUS_PREFIX = 'shared/focus';
const GROUP_KEY = 'currentGroupId';
export const LOCAL_FOCUS_KEY = 'focusOfWeek_v3';

function getStoredGroupId() {
  try {
    return localStorage.getItem(GROUP_KEY) || null;
  } catch {
    return null;
  }
}

function setStoredGroupId(value) {
  try {
    if (value) localStorage.setItem(GROUP_KEY, value);
  } catch { /* ignore */ }
}

export async function ensureGroupId(userId) {
  let groupId = getStoredGroupId();
  if (groupId) return groupId;
  if (!userId) return null;
  try {
    const rows = await rest([
      'group_members?select=group_id',
      `user_id=eq.${encodeURIComponent(userId)}`,
      'order=joined_at.asc',
      'limit=1',
    ].join('&'));
    groupId = rows?.[0]?.group_id || null;
    if (groupId) setStoredGroupId(groupId);
  } catch (error) {
    console.warn('[focus-data] ensureGroupId failed', error);
  }
  if (!groupId && userId) {
    groupId = `solo-${userId}`;
    setStoredGroupId(groupId);
  }
  return groupId;
}

function normalizeGoals(goals = []) {
  return goals.map((goal, index) => {
    const id = goal?.id || goal?.goal_id || `goal-${index + 1}`;
    return {
      id,
      title: goal?.title || `Goal ${index + 1}`,
      promptGoal: goal?.promptGoal || goal?.support || goal?.prompt_goal || null,
      steps: Array.isArray(goal?.steps) ? goal.steps : [],
      notes: goal?.notes || '',
      status: goal?.status || null,
      note: goal?.note || goal?.notes || '',
    };
  });
}

function normalizeFocus(data) {
  if (!data) return null;
  return {
    weekStart: data.weekStart || data.week_start || null,
    weekFrequency: data.weekFrequency || data.week_frequency || null,
    focusArea: data.focusArea || data.focus_area || null,
    customTitle: data.customTitle || data.custom_title || '',
    whyMatters: data.whyMatters || data.why_matters || '',
    reflection: data.reflection || '',
    nextSteps: data.nextSteps || data.next_steps || '',
    goals: normalizeGoals(data.goals || []),
    days: Array.isArray(data.days) ? data.days : null,
    updated_at: data.updated_at || data.savedAt || data.saved_at || null,
  };
}

function focusPath(groupId) {
  return `${FOCUS_PREFIX}/${groupId}.json`;
}

export async function loadFocusForCurrentUser() {
  const session = getSessionFromStorage();
  const userId = session?.user?.id || null;
  const groupId = await ensureGroupId(userId);
  if (!groupId) return { focus: null, groupId: null };
  const focus = await fetchFocusByGroup(groupId);
  return { focus, groupId };
}

export async function fetchFocusByGroup(groupId) {
  if (!groupId) return null;
  try {
    const data = await downloadJsonFromBucket(SHARED_BUCKET, focusPath(groupId));
    return normalizeFocus(data);
  } catch (error) {
    console.warn('[focus-data] fetchFocusByGroup failed', error);
    return null;
  }
}

export async function saveFocusForGroup(groupId, payload) {
  if (!groupId) throw new Error('Missing group id');
  const normalized = normalizeFocus({
    ...payload,
    updated_at: new Date().toISOString(),
  });
  await uploadJsonToBucket(SHARED_BUCKET, focusPath(groupId), normalized);
  return normalized;
}

export function withGoalIds(goals = []) {
  return normalizeGoals(goals);
}

export function readLocalFocusDraft() {
  try {
    const raw = localStorage.getItem(LOCAL_FOCUS_KEY);
    if (!raw) return null;
    return normalizeFocus(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalFocusDraft(payload) {
  try {
    localStorage.setItem(LOCAL_FOCUS_KEY, JSON.stringify(payload || {}));
  } catch (error) {
    console.warn('[focus-data] unable to cache local focus draft', error);
  }
}

export function clearLocalFocusDraft() {
  try {
    localStorage.removeItem(LOCAL_FOCUS_KEY);
  } catch {}
}
