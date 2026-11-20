import { getSessionFromStorage, rest } from './restClient.js'
import { loadRoleContext } from './role-context.js'

let currentLookup

export function loadSignedInRole() {
  const userId = getSessionFromStorage()?.user?.id
  if (!userId) return Promise.resolve(null)
  if (currentLookup?.userId === userId) return currentLookup.result

  const result = loadRoleContext().then(context => context.role || rest(`profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`, {
    expectedUserId: userId,
  }).then(rows => {
    if (getSessionFromStorage()?.user?.id !== userId) return null
    return String(rows?.[0]?.role || '').trim().toLowerCase() || null
  })).then(role => {
    return getSessionFromStorage()?.user?.id === userId ? role : null
  }).catch(error => {
    if (currentLookup?.result === result) currentLookup = undefined
    throw error
  })
  currentLookup = { userId, result }
  return result
}
