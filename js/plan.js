// Builds the personal 90-day plan from the placement result and daily time budget.
// The plan is derived (never stored): same profile + content → same plan, so content
// updates flow into existing plans automatically.
import { addDays } from './util.js';
import { getState, lessonState } from './store.js';

export const DAYS = 90;
const REVIEW_EVERY = 7;

export const TIME_OPTIONS = [
  { minutes: 30, label: '30 минут', hint: 'Спокойный темп' },
  { minutes: 45, label: '45 минут', hint: 'Сбалансированно' },
  { minutes: 60, label: '1 час', hint: 'Рекомендуется' },
  { minutes: 90, label: '1,5 часа', hint: 'Интенсив' },
];

// How many lessons fit into 90 days for a given daily budget.
// ~15 min/day go to words; a lesson fully done (theory, exercises, 2× phrases) ≈ 80 min.
export function lessonsFor(minutes) {
  const workDays = DAYS - 1 - Math.floor((DAYS - 1) / REVIEW_EVERY);
  return Math.max(8, Math.floor(workDays * (minutes - 15) / 80));
}

export function endLessonFor(start, minutes) {
  return Math.min(50, start + lessonsFor(minutes) - 1);
}

export function levelOfLesson(n) {
  if (n <= 8) return 'A1.1';
  if (n <= 20) return 'A1';
  if (n <= 30) return 'A2';
  if (n <= 45) return 'B1';
  return 'B2';
}
export function levelAfter(endLesson) {
  if (endLesson >= 50) return 'B1+ / B2 (грамматика)';
  if (endLesson >= 45) return 'B1';
  if (endLesson >= 30) return 'A2 → B1';
  if (endLesson >= 20) return 'A1 (уверенно) → A2';
  if (endLesson >= 8) return 'A1';
  return 'A0 → A1';
}

const WEIGHT = { A1: 1, A2: 1.15, B1: 1.3, B2: 1.4 };

function allocate(n, slots, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => w / sum * slots);
  const out = raw.map(r => Math.max(1, Math.floor(r)));
  let left = slots - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++) { out[order[k % n][1]]++; left--; }
  for (let k = n - 1; left < 0; k = (k - 1 + n) % n) { if (out[k] > 1) { out[k]--; left++; } }
  return out;
}

function extrasQueue(C, S, E) {
  const q = [];
  const conv = C.conversation || [];
  const unlockForBlock = { 1: 18, 2: 24, 3: 30, 4: 27 };
  conv.forEach(t => q.push({
    unlock: unlockForBlock[t.block] || 20, type: 'topic', id: t.id,
    title: t.title, sub: `Разговорный курс${t.block && t.block < 4 ? ', блок ' + t.block : ''}`, href: `#/topic/${t.id}`,
  }));
  const groups = [...new Set((C.irregular || []).map(v => v.group))];
  for (let i = 0; i < groups.length; i += 2) {
    const g = groups.slice(i, i + 2);
    q.push({ unlock: 27, type: 'verbs', id: `irr-${g.join('-')}`, title: `Неправильные глаголы: группы ${g.join(' и ')}`, sub: 'Выучить 3 формы + перевод', href: `#/verbs?g=${g.join(',')}` });
  }
  const gov = C.government || [];
  for (let i = 0; i < gov.length; i += 12) {
    const a = i + 1, b = Math.min(gov.length, i + 12);
    q.push({ unlock: 38, type: 'gov', id: `gov-${a}`, title: `Управление глаголов: ${a}–${b}`, sub: 'Глагол + предлог + падеж', href: `#/government?from=${a}&to=${b}` });
  }
  // Textbook reading, following the course author's guide (Begegnungen A1 → A2 → B1).
  const books = [
    { name: 'Begegnungen A1', from: 8, to: 30 },
    { name: 'Begegnungen A2', from: 31, to: 45 },
    { name: 'Begegnungen B1', from: 46, to: 58 },
  ];
  books.forEach(b => {
    for (let k = 1; k <= 8; k++) {
      const unlock = Math.round(b.from + (b.to - b.from) * (k - 1) / 8);
      if (unlock > E + 3) continue;
      q.push({ unlock, type: 'read', id: `read-${b.name.slice(-2)}-${k}`, optional: true, title: `${b.name}: Kapitel ${k}`, sub: 'Тексты, диалоги и фонетика — читать вслух и слушать аудио; понимать смысл', href: '' });
    }
  });
  return q.sort((a, b) => a.unlock - b.unlock);
}

