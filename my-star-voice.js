import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, getSessionFromStorage } from './supabaseClient.js?v=2025.01.09N';
import { uploadJsonToBucket, downloadJsonFromBucket } from './shared-storage.js?v=2025.01.09N';

const BUCKET = 'star-voice';
const SETTINGS_KEY = 'star_voice_settings_v1';
const DEFAULT_SETTINGS = {
  rate: 1.0,
  pitch: 1.0,
  autoSpeak: true,
  autoSpeakStarters: false,
  clearAfterSpeak: false,
  pinFavoritesHome: true,
  autoBuildFavorites: true
};

const STARTER_LIBRARY = [
  { id: 'core_yes', category: 'Core Words', label: 'Yes', phrase: 'Yes', emoji: '✅', sort: 10 },
  { id: 'core_no', category: 'Core Words', label: 'No', phrase: 'No', emoji: '❌', sort: 20 },
  { id: 'core_more', category: 'Core Words', label: 'More', phrase: 'More', emoji: '➕', sort: 30 },
  { id: 'core_stop', category: 'Core Words', label: 'Stop', phrase: 'Stop', emoji: '🛑', sort: 40 },
  { id: 'core_help', category: 'Core Words', label: 'Help', phrase: 'Help', emoji: '🆘', sort: 50 },
  { id: 'core_go', category: 'Core Words', label: 'Go', phrase: 'Go', emoji: '➡️', sort: 60 },
  { id: 'core_wait', category: 'Core Words', label: 'Wait', phrase: 'Wait', emoji: '✋', sort: 70 },
  { id: 'core_all_done', category: 'Core Words', label: 'All done', phrase: 'All done', emoji: '✅', sort: 80 },
  { id: 'core_open', category: 'Core Words', label: 'Open', phrase: 'Open', emoji: '🔓', sort: 90 },
  { id: 'core_close', category: 'Core Words', label: 'Close', phrase: 'Close', emoji: '🔒', sort: 100 },
  { id: 'core_in', category: 'Core Words', label: 'In', phrase: 'In', emoji: '📥', sort: 110 },
  { id: 'core_out', category: 'Core Words', label: 'Out', phrase: 'Out', emoji: '📤', sort: 120 },
  { id: 'core_up', category: 'Core Words', label: 'Up', phrase: 'Up', emoji: '⬆️', sort: 130 },
  { id: 'core_down', category: 'Core Words', label: 'Down', phrase: 'Down', emoji: '⬇️', sort: 140 },
  { id: 'core_like', category: 'Core Words', label: 'Like', phrase: 'I like that', emoji: '👍', sort: 150 },
  { id: 'core_dont_like', category: 'Core Words', label: "Don't like", phrase: "I don't like that", emoji: '👎', sort: 160 },

  { id: 'feelings_happy', category: 'Feelings', label: 'Happy', phrase: 'I feel happy', emoji: '😊', sort: 10 },
  { id: 'feelings_sad', category: 'Feelings', label: 'Sad', phrase: 'I feel sad', emoji: '😢', sort: 20 },
  { id: 'feelings_mad', category: 'Feelings', label: 'Mad', phrase: 'I feel mad', emoji: '😡', sort: 30 },
  { id: 'feelings_scared', category: 'Feelings', label: 'Scared', phrase: 'I feel scared', emoji: '😨', sort: 40 },
  { id: 'feelings_nervous', category: 'Feelings', label: 'Nervous', phrase: 'I feel nervous', emoji: '😬', sort: 50 },
  { id: 'feelings_excited', category: 'Feelings', label: 'Excited', phrase: 'I feel excited', emoji: '🤩', sort: 60 },
  { id: 'feelings_tired', category: 'Feelings', label: 'Tired', phrase: 'I feel tired', emoji: '😴', sort: 70 },
  { id: 'feelings_sick', category: 'Feelings', label: 'Sick', phrase: 'I feel sick', emoji: '🤒', sort: 80 },
  { id: 'feelings_calm', category: 'Feelings', label: 'Calm', phrase: 'I feel calm', emoji: '😌', sort: 90 },
  { id: 'feelings_hungry', category: 'Feelings', label: 'Hungry', phrase: 'I feel hungry', emoji: '🍽️', sort: 100 },
  { id: 'feelings_thirsty', category: 'Feelings', label: 'Thirsty', phrase: 'I feel thirsty', emoji: '🥤', sort: 110 },
  { id: 'feelings_hurt', category: 'Feelings', label: 'Hurts', phrase: 'I hurt', emoji: '🩹', sort: 120 },

  { id: 'food_apple', category: 'Food', label: 'Apple', phrase: 'Apple', emoji: '🍎', sort: 10 },
  { id: 'food_banana', category: 'Food', label: 'Banana', phrase: 'Banana', emoji: '🍌', sort: 20 },
  { id: 'food_sandwich', category: 'Food', label: 'Sandwich', phrase: 'Sandwich', emoji: '🥪', sort: 30 },
  { id: 'food_pizza', category: 'Food', label: 'Pizza', phrase: 'Pizza', emoji: '🍕', sort: 40 },
  { id: 'food_chicken', category: 'Food', label: 'Chicken', phrase: 'Chicken', emoji: '🍗', sort: 50 },
  { id: 'food_salad', category: 'Food', label: 'Salad', phrase: 'Salad', emoji: '🥗', sort: 60 },
  { id: 'food_spaghetti', category: 'Food', label: 'Pasta', phrase: 'Pasta', emoji: '🍝', sort: 70 },
  { id: 'food_burger', category: 'Food', label: 'Burger', phrase: 'Burger', emoji: '🍔', sort: 80 },
  { id: 'food_fries', category: 'Food', label: 'Fries', phrase: 'Fries', emoji: '🍟', sort: 90 },
  { id: 'food_rice', category: 'Food', label: 'Rice', phrase: 'Rice', emoji: '🍚', sort: 100 },
  { id: 'food_egg', category: 'Food', label: 'Egg', phrase: 'Egg', emoji: '🥚', sort: 110 },
  { id: 'food_cookie', category: 'Food', label: 'Cookie', phrase: 'Cookie', emoji: '🍪', sort: 120 },

  { id: 'drinks_water', category: 'Drinks', label: 'Water', phrase: 'Water', emoji: '💧', sort: 10 },
  { id: 'drinks_milk', category: 'Drinks', label: 'Milk', phrase: 'Milk', emoji: '🥛', sort: 20 },
  { id: 'drinks_juice', category: 'Drinks', label: 'Juice', phrase: 'Juice', emoji: '🧃', sort: 30 },
  { id: 'drinks_soda', category: 'Drinks', label: 'Soda', phrase: 'Soda', emoji: '🥤', sort: 40 },
  { id: 'drinks_tea', category: 'Drinks', label: 'Tea', phrase: 'Tea', emoji: '🍵', sort: 50 },
  { id: 'drinks_coffee', category: 'Drinks', label: 'Coffee', phrase: 'Coffee', emoji: '☕', sort: 60 },
  { id: 'drinks_smoothie', category: 'Drinks', label: 'Smoothie', phrase: 'Smoothie', emoji: '🥤', sort: 70 },
  { id: 'drinks_lemonade', category: 'Drinks', label: 'Lemonade', phrase: 'Lemonade', emoji: '🍋', sort: 80 },
  { id: 'drinks_hot_choc', category: 'Drinks', label: 'Hot cocoa', phrase: 'Hot cocoa', emoji: '🍫', sort: 90 },
  { id: 'drinks_sports', category: 'Drinks', label: 'Sports drink', phrase: 'Sports drink', emoji: '🧃', sort: 100 },
  { id: 'drinks_soup', category: 'Drinks', label: 'Soup', phrase: 'Soup', emoji: '🥣', sort: 110 },
  { id: 'drinks_ice', category: 'Drinks', label: 'Ice', phrase: 'Ice', emoji: '🧊', sort: 120 },

  { id: 'people_mom', category: 'People', label: 'Mom', phrase: 'Mom', emoji: '👩', sort: 10 },
  { id: 'people_dad', category: 'People', label: 'Dad', phrase: 'Dad', emoji: '👨', sort: 20 },
  { id: 'people_caregiver', category: 'People', label: 'Caregiver', phrase: 'Caregiver', emoji: '🧑‍⚕️', sort: 30 },
  { id: 'people_teacher', category: 'People', label: 'Teacher', phrase: 'Teacher', emoji: '👩‍🏫', sort: 40 },
  { id: 'people_friend', category: 'People', label: 'Friend', phrase: 'Friend', emoji: '🧑‍🤝‍🧑', sort: 50 },
  { id: 'people_doctor', category: 'People', label: 'Doctor', phrase: 'Doctor', emoji: '🧑‍⚕️', sort: 60 },
  { id: 'people_nurse', category: 'People', label: 'Nurse', phrase: 'Nurse', emoji: '🧑‍⚕️', sort: 70 },
  { id: 'people_brother', category: 'People', label: 'Brother', phrase: 'Brother', emoji: '👦', sort: 80 },
  { id: 'people_sister', category: 'People', label: 'Sister', phrase: 'Sister', emoji: '👧', sort: 90 },
  { id: 'people_grandma', category: 'People', label: 'Grandma', phrase: 'Grandma', emoji: '👵', sort: 100 },
  { id: 'people_grandpa', category: 'People', label: 'Grandpa', phrase: 'Grandpa', emoji: '👴', sort: 110 },
  { id: 'people_coach', category: 'People', label: 'Coach', phrase: 'Coach', emoji: '🧑‍🏫', sort: 120 },

  { id: 'places_home', category: 'Places', label: 'Home', phrase: 'Home', emoji: '🏠', sort: 10 },
  { id: 'places_school', category: 'Places', label: 'School', phrase: 'School', emoji: '🏫', sort: 20 },
  { id: 'places_work', category: 'Places', label: 'Work', phrase: 'Work', emoji: '🏢', sort: 30 },
  { id: 'places_bathroom', category: 'Places', label: 'Bathroom', phrase: 'Bathroom', emoji: '🚻', sort: 40 },
  { id: 'places_kitchen', category: 'Places', label: 'Kitchen', phrase: 'Kitchen', emoji: '🍳', sort: 50 },
  { id: 'places_living', category: 'Places', label: 'Living room', phrase: 'Living room', emoji: '🛋️', sort: 60 },
  { id: 'places_bedroom', category: 'Places', label: 'Bedroom', phrase: 'Bedroom', emoji: '🛏️', sort: 70 },
  { id: 'places_outside', category: 'Places', label: 'Outside', phrase: 'Outside', emoji: '🌳', sort: 80 },
  { id: 'places_park', category: 'Places', label: 'Park', phrase: 'Park', emoji: '🛝', sort: 90 },
  { id: 'places_store', category: 'Places', label: 'Store', phrase: 'Store', emoji: '🛒', sort: 100 },
  { id: 'places_car', category: 'Places', label: 'Car', phrase: 'Car', emoji: '🚗', sort: 110 },
  { id: 'places_playground', category: 'Places', label: 'Playground', phrase: 'Playground', emoji: '🏟️', sort: 120 },

  { id: 'actions_run', category: 'Actions', label: 'Run', phrase: 'Run', emoji: '🏃', sort: 10 },
  { id: 'actions_walk', category: 'Actions', label: 'Walk', phrase: 'Walk', emoji: '🚶', sort: 20 },
  { id: 'actions_sit', category: 'Actions', label: 'Sit', phrase: 'Sit', emoji: '🪑', sort: 30 },
  { id: 'actions_stand', category: 'Actions', label: 'Stand', phrase: 'Stand', emoji: '🧍', sort: 40 },
  { id: 'actions_jump', category: 'Actions', label: 'Jump', phrase: 'Jump', emoji: '🤸', sort: 50 },
  { id: 'actions_play', category: 'Actions', label: 'Play', phrase: 'Play', emoji: '🧸', sort: 60 },
  { id: 'actions_read', category: 'Actions', label: 'Read', phrase: 'Read', emoji: '📖', sort: 70 },
  { id: 'actions_draw', category: 'Actions', label: 'Draw', phrase: 'Draw', emoji: '🎨', sort: 80 },
  { id: 'actions_listen', category: 'Actions', label: 'Listen', phrase: 'Listen', emoji: '👂', sort: 90 },
  { id: 'actions_watch', category: 'Actions', label: 'Watch', phrase: 'Watch', emoji: '👀', sort: 100 },
  { id: 'actions_rest', category: 'Actions', label: 'Rest', phrase: 'Rest', emoji: '🛌', sort: 110 },
  { id: 'actions_breathe', category: 'Actions', label: 'Breathe', phrase: 'Breathe', emoji: '🌬️', sort: 120 },

  { id: 'questions_what', category: 'Questions', label: 'What?', phrase: 'What?', emoji: '❓', sort: 10 },
  { id: 'questions_where', category: 'Questions', label: 'Where?', phrase: 'Where?', emoji: '🧭', sort: 20 },
  { id: 'questions_when', category: 'Questions', label: 'When?', phrase: 'When?', emoji: '⏰', sort: 30 },
  { id: 'questions_who', category: 'Questions', label: 'Who?', phrase: 'Who?', emoji: '🧍‍♂️', sort: 40 },
  { id: 'questions_why', category: 'Questions', label: 'Why?', phrase: 'Why?', emoji: '💭', sort: 50 },
  { id: 'questions_how', category: 'Questions', label: 'How?', phrase: 'How?', emoji: '🛠️', sort: 60 },
  { id: 'questions_can', category: 'Questions', label: 'Can I?', phrase: 'Can I?', emoji: '🙋', sort: 70 },
  { id: 'questions_may', category: 'Questions', label: 'May I?', phrase: 'May I?', emoji: '🙏', sort: 80 },
  { id: 'questions_which', category: 'Questions', label: 'Which?', phrase: 'Which?', emoji: '☝️', sort: 90 },
  { id: 'questions_how_many', category: 'Questions', label: 'How many?', phrase: 'How many?', emoji: '🔢', sort: 100 },
  { id: 'questions_how_long', category: 'Questions', label: 'How long?', phrase: 'How long?', emoji: '⏳', sort: 110 },
  { id: 'questions_where_go', category: 'Questions', label: 'Where go?', phrase: 'Where should we go?', emoji: '🗺️', sort: 120 },

  { id: 'quick_i_want', category: 'Quick Phrases', label: 'I want', phrase: 'I want', emoji: '🙋', sort: 10 },
  { id: 'quick_i_need', category: 'Quick Phrases', label: 'I need', phrase: 'I need', emoji: '🙋‍♀️', sort: 20 },
  { id: 'quick_help', category: 'Quick Phrases', label: 'Help me', phrase: 'Help me', emoji: '🆘', sort: 30 },
  { id: 'quick_stop', category: 'Quick Phrases', label: 'Stop', phrase: 'Stop', emoji: '🛑', sort: 40 },
  { id: 'quick_more', category: 'Quick Phrases', label: 'More', phrase: 'More', emoji: '➕', sort: 50 },
  { id: 'quick_all_done', category: 'Quick Phrases', label: 'All done', phrase: 'All done', emoji: '✅', sort: 60 },
  { id: 'quick_break', category: 'Quick Phrases', label: 'I need a break', phrase: 'I need a break', emoji: '⏸️', sort: 70 },
  { id: 'quick_bathroom', category: 'Quick Phrases', label: 'Bathroom', phrase: 'I need the bathroom', emoji: '🚻', sort: 80 },
  { id: 'quick_please', category: 'Quick Phrases', label: 'Please', phrase: 'Please', emoji: '🙏', sort: 90 },
  { id: 'quick_thank_you', category: 'Quick Phrases', label: 'Thank you', phrase: 'Thank you', emoji: '💛', sort: 100 },
  { id: 'quick_wait', category: 'Quick Phrases', label: 'Wait', phrase: 'Wait', emoji: '✋', sort: 110 },
  { id: 'quick_not_sure', category: 'Quick Phrases', label: 'Not sure', phrase: 'I am not sure', emoji: '🤔', sort: 120 },

  { id: 'time_now', category: 'Time Words', label: 'Now', phrase: 'Now', emoji: '⏱️', sort: 10 },
  { id: 'time_later', category: 'Time Words', label: 'Later', phrase: 'Later', emoji: '⏰', sort: 20 },
  { id: 'time_today', category: 'Time Words', label: 'Today', phrase: 'Today', emoji: '📅', sort: 30 },
  { id: 'time_tomorrow', category: 'Time Words', label: 'Tomorrow', phrase: 'Tomorrow', emoji: '🗓️', sort: 40 },
  { id: 'time_yesterday', category: 'Time Words', label: 'Yesterday', phrase: 'Yesterday', emoji: '↩️', sort: 50 },
  { id: 'time_morning', category: 'Time Words', label: 'Morning', phrase: 'Morning', emoji: '🌅', sort: 60 },
  { id: 'time_afternoon', category: 'Time Words', label: 'Afternoon', phrase: 'Afternoon', emoji: '🌤️', sort: 70 },
  { id: 'time_evening', category: 'Time Words', label: 'Evening', phrase: 'Evening', emoji: '🌇', sort: 80 },
  { id: 'time_night', category: 'Time Words', label: 'Night', phrase: 'Night', emoji: '🌙', sort: 90 },
  { id: 'time_week', category: 'Time Words', label: 'Week', phrase: 'This week', emoji: '📆', sort: 100 },
  { id: 'time_month', category: 'Time Words', label: 'Month', phrase: 'This month', emoji: '🗓️', sort: 110 },
  { id: 'time_year', category: 'Time Words', label: 'Year', phrase: 'This year', emoji: '📅', sort: 120 }
];

