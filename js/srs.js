// Leitner-style spaced repetition for vocabulary.
import { getState, save, touch } from './store.js';
import { todayISO, addDays } from './util.js';

const INTERVALS = [0, 1, 3, 7, 14, 30, 60];

export function newPerDay(minutes) {
  return minutes >= 90 ? 15 : minutes >= 60 ? 12 : minutes >= 45 ? 10 : 8;
}

// Words become available once the lesson's theory has been opened.
export function syncPool(lessons) {
  const st = getState();
  let added = 0;
  lessons.forEach(l => {
    if (!l || l.missing) return;
    const ls = st.lessons[l.id];
    if (!ls || !ls.theory) return;
    (l.vocab || []).forEach(v => {
      if (!v.de || st.srs[v.de]) return;
      st.srs[v.de] = { ru: v.ru, pl: v.pl || '', forms: v.forms || '', lesson: l.id, box: -1, due: null, reps: 0, lapses: 0 };
      added++;
    });
  });
  if (added) save();
  return added;
}

export function stats() {
  const st = getState(), today = todayISO();
  const cards = Object.values(st.srs);
  return {
    total: cards.length,
    learned: cards.filter(c => c.box >= 3).length,
    fresh: cards.filter(c => c.box < 0).length,
    due: cards.filter(c => c.box >= 0 && c.due <= today).length,
    newToday: cards.filter(c => c.introduced === today).length,
  };
}

export function session(minutes) {
  const st = getState(), today = todayISO();
  const entries = Object.entries(st.srs);
  const due = entries.filter(([, c]) => c.box >= 0 && c.due <= today).sort((a, b) => a[1].box - b[1].box).slice(0, 60);
  const introducedToday = entries.filter(([, c]) => c.introduced === today).length;
  const quota = Math.max(0, newPerDay(minutes) - introducedToday);
  const fresh = entries.filter(([, c]) => c.box < 0).sort((a, b) => a[1].lesson - b[1].lesson).slice(0, quota);
  return [...due, ...fresh].map(([de, c]) => ({ de, ...c }));
}

// grade: 0 = не помню, 1 = с трудом, 2 = помню
export function grade(de, g) {
  const st = getState(), c = st.srs[de], today = todayISO();
  if (!c) return;
  if (c.box < 0) c.introduced = today;
  c.reps++;
  if (g === 0) { c.box = 0; c.lapses++; }
  else if (g === 1) { c.box = Math.max(1, c.box); }
  else { c.box = Math.min(INTERVALS.length - 1, Math.max(0, c.box) + 1); }
  c.due = addDays(today, INTERVALS[c.box]);
  touch();
}