export function buildPlan(profile, C) {
  const S = profile.startLesson, E = profile.endLesson;
  const lessonIds = [];
  for (let i = S; i <= E; i++) lessonIds.push(i);
  const meta = id => C.lessons[id - 1] || { id, title: `Урок ${id}`, level: 'A1' };

  const days = [];
  for (let d = 1; d <= DAYS; d++) {
    const kind = d === DAYS ? 'final' : (d % REVIEW_EVERY === 0 ? 'review' : 'lesson');
    days.push({ n: d, date: addDays(profile.startDate, d - 1), kind, tasks: [], lessons: [] });
  }
  const work = days.filter(d => d.kind === 'lesson');
  const spans = allocate(lessonIds.length, work.length, lessonIds.map(id => WEIGHT[(meta(id).level || 'A1').slice(0, 2)] || 1));

  const T = {
    theory: id => ({ key: `theory-${id}`, type: 'theory', lesson: id, title: `Урок ${id}: теория`, sub: meta(id).title, href: `#/lesson/${id}/theory` }),
    ex: id => ({ key: `ex-${id}`, type: 'ex', lesson: id, title: `Урок ${id}: упражнения`, sub: 'Нужно ≥ 70% правильных', href: `#/lesson/${id}/ex` }),
    phr: (id, k) => ({ key: `phr-${id}-${k}`, type: 'phr', lesson: id, pass: k, title: k === 1 ? `Урок ${id}: фразы` : `Повтор фраз урока ${id}`, sub: k === 1 ? 'Проговорить вслух все фразы' : `Проход №${k} — быстрее и увереннее`, href: `#/drill/${id}` }),
  };

  // Lay lessons across work days.
  let w = 0;
  const lessonEndDay = {};
  lessonIds.forEach((id, i) => {
    const span = spans[i];
    const slot = work.slice(w, w + span);
    w += span;
    slot.forEach(d => d.lessons.push(id));
    if (span === 1) {
      slot[0].tasks.push(T.theory(id), T.ex(id), T.phr(id, 1));
    } else if (span === 2) {
      slot[0].tasks.push(T.theory(id), T.ex(id));
      slot[1].tasks.push(T.phr(id, 1));
    } else {
      slot[0].tasks.push(T.theory(id));
      slot[1].tasks.push(T.ex(id));
      slot[2].tasks.push(T.phr(id, 1));
      for (let k = 3; k < span; k++) {
        if (k - 1 <= 4) slot[k].tasks.push(T.phr(id, k - 1));
        else {
          // Long spans (advanced start): revisit earlier lessons instead of drilling the same phrases again.
          const back = Math.max(1, id - 1 - ((k - 5 + i) % Math.max(1, id - 1)));
          slot[k].tasks.push({ key: `lrev-${id}-${k}`, type: 'lrev', title: `Повтор урока ${back}: упражнения`, sub: meta(back).title, href: `#/lesson/${back}/ex` });
        }
      }
    }
    lessonEndDay[id] = slot[slot.length - 1].n;
  });
  // Second pass on phrases the day after a lesson ends (spaced repetition) when the span was short.
  lessonIds.forEach((id, i) => {
    if (spans[i] >= 4) return;
    const next = days[lessonEndDay[id]]; // index = day n → next day
    if (next && next.kind !== 'final') next.tasks.push(T.phr(id, 2));
  });

  // Course tests.
  (C.tests || []).forEach(t => {
    const task = { key: `test-${t.id}`, type: 'test', id: t.id, title: t.name, sub: `Контрольный тест курса (после урока ${t.afterLesson})`, href: `#/test/${t.id}` };
    if (t.afterLesson >= S && t.afterLesson <= E) {
      const after = days[lessonEndDay[t.afterLesson]] || days[DAYS - 1];
      after.tasks.unshift(task);
    } else if (t.afterLesson < S) {
      const firstReview = days[REVIEW_EVERY - 1];
      firstReview.tasks.push({ ...task, optional: true, sub: 'Проверка пройденного уровня' });
    }
  });

  // Review days.
  let prev = 0;
  days.filter(d => d.kind !== 'lesson').forEach(d => {
    const covered = [...new Set(days.slice(prev, d.n - 1).flatMap(x => x.lessons))];
    prev = d.n;
    d.lessons = covered;
    if (covered.length) d.tasks.unshift({ key: `review-${d.n}`, type: 'review', lessons: covered, title: 'Повторение недели', sub: `Смешанные упражнения: ${covered.length === 1 ? 'урок ' + covered[0] : 'уроки ' + covered[0] + '–' + covered[covered.length - 1]}`, href: `#/review/${d.n}` });
  });
  const last = days[DAYS - 1];
  last.tasks.unshift({ key: 'final-placement', type: 'final', title: 'Итоговый тест уровня', sub: 'Пройдите тест уровня ещё раз и сравните с днём 1', href: '#/placement?final=1' });

  // Extras fill light days (review days first, then days with a single task).
  const queue = extrasQueue(C, S, E);
  const used = new Set();
  const take = (maxUnlock, n) => {
    const got = [];
    for (const x of queue) {
      if (got.length >= n) break;
      if (!used.has(x.id) && x.unlock <= maxUnlock) { used.add(x.id); got.push(x); }
    }
    return got;
  };
  days.forEach(d => {
    const reached = Math.max(S - 1, ...days.slice(0, d.n).flatMap(x => x.lessons), 0);
    let room = d.kind === 'lesson' ? (d.tasks.length <= 1 ? 1 : 0) : 2;
    if (profile.minutes >= 60 && d.kind === 'lesson' && d.tasks.length <= 2) room = Math.max(room, 1);
    take(reached, room).forEach(x => d.tasks.push({ key: x.id, ...x }));
  });

  // Words every day.
  days.forEach(d => d.tasks.push({ key: `vocab-${d.n}`, type: 'vocab', title: 'Слова: карточки', sub: '10–15 минут интервального повторения', href: `#/vocab?day=${d.n}` }));
  return days;
}

export function isTaskDone(t) {
  const st = getState();
  switch (t.type) {
    case 'theory': return !!lessonState(t.lesson).theory;
    case 'ex': return lessonState(t.lesson).exBest >= 70;
    case 'phr': return lessonState(t.lesson).phr >= t.pass;
    case 'test': return !!st.tests[t.id];
    case 'topic': return !!st.topics[t.id];
    default: return !!st.done[t.key];
  }
}

export function dayStatus(d) {
  const req = d.tasks.filter(t => !t.optional);
  const n = req.filter(isTaskDone).length;
  return { done: n, total: req.length, complete: n === req.length };
}

// First not-yet-completed day: the user's real position in the plan.
export function currentDay(plan) {
  const d = plan.find(x => !dayStatus(x).complete);
  return d ? d.n : DAYS;
}

export function weekdayLabel(d) {
  if (d.kind === 'final') return 'Финал';
  if (d.kind === 'review') return 'Повтор';
  if (d.tasks.some(t => t.type === 'test' && !t.optional)) return 'Тест';
  return d.lessons.length ? 'У' + d.lessons.join(',') : '';
}