const STARTER_SENTENCE_STARTERS = [
  { id: 'starter_i', label: 'I', phrase: 'I', emoji: '🧍', sort: 10 },
  { id: 'starter_i_want', label: 'I want', phrase: 'I want', emoji: '💬', sort: 20 },
  { id: 'starter_i_need', label: 'I need', phrase: 'I need', emoji: '🧩', sort: 30 },
  { id: 'starter_i_feel', label: 'I feel', phrase: 'I feel', emoji: '🙂', sort: 40 },
  { id: 'starter_please', label: 'Please', phrase: 'Please', emoji: '🙏', sort: 50 },
  { id: 'starter_help', label: 'Help me', phrase: 'Help me', emoji: '🆘', sort: 60 },
  { id: 'starter_dont_want', label: "I don't want", phrase: "I don't want", emoji: '🚫', sort: 70 },
  { id: 'starter_all_done', label: 'All done', phrase: 'All done', emoji: '✅', sort: 80 },
  { id: 'starter_bathroom', label: 'I need the bathroom', phrase: 'I need the bathroom', emoji: '🚽', sort: 90 },
  { id: 'starter_break', label: 'I need a break', phrase: 'I need a break', emoji: '⏸️', sort: 100 }
];

const session = getSessionFromStorage();
if (!session?.user?.id) {
  location.href = `/login.html?redirect=${encodeURIComponent(location.pathname)}`;
  throw new Error('Not signed in');
}
const USER_ID = session.user.id;
const DATA_PATH = `voice/${USER_ID}/my-star-voice.json`;
const FAVORITES_KEY = `star_aac_favorites_${USER_ID}`;
const USAGE_KEY = `star_aac_usage_${USER_ID}`;
const CARD_VOICE_KEY = `star_voice_card_voice_${USER_ID}`;

