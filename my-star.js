import { getSessionFromStorage, rest } from './restClient.js'
import { resolveActiveGroup } from './active-group.js'
import { loadSignedInRole } from './signed-in-role.js'

const moodForm = document.getElementById('moodForm')
const choices = document.getElementById('moodChoices')
const save = document.getElementById('saveMood')
const status = document.getElementById('saveStatus')
const readAloud = document.getElementById('readAloud')
const loadStatus = document.getElementById('loadStatus')
const userId = getSessionFromStorage()?.user?.id

async function openMyStar() {
  if (!userId) {
    location.replace('/auth.html')
    return
  }
  if (await loadSignedInRole() !== 'individual') {
    loadStatus.textContent = 'My STAR needs an Individual account.'
    return
  }

  loadStatus.hidden = true
  if (new URLSearchParams(location.search).get('page') === 'feel') {
    document.getElementById('heading').textContent = 'This Is How I Feel'
    readAloud.hidden = !('speechSynthesis' in window)
    moodForm.hidden = false
  } else {
    let chatEnabled = true
    try {
      chatEnabled = JSON.parse(localStorage.getItem('star_app_config'))?.appFeatures?.chat !== false
    } catch {
      // An invalid cached configuration uses the default app features.
    }
    document.getElementById('groupChat').hidden = !chatEnabled
    document.getElementById('home').hidden = false
  }
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const speech = new SpeechSynthesisUtterance(text)
  speech.rate = 0.85
  window.speechSynthesis.speak(speech)
}

let readEnabled = false
readAloud.addEventListener('click', () => {
  readEnabled = true
  speak('This is how I feel. Pick a face. Happy, okay, sad, mad, tired, or not feeling good. Choose how strong the feeling is. Tap Done to save, or Not now to skip.')
})
choices.addEventListener('change', event => {
  if (!readEnabled) return
  if (event.target.name === 'mood') speak(event.target.labels[0].textContent.trim().replace(/^\S+\s*/, ''))
  if (event.target.name === 'intensity') speak(event.target.selectedOptions[0].textContent)
})

moodForm.addEventListener('submit', async event => {
  event.preventDefault()
  if (save.disabled) return
  const data = new FormData(moodForm)
  const mood = data.get('mood')
  const intensity = Number(data.get('intensity'))
  if (!mood || !intensity) return
  save.disabled = choices.disabled = true
  status.textContent = 'Saving…'

  try {
    const { groupId } = await resolveActiveGroup(userId)
    if (!groupId) throw new Error('Join your STAR group to save a check-in.')
    const today = new Date()
    const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')
    await rest('mood_entries', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{ date, mood, intensity, notes: '', user_id: userId, group_id: groupId }]),
      expectedUserId: userId,
    })
    status.textContent = '⭐ Your check-in was saved.'
    document.getElementById('back').textContent = 'Back to My STAR'
  } catch (error) {
    console.warn('[My STAR] Could not save mood check-in', error)
    status.textContent = 'We couldn’t save your check-in. Try again.'
    save.disabled = choices.disabled = false
  }
})

openMyStar().catch(error => {
  console.warn('[My STAR] Could not load profile', error)
  loadStatus.textContent = 'My STAR couldn’t load. Refresh to try again.'
})
