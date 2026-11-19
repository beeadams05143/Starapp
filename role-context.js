import {requireSession,rest} from './restClient.js';
import {ensureActiveGroupId} from './active-group.js';
import {resolveRoleContext} from './role-home-model.mjs';
export async function loadRoleContext() {
  const session=await requireSession();
  return resolveRoleContext({session,ensureGroup:ensureActiveGroupId,api:(path,options={})=>rest(path,{...options,expectedUserId:session.user.id})});
}