const editToggle = document.getElementById('editModeToggle');
const addBtn = document.getElementById('addCardBtn');
const grid = document.getElementById('voiceGrid');
const emptyEl = document.getElementById('voiceEmpty');
const tabRow = document.getElementById('categoryTabs');
const chipsEl = document.getElementById('sentenceChips');
const speakBtn = document.getElementById('speakSentence');
const backBtn = document.getElementById('backspaceSentence');
const clearBtn = document.getElementById('clearSentence');
const toast = document.getElementById('toast');
const starterRow = document.getElementById('starterRow');
const searchToggle = document.getElementById('searchToggle');
const searchInput = document.getElementById('searchInput');
const settingsToggle = document.getElementById('settingsToggle');
const settingsDrawer = document.getElementById('settingsDrawer');
const settingsOverlay = document.getElementById('settingsOverlay');
const soundToggle = document.getElementById('soundToggle');
const sentenceLine = document.getElementById('sentenceLine');
const speakBar = document.getElementById('speakSentenceBar');
const coreBar = document.getElementById('coreBar');
const quickNeeds = document.getElementById('quickNeeds');
const rateRange = document.getElementById('rateRange');
const pitchRange = document.getElementById('pitchRange');
const rateVal = document.getElementById('rateVal');
const pitchVal = document.getElementById('pitchVal');
const autoSpeakToggle = document.getElementById('autoSpeakToggle');
const autoSpeakStartersToggle = document.getElementById('autoSpeakStartersToggle');
const pinFavoritesToggle = document.getElementById('pinFavoritesToggle');
const autoBuildFavoritesToggle = document.getElementById('autoBuildFavoritesToggle');
const clearAfterToggle = document.getElementById('clearAfterToggle');

