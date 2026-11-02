// Single-user progress, kept in localStorage. Export/import as JSON for backups
// or moving to another device.
import { todayISO } from './util.js';

const KEY = 'dk90-state';

const blank = () => ({
  v: 1,
  profile: null,          // {startDate, minutes, startLesson, endLesson, level, placement, createdAt}
  done: {},               // manual / daily task completion: {taskKey: isoDate}
  lessons: {},            // {id: {theory, exBest, exTries, phr, mistakes:[idx]}}
  srs: {},                // {de: {ru, lesson, box, due, reps, lapses}}
  tests: {},              // {id: {score, total, at}}
  topics: {},             // conversation topics: {id: isoDate}
  activity: {},           // {isoDate: count}
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(blank(), JSON.parse(raw));
  } catch (e) { /* storage blocked or corrupt — start fresh */ }
  return blank();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  paulPost();
}

// Paul (плагин Chrome) показывает приложение в своём левом меню (?paul). Память браузера там своя у каждого сайта,
// поэтому прогресс держит Paul: при запуске присылает свою копию, каждое сохранение уходит ему. Вне Paul — как обычно.
const PAUL = new URLSearchParams(location.search).has('paul') && window.parent !== window;
function paulPost() { if (PAUL) window.parent.postMessage({ type: 'dk90:save', state }, '*'); }
if (PAUL) {
  window.addEventListener('message', e => {
    if (e.source !== window.parent || !e.data) return;
    if (e.data.type === 'dk90:state') {
      if (e.data.state && typeof e.data.state === 'object') {
        state = Object.assign(blank(), e.data.state);
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* ignore */ }
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } else paulPost();                         // у Paul копии ещё нет — отдать свою
    }
    if (e.data.type === 'dk90:go' && /^#\/[\w/-]*$/.test(e.data.hash || '')) location.hash = e.data.hash;
  });
  window.parent.postMessage({ type: 'dk90:hello' }, '*');
}

export function getState() { return state; }

export function touch() {
  const d = todayISO();
  state.activity[d] = (state.activity[d] || 0) + 1;
  save();
}

export function lessonState(id) {
  return state.lessons[id] || (state.lessons[id] = { theory: false, exBest: 0, exTries: 0, phr: 0, mistakes: [] });
}

export function setDone(key, val = true) {
  if (val) state.done[key] = todayISO(); else delete state.done[key];
  touch();
}

export function resetAll() {
  state = blank();
  save();
}

export function exportJSON() {
  return JSON.stringify(state, null, 1);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('profile' in data)) throw new Error('Неверный файл');
  state = Object.assign(blank(), data);
  save();
}

export function streak() {
  let n = 0;
  let d = new Date();
  // Today not yet active doesn't break the streak.
  if (!state.activity[todayISO(d)]) d.setDate(d.getDate() - 1);
  while (state.activity[todayISO(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
