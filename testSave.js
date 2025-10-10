async function saveMood(mood) {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('mood_entries')
    .insert([{ mood: mood, date: today }])

  if (error) {
    console.error('Insert error:', error)
  } else {
    console.log('Saved mood:', data)
    loadMoods()
  }
}

async function loadMoods() {
  const { data, error } = await supabase
    .from('mood_entries')
    .select('*')
    .order('date', { ascending: false })

  const list = document.getElementById('moodList')
  list.innerHTML = ''

  if (error) {
    console.error('Fetch error:', error)
    list.innerHTML = `<li>Error loading moods</li>`
  } else {
    data.forEach(entry => {
      const item = document.createElement('li')
      item.textContent = `${entry.date}: ${entry.mood}`
      list.appendChild(item)
    })
  }
}

loadMoods()
window.saveMood = saveMood