const dialog = document.getElementById('cardDialog');
const dialogTitle = document.getElementById('cardDialogTitle');
const cardForm = document.getElementById('cardForm');
const cardLabel = document.getElementById('cardLabel');
const cardCategory = document.getElementById('cardCategory');
const cardPhoto = document.getElementById('cardPhoto');
const cardSave = document.getElementById('cardSave');
const cardCancel = document.getElementById('cardCancel');

const starterDialog = document.getElementById('starterDialog');
const starterDialogTitle = document.getElementById('starterDialogTitle');
const starterForm = document.getElementById('starterForm');
const starterLabel = document.getElementById('starterLabel');
const starterPhrase = document.getElementById('starterPhrase');
const starterEmoji = document.getElementById('starterEmoji');
const starterSave = document.getElementById('starterSave');
const starterCancel = document.getElementById('starterCancel');

let items = [];
let activeTab = 'all';
let sentence = [];
let editMode = false;
let editId = null;
let settings = loadSettings();
let hiddenDefaults = new Set();
let starters = [];
let starterEditId = null;
let cardVoiceOn = true;
let favorites = new Set();
let usageCounts = {};

const baseCategories = [
  { value: 'core-words', label: 'Core Words', icon: '🧠' },
  { value: 'feelings', label: 'Feelings', icon: '🙂' },
  { value: 'food', label: 'Food', icon: '🍎' },
  { value: 'drinks', label: 'Drinks', icon: '🥤' },
  { value: 'people', label: 'People', icon: '👤' },
  { value: 'places', label: 'Places', icon: '📍' },
  { value: 'actions', label: 'Actions', icon: '⚡' },
  { value: 'questions', label: 'Questions', icon: '❓' },
  { value: 'quick-phrases', label: 'Quick Phrases', icon: '💬' },
  { value: 'time-words', label: 'Time Words', icon: '⏱' }
];

function normalizeCategory(value) {
  if (!value) return '';
  const trimmed = value.trim();
  const exact = baseCategories.find(c => c.value === trimmed);
  if (exact) return exact.value;
  if (trimmed.toLowerCase() === 'favorites') return 'favorites';
  const lower = trimmed.toLowerCase();
  const match = baseCategories.find(c => c.label.toLowerCase() === lower);
  if (match) return match.value;
  return lower.replace(/\s+/g, '-');
}

class SpeechController {
  constructor() {
    this.voice = null;
    this.voicesReady = this.loadVoices();
  }

