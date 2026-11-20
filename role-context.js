import { requireSession, rest } from './restClient.js';
import { resolveActiveGroup } from './active-group.js';
import { resolveRoleContext } from './role-home-model.mjs';

export async function loadRoleContext() {
  const session = await requireSession();
  const { groupId, groupName } = await resolveActiveGroup(session.user.id);
  const context = await resolveRoleContext({
    session,
    ensureGroup: () => groupId,
    api: (path, options = {}) => rest(path, { ...options, expectedUserId: session.user.id }),
  });
  return { ...context, groupName };
}
