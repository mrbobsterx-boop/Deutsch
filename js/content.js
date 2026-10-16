// Loads course content (JSON files under content/) with an in-memory cache.

const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(path).then(r => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

export const LESSON_COUNT = 50;
const pad = n => String(n).padStart(2, '0');

export function lesson(id) { return getJSON(`content/lessons/${pad(id)}.json`); }

// Light index of all lessons (title/level/vocab) — loads every lesson once.
let indexPromise = null;
export function lessonIndex() {
  if (!indexPromise) {
    indexPromise = Promise.all(
      Array.from({ length: LESSON_COUNT }, (_, i) => lesson(i + 1).catch(() => null))
    ).then(list => list.map((l, i) => l ? l : { id: i + 1, title: `Урок ${i + 1}`, level: '', missing: true }));
  }
  return indexPromise;
}

export const placement = () => getJSON('content/placement.json');
export const tests = () => getJSON('content/extra/tests.json').catch(() => []);
export const irregular = () => getJSON('content/extra/irregular.json').catch(() => []);
export const government = () => getJSON('content/extra/government.json').catch(() => []);
export const conversation = () => getJSON('content/extra/conversation.json').catch(() => []);

export async function all() {
  const [lessons, t, irr, gov, conv] = await Promise.all([lessonIndex(), tests(), irregular(), government(), conversation()]);
  return { lessons, tests: t, irregular: irr, government: gov, conversation: conv };
}