  loadVoices() {
    return new Promise((resolve) => {
      const pick = () => {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return false;
        this.voice = this.pickVoice(voices);
        resolve();
        return true;
      };

      if (pick()) return;

      const handle = () => {
        if (pick()) {
          window.speechSynthesis.removeEventListener('voiceschanged', handle);
        }
      };
      window.speechSynthesis.addEventListener('voiceschanged', handle);
      setTimeout(() => {
        if (!this.voice) {
          pick();
          resolve();
        }
      }, 1000);
    });
  }

  pickVoice(voices) {
    const preferred = [
      'Google US English',
      'Samantha',
      'Alex',
      'Microsoft Aria',
      'Microsoft Zira'
    ];
    const english = voices.filter(v => /en/i.test(v.lang));
    const byName = english.find(v => preferred.some(p => v.name.includes(p)));
    return byName || english[0] || voices[0] || null;
  }

  async speak(text, { rate, pitch } = {}) {
    if (!text) return;
    await this.voicesReady;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (this.voice) utter.voice = this.voice;
    utter.rate = rate || 1;
    utter.pitch = pitch || 1;
    window.speechSynthesis.speak(utter);
  }
}

const speech = new SpeechController();

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return { ...DEFAULT_SETTINGS, ...(stored || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  rateRange.value = settings.rate;
  pitchRange.value = settings.pitch;
  rateVal.textContent = settings.rate.toFixed(1);
  pitchVal.textContent = settings.pitch.toFixed(1);
  autoSpeakToggle.checked = settings.autoSpeak;
  autoSpeakStartersToggle.checked = settings.autoSpeakStarters;
  if (pinFavoritesToggle) pinFavoritesToggle.checked = settings.pinFavoritesHome;
  if (autoBuildFavoritesToggle) autoBuildFavoritesToggle.checked = settings.autoBuildFavorites;
  clearAfterToggle.checked = settings.clearAfterSpeak;
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 1200);
}

function loadCardVoiceSetting() {
  try {
    const stored = localStorage.getItem(CARD_VOICE_KEY);
    cardVoiceOn = stored !== 'off';
  } catch {
    cardVoiceOn = true;
  }
  updateCardVoiceToggle();
}

function updateCardVoiceToggle() {
  if (!soundToggle) return;
  soundToggle.textContent = cardVoiceOn ? '🔊 Card voice ON' : '🔇 Card voice OFF';
}

function setCardVoiceOn(value) {
  cardVoiceOn = !!value;
  try {
    localStorage.setItem(CARD_VOICE_KEY, cardVoiceOn ? 'on' : 'off');
  } catch {}
  updateCardVoiceToggle();
}

function loadFavoritesAndUsage() {
  try {
    const storedFav = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    favorites = new Set(Array.isArray(storedFav) ? storedFav : []);
  } catch {
    favorites = new Set();
  }
  try {
    const storedUsage = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    usageCounts = storedUsage && typeof storedUsage === 'object' ? storedUsage : {};
  } catch {
    usageCounts = {};
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
}

function saveUsage() {
  localStorage.setItem(USAGE_KEY, JSON.stringify(usageCounts));
}

function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
}

function safeName(name) {
  return (name || 'photo')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80) || 'photo';
}

function slugToLabel(slug) {
  if (!slug) return '';
  return slug
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}

function truncateLabel(label) {
  if (!label) return '';
  if (label.length <= 24) return { text: label, full: '' };
  return { text: `${label.slice(0, 21)}…`, full: label };
}

function ensureCategories() {
  const set = new Set(baseCategories.map(c => c.value));
  items.forEach(item => {
    if (item.category) set.add(item.category);
  });
  const custom = Array.from(set)
    .filter(cat => !baseCategories.find(b => b.value === cat))
    .sort();
  const all = baseCategories.concat(custom.map(c => ({ value: c, label: slugToLabel(c) })));

  const validTabs = new Set(['all', ...all.map(c => c.value)]);
  if (!validTabs.has(activeTab)) activeTab = 'all';

  cardCategory.innerHTML = '';
  all.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.value;
    opt.textContent = cat.label;
    cardCategory.appendChild(opt);
  });

  renderTabs(['favorites', 'all', ...all.map(c => c.value)], all);
}

function renderTabs(values, catalog) {
  tabRow.innerHTML = '';
  values.forEach(value => {
    const entry = catalog.find(c => c.value === value);
    const label = value === 'all'
      ? 'All'
      : value === 'favorites'
        ? 'Favorites'
        : (entry?.label || slugToLabel(value));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', value === activeTab ? 'true' : 'false');
    if (value === 'all') {
      btn.textContent = 'All';
    } else if (value === 'favorites') {
      btn.innerHTML = `⭐ ${label}`;
    } else {
      const icon = entry?.icon || '⭐';
      btn.innerHTML = `${icon} ${label}`;
    }
    btn.addEventListener('click', () => {
      activeTab = value;
      render();
    });
    tabRow.appendChild(btn);
  });
}

function renderSentence() {
  chipsEl.innerHTML = '';
  const lineText = sentence.map(item => item.text).join(' ');
  if (sentenceLine) {
    sentenceLine.innerHTML = lineText
      ? `Built sentence: <span>${lineText}</span>`
      : 'Built sentence: <span>Tap cards below to build a sentence.</span>';
    sentenceLine.classList.add('is-flash');
    clearTimeout(sentenceLine._t);
    sentenceLine._t = setTimeout(() => sentenceLine.classList.remove('is-flash'), 180);
  }
  if (!sentence.length) {
    const hint = document.createElement('span');
    hint.className = 'empty';
    hint.textContent = 'Tap a card to build a sentence.';
    chipsEl.appendChild(hint);
    return;
  }
  sentence.forEach((item, idx) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    if (item.emoji) {
      const emoji = document.createElement('span');
      emoji.className = 'emoji';
      emoji.textContent = item.emoji;
      chip.appendChild(emoji);
    }
    const text = document.createElement('span');
    text.textContent = item.text;
    chip.appendChild(text);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.setAttribute('aria-label', `Remove ${item.text}`);
    remove.textContent = '×';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      sentence.splice(idx, 1);
      renderSentence();
    });
    chip.appendChild(remove);
    chip.addEventListener('click', () => {
      speech.speak(item.phrase || item.text, settings);
    });
    chipsEl.appendChild(chip);
  });
  const strip = chipsEl?.parentElement;
  if (strip) strip.scrollLeft = strip.scrollWidth;
  sentenceLine?.scrollIntoView({ block: 'nearest' });
}

