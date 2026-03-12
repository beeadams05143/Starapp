import { getSessionFromStorage } from './restClient.js?v=2025.01.09E';
import { downloadJsonFromBucket, uploadJsonToBucket } from './shared-storage.js?v=2025.01.09E';
import { ensureActiveGroupId, getCachedActiveGroupId } from './active-group.js?v=2026.03.12A';

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

function getFocusDraftKey() {
  const session = getSessionFromStorage();
  const userId = session?.user?.id || null;
  const groupId = getCachedActiveGroupId() || getStoredGroupId();
  if (!userId || !groupId) return null;
  return `${LOCAL_FOCUS_KEY}:${userId}:${groupId}`;
}

export async function ensureGroupId(userId) {
  const groupId = await ensureActiveGroupId(userId);
  if (groupId) setStoredGroupId(groupId);
  return groupId || null;
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
    const key = getFocusDraftKey();
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return normalizeFocus(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalFocusDraft(payload) {
  try {
    const key = getFocusDraftKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(payload || {}));
  } catch (error) {
    console.warn('[focus-data] unable to cache local focus draft', error);
  }
}

export function clearLocalFocusDraft() {
  try {
    const key = getFocusDraftKey();
    if (!key) return;
    localStorage.removeItem(key);
  } catch {}
}