function renderStarters() {
  starterRow.innerHTML = '';
  const label = document.createElement('span');
  label.className = 'starter-label';
  label.textContent = 'Sentence starters:';
  starterRow.appendChild(label);

  const ordered = [...starters].sort((a, b) => (a.sort || 999) - (b.sort || 999));
  ordered.forEach((starter) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'starter-btn';
    btn.innerHTML = `<span class="emoji">${starter.emoji || '💬'}</span><span>${starter.label}</span>`;
    btn.addEventListener('click', () => {
      handleCardTap(
        { text: starter.label, emoji: starter.emoji, phrase: starter.phrase || starter.label },
        { allowSpeak: settings.autoSpeakStarters }
      );
    });
    btn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        btn.click();
      }
    });
    starterRow.appendChild(btn);

    if (editMode) {
      const actions = document.createElement('span');
      actions.className = 'starter-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.setAttribute('aria-label', `Edit starter ${starter.label}`);
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', () => openStarterDialog(starter));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.setAttribute('aria-label', `Delete starter ${starter.label}`);
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', () => deleteStarter(starter.id));
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      starterRow.appendChild(actions);
    }
  });

  if (editMode) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'starter-btn secondary';
    addBtn.innerHTML = '<span class=\"emoji\">＋</span><span>Add starter</span>';
    addBtn.addEventListener('click', () => openStarterDialog());
    starterRow.appendChild(addBtn);
  }
}

function handleCardTap(entry, { allowSpeak = true } = {}) {
  const payload = {
    text: entry.text,
    emoji: entry.emoji || '',
    phrase: entry.phrase || entry.text
  };
  if (entry.id) {
    usageCounts[entry.id] = (usageCounts[entry.id] || 0) + 1;
    saveUsage();
  }
  if (allowSpeak && settings.autoSpeak && cardVoiceOn) {
    speech.speak(payload.phrase, settings);
  }
  sentence.push(payload);
  renderSentence();
}

function loadStarters() {
  try {
    const stored = JSON.parse(localStorage.getItem('star_voice_starters_v1'));
    starters = Array.isArray(stored) && stored.length ? stored : STARTER_SENTENCE_STARTERS.slice();
  } catch {
    starters = STARTER_SENTENCE_STARTERS.slice();
  }
}

function saveStarters() {
  localStorage.setItem('star_voice_starters_v1', JSON.stringify(starters));
}

function openStarterDialog(starter = null) {
  starterEditId = starter?.id || null;
  starterDialogTitle.textContent = starterEditId ? 'Edit Starter' : 'Add Starter';
  starterForm.reset();
  starterLabel.value = starter?.label || '';
  starterPhrase.value = starter?.phrase || '';
  starterEmoji.value = starter?.emoji || '';
  starterDialog?.showModal();
}

function closeStarterDialog() {
  starterDialog?.close();
  starterEditId = null;
  starterForm.reset();
}

function deleteStarter(id) {
  starters = starters.filter(s => s.id !== id);
  saveStarters();
  renderStarters();
}

function createCard(item, { showUsageBadge = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'aac-card';
  button.dataset.id = item.id;
  button.setAttribute('aria-label', item.label);

  const media = document.createElement('div');
  media.className = 'aac-media';
  if (item.imageUrl) {
    media.style.backgroundImage = `url("${item.imageUrl}")`;
    media.style.backgroundSize = 'cover';
    media.style.backgroundPosition = 'center';
    media.textContent = '';
  } else {
    media.textContent = item.emoji || '🖼️';
  }

  const title = document.createElement('div');
  title.className = 'aac-label';
  const { text, full } = truncateLabel(item.label);
  title.textContent = text;
  if (full) title.title = full;

  button.appendChild(media);
  button.appendChild(title);

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `fav-btn${favorites.has(item.id) ? ' is-on' : ''}`;
  favBtn.setAttribute('aria-label', favorites.has(item.id) ? 'Unfavorite' : 'Favorite');
  favBtn.textContent = favorites.has(item.id) ? '❤️' : '🤍';
  favBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(item.id);
    render();
  });
  button.appendChild(favBtn);

  if (showUsageBadge) {
    const badge = document.createElement('div');
    badge.className = 'usage-badge';
    badge.textContent = 'Most used';
    button.appendChild(badge);
  }

  if (editMode) {
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.setAttribute('aria-label', `Edit ${item.label}`);
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openDialog(item);
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.setAttribute('aria-label', `Delete ${item.label}`);
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteItem(item.id);
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    button.appendChild(actions);
  }

  let pressTimer = null;
  button.addEventListener('touchstart', () => {
    if (!title.title) return;
    pressTimer = setTimeout(() => showToast(title.title), 450);
  });
  button.addEventListener('touchend', () => clearTimeout(pressTimer));
  button.addEventListener('touchmove', () => clearTimeout(pressTimer));

  button.addEventListener('click', () => {
    handleCardTap({ id: item.id, text: item.label, emoji: item.emoji, phrase: item.phrase || item.label }, { allowSpeak: true });
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      button.click();
    }
  });

  return button;
}

function buildFavoritesBoard() {
  const list = [];
  const seen = new Set();
  const usageBadgeIds = new Set();

  const favoritesItems = items.filter(item => favorites.has(item.id));
  favoritesItems.forEach(item => {
    if (seen.has(item.id)) return;
    list.push(item);
    seen.add(item.id);
  });

  const usageSorted = Object.entries(usageCounts)
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, 20);

  if (settings.autoBuildFavorites) {
    usageSorted.forEach(id => {
      if (seen.has(id)) return;
      const item = items.find(entry => entry.id === id);
      if (!item) return;
      list.push(item);
      seen.add(id);
      usageBadgeIds.add(id);
    });
  }

  return { list, usageBadgeIds };
}

function render() {
  ensureCategories();
  renderStarters();
  grid.innerHTML = '';
  grid.classList.toggle('favorites-mobile', activeTab === 'favorites' && window.innerWidth < 600);
  const term = (searchInput?.value || '').trim().toLowerCase();
  let filtered = [];
  let usageBadgeIds = new Set();

  if (activeTab === 'favorites') {
    const board = buildFavoritesBoard();
    filtered = board.list;
    usageBadgeIds = board.usageBadgeIds;
  } else {
    filtered = items.filter(item => {
      const matchesTab = activeTab === 'all' || item.category === activeTab;
      const matchesSearch = !term || item.label.toLowerCase().includes(term);
      return matchesTab && matchesSearch;
    });
  }

  let listToRender = activeTab === 'favorites'
    ? filtered
    : filtered.sort((a, b) => {
        const aSort = Number.isFinite(a.sort) ? a.sort : 9999;
        const bSort = Number.isFinite(b.sort) ? b.sort : 9999;
        if (aSort !== bSort) return aSort - bSort;
        return a.label.localeCompare(b.label);
      });

  if (activeTab === 'favorites' && window.innerWidth < 600) {
    listToRender = listToRender.slice(0, 8);
  }

  listToRender.forEach(item => grid.appendChild(createCard(item, { showUsageBadge: usageBadgeIds.has(item.id) })));
  if (activeTab === 'favorites' && !filtered.length) {
    emptyEl.textContent = 'Tap the ♥ on cards to add them to Favorites.';
  } else {
    emptyEl.textContent = 'No cards yet. Turn on Edit Mode to add one.';
  }
  emptyEl.style.display = filtered.length ? 'none' : '';
  renderSentence();
}

function openDialog(item = null) {
  editId = item?.id || null;
  dialogTitle.textContent = editId ? 'Edit Card' : 'Add Card';
  cardForm.reset();
  cardLabel.value = item?.label || '';
  if (item?.category) cardCategory.value = item.category;
  if (dialog?.showModal) dialog.showModal();
}

function closeDialog() {
  dialog?.close();
  editId = null;
  cardForm.reset();
}

async function saveItems() {
  const payload = { updatedAt: new Date().toISOString(), items, hiddenDefaults: Array.from(hiddenDefaults) };
  await uploadJsonToBucket(BUCKET, DATA_PATH, payload, { upsert: true });
}

async function deleteStorageObject(path) {
  if (!path) return;
  const token = session?.access_token;
  if (!token) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || 'Delete failed');
  }
}

async function deleteItem(id) {
  const idx = items.findIndex(item => item.id === id);
  if (idx === -1) return;
  const [removed] = items.splice(idx, 1);
  if (removed?.isDefault) {
    hiddenDefaults.add(removed.id);
  }
  try {
    await deleteStorageObject(removed.imagePath);
  } catch (err) {
    console.warn('Image delete failed', err?.message || err);
  }
  await saveItems();
  render();
}

function seedDefaults(existing = []) {
  const byId = new Map(existing.map(item => [item.id, item]));
  STARTER_LIBRARY.forEach(entry => {
    const slug = normalizeCategory(entry.category);
    const id = entry.id || `lib_${slug}_${entry.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    if (hiddenDefaults.has(id)) return;
    const existingItem = byId.get(id);
    if (existingItem) {
      if (!existingItem.imageUrl) existingItem.imageUrl = buildEmojiTile(entry.emoji, slug);
      existingItem.emoji = entry.emoji;
      existingItem.phrase = entry.phrase || existingItem.label;
      existingItem.category = slug;
      existingItem.sort = entry.sort;
      existingItem.isDefault = true;
      byId.set(id, existingItem);
      return;
    }
    byId.set(id, {
      id,
      label: entry.label,
      phrase: entry.phrase || entry.label,
      emoji: entry.emoji,
      category: slug,
      imageUrl: buildEmojiTile(entry.emoji, slug),
      imagePath: '',
      sort: entry.sort,
      isDefault: true,
      createdAt: new Date().toISOString()
    });
  });
  items = Array.from(byId.values());
}

function buildEmojiTile(emoji, category) {
  const bgMap = {
    'quick-phrases': '#fff7ed',
    'core-words': '#eff6ff',
    'feelings': '#fef3c7',
    'places': '#ecfccb',
    'people': '#f3e8ff',
    'actions': '#ffe4e6',
    'questions': '#e0f2fe',
    'food': '#fef2f2',
    'drinks': '#ecfeff',
    'time-words': '#ede9fe'
  };
  const bg = bgMap[category] || '#f8fafc';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
      <rect width="100%" height="100%" rx="24" ry="24" fill="${bg}"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-size="96">${emoji}</text>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

async function loadItems() {
  try {
    const data = await downloadJsonFromBucket(BUCKET, DATA_PATH);
    hiddenDefaults = new Set(Array.isArray(data?.hiddenDefaults) ? data.hiddenDefaults : []);
    items = Array.isArray(data?.items) ? data.items : [];
    items = items.map(item => ({
      ...item,
      category: normalizeCategory(item.category),
      phrase: item.phrase || item.label
    }));
    seedDefaults(items);
    await saveItems();
  } catch (err) {
    console.warn('Load failed', err?.message || err);
    hiddenDefaults = new Set();
    seedDefaults();
  }
  render();
}

function toggleSettings(show) {
  const shouldShow = typeof show === 'boolean' ? show : !settingsDrawer.classList.contains('is-active');
  settingsDrawer.classList.toggle('is-active', shouldShow);
  settingsOverlay.classList.toggle('is-active', shouldShow);
}

speakBtn?.addEventListener('click', () => {
  const text = sentence.map(item => item.text).join(' ');
  if (text) speech.speak(text, settings);
  if (settings.clearAfterSpeak) {
    sentence = [];
    renderSentence();
  }
});
speakBar?.addEventListener('click', () => speakBtn?.click());
backBtn?.addEventListener('click', () => {
  sentence.pop();
  renderSentence();
});
clearBtn?.addEventListener('click', () => {
  sentence = [];
  renderSentence();
});

editToggle?.addEventListener('change', () => {
  editMode = !!editToggle.checked;
  addBtn.classList.toggle('is-hidden', !editMode);
  render();
  renderStarters();
});

addBtn?.addEventListener('click', () => openDialog());
cardCancel?.addEventListener('click', () => closeDialog());
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog();
});

cardForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = (cardLabel.value || '').trim();
  const category = cardCategory.value || 'food';
  if (!label) return;
  const file = cardPhoto?.files?.[0] || null;

  cardSave.disabled = true;
  try {
    let imageUrl = '';
    let imagePath = '';
    if (editId) {
      const existing = items.find(item => item.id === editId);
      imageUrl = existing?.imageUrl || '';
      imagePath = existing?.imagePath || '';
    }

    if (file) {
      const unique = (typeof crypto?.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
      const path = `${USER_ID}/${category}/${unique}_${safeName(file.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || 'image/jpeg'
      });
      if (error) throw new Error(error.message || 'Upload failed');
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      imageUrl = data?.publicUrl || '';
      imagePath = path;
    }

    if (editId) {
      const idx = items.findIndex(item => item.id === editId);
      if (idx !== -1) {
        items[idx] = {
          ...items[idx],
          label,
          category,
          imageUrl: imageUrl || items[idx].imageUrl,
          imagePath: imagePath || items[idx].imagePath,
          updatedAt: new Date().toISOString()
        };
      }
    } else {
      const id = (typeof crypto?.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
      items.unshift({
        id,
        label,
        category,
        imageUrl,
        imagePath,
        createdAt: new Date().toISOString()
      });
    }

    await saveItems();
    closeDialog();
    render();
    showToast('Saved!');
  } catch (err) {
    console.error('Save failed', err);
    showToast(err?.message || 'Save failed');
  } finally {
    cardSave.disabled = false;
  }
});

searchToggle?.addEventListener('click', () => {
  searchInput.classList.toggle('is-active');
  if (searchInput.classList.contains('is-active')) {
    searchInput.focus();
  } else {
    searchInput.value = '';
    render();
  }
});
searchInput?.addEventListener('input', () => render());

settingsToggle?.addEventListener('click', () => toggleSettings());
settingsOverlay?.addEventListener('click', () => toggleSettings(false));

soundToggle?.addEventListener('click', () => setCardVoiceOn(!cardVoiceOn));

coreBar?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-core]');
  if (!btn) return;
  const key = btn.dataset.core;
  if (key === 'i') {
    handleCardTap({ text: 'I', emoji: '🧍', phrase: 'I' }, { allowSpeak: false });
  }
  if (key === 'want') {
    handleCardTap({ text: 'want', emoji: '💬', phrase: 'want' }, { allowSpeak: false });
    activeTab = 'favorites';
    render();
  }
  if (key === 'dont_want') {
    handleCardTap({ text: "don't want", emoji: '🚫', phrase: "don't want" }, { allowSpeak: false });
    activeTab = 'favorites';
    render();
  }
  if (key === 'feel') {
    handleCardTap({ text: 'feel', emoji: '🙂', phrase: 'feel' }, { allowSpeak: false });
    activeTab = 'feelings';
    render();
  }
});

quickNeeds?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-quick]');
  if (!btn) return;
  const key = btn.dataset.quick;
  const map = {
    bathroom: { text: 'I need the bathroom', emoji: '🚽', phrase: 'I need the bathroom' },
    help: { text: 'I need help', emoji: '🆘', phrase: 'I need help' },
    break: { text: 'I need a break', emoji: '⏸', phrase: 'I need a break' }
  };
  const entry = map[key];
  if (!entry) return;
  speech.speak(entry.phrase, settings);
  sentence.push({ text: entry.text, emoji: entry.emoji, phrase: entry.phrase });
  renderSentence();
});

rateRange?.addEventListener('input', () => {
  settings.rate = Number(rateRange.value);
  saveSettings();
});

pitchRange?.addEventListener('input', () => {
  settings.pitch = Number(pitchRange.value);
  saveSettings();
});

autoSpeakToggle?.addEventListener('change', () => {
  settings.autoSpeak = autoSpeakToggle.checked;
  saveSettings();
});

autoSpeakStartersToggle?.addEventListener('change', () => {
  settings.autoSpeakStarters = autoSpeakStartersToggle.checked;
  saveSettings();
});

pinFavoritesToggle?.addEventListener('change', () => {
  settings.pinFavoritesHome = pinFavoritesToggle.checked;
  saveSettings();
});

autoBuildFavoritesToggle?.addEventListener('change', () => {
  settings.autoBuildFavorites = autoBuildFavoritesToggle.checked;
  saveSettings();
  render();
});

clearAfterToggle?.addEventListener('change', () => {
  settings.clearAfterSpeak = clearAfterToggle.checked;
  saveSettings();
});

starterCancel?.addEventListener('click', () => closeStarterDialog());
starterDialog?.addEventListener('click', (event) => {
  if (event.target === starterDialog) closeStarterDialog();
});

starterForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const label = (starterLabel.value || '').trim();
  const phrase = (starterPhrase.value || '').trim();
  const emoji = (starterEmoji.value || '').trim() || '💬';
  if (!label || !phrase) return;
  if (starterEditId) {
    const idx = starters.findIndex(s => s.id === starterEditId);
    if (idx !== -1) {
      starters[idx] = { ...starters[idx], label, phrase, emoji };
    }
  } else {
    const id = `starter_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
    const sort = Math.max(0, ...starters.map(s => s.sort || 0)) + 10;
    starters.push({ id, label, phrase, emoji, sort });
  }
  saveStarters();
  closeStarterDialog();
  renderStarters();
});

saveSettings();
loadCardVoiceSetting();
loadFavoritesAndUsage();
loadStarters();
activeTab = window.innerWidth < 600 ? 'favorites' : (settings.pinFavoritesHome ? 'favorites' : 'all');
await loadItems();
