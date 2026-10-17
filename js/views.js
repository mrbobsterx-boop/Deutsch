import { esc, safeHtml, toast, shuffle, todayISO, diffDays, fmtDate, plural, speak, speakBtn, artHtml, ICONS, checkAnswer, APP_VERSION } from './util.js';
import { getState, save, touch, lessonState, setDone, resetAll, exportJSON, importJSON, streak } from './store.js';
import * as content from './content.js';
import { buildPlan, isTaskDone, dayStatus, currentDay, TIME_OPTIONS, endLessonFor, levelAfter, levelOfLesson, weekdayLabel, DAYS } from './plan.js';
import { runQuiz } from './quiz.js';
import * as srs from './srs.js';

const app = () => document.getElementById('app');
const go = h => { location.hash = h; };

let C = null; // all content
let PLAN = null;
export async function ensureContent() {
  if (!C) C = await content.all();
  return C;
}
export function plan() {
  const p = getState().profile;
  if (!p) return null;
  if (!PLAN || PLAN._sig !== JSON.stringify(p)) { PLAN = buildPlan(p, C); PLAN._sig = JSON.stringify(p); }
  return PLAN;
}
function resetPlanCache() { PLAN = null; }

const TASK_ICON = { theory: ['t-theory', ICONS.book], ex: ['t-ex', ICONS.pen], phr: ['t-phr', ICONS.chat], vocab: ['t-vocab', ICONS.cards], test: ['t-test', ICONS.flag], final: ['t-test', ICONS.flag], review: ['t-phr', ICONS.repeat], lrev: ['t-ex', ICONS.repeat], topic: ['t-theory', ICONS.chat], verbs: ['t-ex', ICONS.verb], gov: ['t-ex', ICONS.verb], read: ['', ICONS.read] };

function taskHtml(t, dayN) {
  const done = isTaskDone(t);
  const [cls, ico] = TASK_ICON[t.type] || ['', ICONS.book];
  const manual = ['read', 'verbs', 'gov', 'review', 'vocab', 'final', 'lrev'].includes(t.type);
  const href = t.href ? (t.href + (t.href.includes('?') ? '&' : '?') + 'day=' + dayN) : '';
  return `<div class="task ${done ? 'done' : ''} ${t.optional ? 'optional' : ''}" data-task="${esc(t.key)}">
    <a class="ico ${cls}" ${href ? `href="${esc(href)}"` : ''}>${ico}</a>
    <a class="task-body" ${href ? `href="${esc(href)}"` : ''} style="text-decoration:none">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-sub">${esc(t.sub || '')}</div>
    </a>
    ${manual ? `<button class="check" data-toggle="${esc(t.key)}" aria-label="Отметить">${ICONS.check}</button>` : `<span class="check" aria-hidden="true">${ICONS.check}</span>`}
  </div>`;
}
function bindTaskToggles(root, rerender) {
  root.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    setDone(k, !getState().done[k]);
    rerender();
  }));
}

function backLink(href, label) {
  return `<a class="back-link" href="${href}">${ICONS.back}${esc(label)}</a>`;
}
function bindSpeak(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-speak]');
    if (b) { e.preventDefault(); speak(b.dataset.speak); }
  });
}
const qs = () => new URLSearchParams(location.hash.split('?')[1] || '');

/* ================= Welcome & placement ================= */

export function viewWelcome() {
  app().innerHTML = `
    <div class="hero">
      <div class="eyebrow">Deutsch · 90 дней</div>
      <h1>Немецкий шаг за шагом — каждый день по плану</h1>
      <p class="muted" style="margin-top:10px">50 уроков грамматики от нуля до B2, фразы для разговора, карточки слов, контрольные тесты курса. Всё на русском.</p>
    </div>
    <div class="card">
      <h3>Как это работает</h3>
      <ol style="padding-left:20px;margin:6px 0 0">
        <li><b>Тест уровня</b> (5–10 минут) — определим, с какого урока начать.</li>
        <li><b>Время в день</b> — от этого зависит темп и цель на 90 дней.</li>
        <li><b>Личный план</b>: каждый день — конкретные задания. Отмечаются автоматически, когда вы их выполняете.</li>
      </ol>
      <div class="note small" style="margin-top:12px">Метод курса: <b>тема → фразы вслух → перевод упражнений → проверка по ключу</b>. Заниматься нужно каждый день: 7 занятий по 30 минут лучше, чем одно на 3 часа.</div>
    </div>
    <div class="grid two">
      <a class="btn primary block" href="#/placement">Пройти тест уровня</a>
      <button class="btn block" data-zero>Я начинаю с нуля</button>
    </div>`;
  app().querySelector('[data-zero]').addEventListener('click', () => {
    getState().pendingPlacement = { startLesson: 1, level: 'A0', bandIndex: 0, score: null };
    save(); go('#/setup');
  });
}

export async function viewPlacement() {
  const P = await content.placement();
  const final = qs().get('final');
  let band = 0, qi = 0, right = 0;
  const log = [];
  const root = app();

  function finish(stopBand) {
    const passedAll = stopBand >= P.bands.length;
    const b = passedAll ? null : P.bands[stopBand];
    const startLesson = passedAll ? 46 : b.startLesson;
    const level = passedAll ? 'B1+' : b.level;
    const res = { startLesson, level, bandIndex: stopBand, at: todayISO(), log };
    const st = getState();
    if (final) {
      st.finalPlacement = res;
      setDone('final-placement');
    } else {
      st.pendingPlacement = res;
      save();
    }
    root.innerHTML = `
      <div class="hero">
        <div class="eyebrow">Результат теста</div>
        <h1>Ваш уровень: ${esc(level)}</h1>
        <p class="muted" style="margin-top:8px">${passedAll ? 'Вы уверенно справились со всеми блоками. Начнём с самых продвинутых уроков и закрепим всё на повторении.' : `Блок «${esc(b.label)}» пока даётся с трудом — значит, начинаем с урока ${startLesson}.`}</p>
      </div>
      <div class="card">
        ${P.bands.map((x, i) => {
          const r = log.filter(l => l.band === i);
          const ok = r.filter(l => l.ok).length;
          return `<div class="row" style="padding:6px 0"><span class="pill ${i < stopBand ? 'ok' : i === stopBand ? 'accent' : ''}">${esc(x.label)}</span><span class="small muted">${r.length ? ok + ' / ' + r.length : 'не проверялся'}</span><span class="spacer"></span><span class="small muted">${esc(x.describe)}</span></div>`;
        }).join('')}
      </div>
      ${final ? `<a class="btn primary block" href="#/today">К плану</a>` : `<a class="btn primary block" href="#/setup">Дальше: выбрать время на занятия</a>`}`;
  }

  function render() {
    const b = P.bands[band];
    const q = b.questions[qi];
    const total = P.bands.reduce((a, x) => a + x.questions.length, 0);
    const passed = P.bands.slice(0, band).reduce((a, x) => a + x.questions.length, 0) + qi;
    root.innerHTML = `
      ${backLink('#/', 'Назад')}
      <div class="page-head"><div class="eyebrow">Тест уровня · ${esc(b.label)}</div><h2>Вопрос ${qi + 1} из ${b.questions.length}</h2>
      <p class="small muted">${band === 0 && qi === 0 ? esc(P.intro) : esc(b.describe)}</p></div>
      <div class="progress" style="margin-bottom:14px"><i style="width:${Math.round(passed / total * 100)}%"></i></div>
      <div class="q-card">
        <div class="q-text">${esc(q.q)}</div>
        <div class="options">${q.options.map((o, k) => `<button class="option" data-k="${k}">${esc(o)}</button>`).join('')}
          <button class="option" data-k="-1" style="color:var(--muted)">Не знаю</button></div>
      </div>`;
    root.querySelectorAll('.option').forEach(btn => btn.addEventListener('click', () => {
      const k = Number(btn.dataset.k);
      const ok = k === q.answer;
      log.push({ band, q: qi, ok });
      if (ok) right++;
      qi++;
      if (qi >= b.questions.length) {
        if (right < 4) return finish(band);
        band++; qi = 0; right = 0;
        if (band >= P.bands.length) return finish(band);
      }
      render();
    }));
  }
  render();
}

export async function viewSetup() {
  await ensureContent();
  const st = getState();
  const pp = st.pendingPlacement || st.profile?.placement || { startLesson: 1, level: 'A0' };
  let minutes = st.profile?.minutes || 60;
  let start = pp.startLesson;
  let startDate = todayISO();
  const root = app();
  function render() {
    const end = endLessonFor(start, minutes);
    root.innerHTML = `
      ${backLink(st.profile ? '#/more' : '#/', 'Назад')}
      <div class="page-head"><div class="eyebrow">Настройка плана</div><h2>Сколько времени в день вы готовы заниматься?</h2></div>
      <div class="choice-cards">${TIME_OPTIONS.map(o => `<button class="choice-card ${o.minutes === minutes ? 'active' : ''}" data-min="${o.minutes}"><b>${o.label}</b><span>${o.hint}</span></button>`).join('')}</div>
      <div class="card" style="margin-top:16px">
        <div class="row"><b>Начинаем с урока</b><span class="spacer"></span>
          <button class="icon-btn" data-step="-1" aria-label="Раньше">−</button><b style="min-width:36px;text-align:center;font-size:20px">${start}</b><button class="icon-btn" data-step="1" aria-label="Позже">+</button></div>
        <p class="small muted" style="margin-top:6px">${esc(C.lessons[start - 1]?.title || '')} · по тесту: урок ${pp.startLesson} (${esc(pp.level)})</p>
        <div class="row" style="margin-top:10px"><b>Дата старта</b><span class="spacer"></span><input type="date" value="${startDate}" data-date class="search" style="width:auto;margin:0"></div>
      </div>
      <div class="callout">
        <b>Ваша цель на 90 дней:</b> уроки ${start}–${end} (${end - start + 1} ${plural(end - start + 1, 'урок', 'урока', 'уроков')}) → уровень <b>${esc(levelAfter(end))}</b>.
        ${end < 50 ? `<br><span class="small">Чтобы пройти весь курс до урока 50, нужно ${minutes < 90 ? 'больше времени в день' : 'продолжить после 90 дней'}. Это нормально: по оценке автора курса, уверенный A1 требует 2–6 месяцев при 30 минутах в день.</span>` : ''}
      </div>
      <button class="btn primary block" data-go>${st.profile ? 'Пересоздать план' : 'Создать мой план'}</button>`;
    root.querySelectorAll('[data-min]').forEach(b => b.addEventListener('click', () => { minutes = Number(b.dataset.min); render(); }));
    root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { start = Math.min(50, Math.max(1, start + Number(b.dataset.step))); render(); }));
    root.querySelector('[data-date]').addEventListener('change', e => { startDate = e.target.value || todayISO(); });
    root.querySelector('[data-go]').addEventListener('click', () => {
      if (st.profile && !confirm('План будет пересоздан. Выполненные уроки и слова сохранятся. Продолжить?')) return;
      st.profile = { startDate, minutes, startLesson: start, endLesson: endLessonFor(start, minutes), level: pp.level, placement: pp, createdAt: st.profile?.createdAt || todayISO() };
      delete st.pendingPlacement;
      save(); resetPlanCache();
      toast('План готов! Начинаем 🚀');
      go('#/today');
    });
  }
  render();
}

/* ================= Today & plan ================= */

export async function viewToday() {
  await ensureContent();
  const st = getState();
  const P = plan();
  const cur = currentDay(P);
  const show = Number(qs().get('d')) || cur;
  const day = P[show - 1];
  const cal = Math.min(DAYS, Math.max(1, diffDays(st.profile.startDate, todayISO()) + 1));
  const doneDays = P.filter(d => dayStatus(d).complete).length;
  srs.syncPool(C.lessons);
  const sst = srs.stats();
  const ds = dayStatus(day);
  const behind = cal - cur;
  const root = app();
  root.innerHTML = `
    <div class="hero">
      <div class="eyebrow">${show === cur ? 'Сегодня' : 'Просмотр дня'} · ${fmtDate(day.date, true)}</div>
      <h1>День ${show} из ${DAYS}</h1>
      <p class="muted" style="margin-top:6px">${day.kind === 'review' ? 'День повторения: закрепляем неделю' : day.kind === 'final' ? 'Финальный день — подводим итоги' : day.lessons.length ? esc(day.lessons.map(id => C.lessons[id - 1]?.title || 'Урок ' + id).join(' · ')) : ''}</p>
      <div class="progress"><i style="width:${Math.round(doneDays / DAYS * 100)}%"></i></div>
      <div class="hero-stats">
        <div class="hero-stat"><b>${streak()}</b><span>${plural(streak(), 'день', 'дня', 'дней')} подряд</span></div>
        <div class="hero-stat"><b>${doneDays}</b><span>дней выполнено</span></div>
        <div class="hero-stat"><b>${sst.learned}</b><span>слов выучено</span></div>
        <div class="hero-stat"><b>${st.profile.endLesson}</b><span>цель: урок</span></div>
      </div>
    </div>
    ${behind > 1 && show === cur ? `<div class="callout warn">Вы отстаёте от календаря на ${behind} ${plural(behind, 'день', 'дня', 'дней')}. Ничего страшного — просто продолжайте по порядку, план подстроится.</div>` : ''}
    ${ds.complete && show === cur ? `<div class="callout">🎉 День выполнен! Можно перейти к следующему или повторить слова.</div>` : ''}
    <div class="row" style="margin-bottom:10px"><h3>Задания дня</h3><span class="spacer"></span><span class="pill ${ds.complete ? 'ok' : ''}">${ds.done} / ${ds.total}</span></div>
    <div data-tasks>${day.tasks.map(t => taskHtml(t, show)).join('')}</div>
    <div class="row" style="margin-top:14px">
      ${show > 1 ? `<a class="btn small" href="#/today?d=${show - 1}">${ICONS.back} День ${show - 1}</a>` : ''}
      <span class="spacer"></span>
      ${show !== cur ? `<a class="btn small" href="#/today">К текущему дню</a>` : ''}
      ${show < DAYS ? `<a class="btn small" href="#/today?d=${show + 1}">День ${show + 1} ${ICONS.chev}</a>` : ''}
    </div>`;
  bindTaskToggles(root, viewToday);
}

export async function viewPlan() {
  await ensureContent();
  const P = plan();
  const cur = currentDay(P);
  const st = getState();
  const weeks = [];
  for (let i = 0; i < DAYS; i += 7) weeks.push(P.slice(i, i + 7));
  app().innerHTML = `
    <div class="page-head"><div class="eyebrow">90 дней</div><h1>Мой план</h1>
      <p class="lead">Уроки ${st.profile.startLesson}–${st.profile.endLesson} · ${st.profile.minutes} мин в день · цель: ${esc(levelAfter(st.profile.endLesson))}</p></div>
    <div class="row small muted" style="margin-bottom:14px;gap:14px">
      <span><span class="pill ok">✓</span> выполнен</span><span><span class="pill gold">П</span> повторение</span><span><span class="pill" style="background:#1d1b18;color:#f2b51d">Т</span> тест</span>
    </div>
    <div class="weeks">${weeks.map((w, i) => `
      <div><div class="week-label">Неделя ${i + 1} · ${fmtDate(w[0].date)} – ${fmtDate(w[w.length - 1].date)}</div>
      <div class="days">${w.map(d => {
        const s = dayStatus(d);
        const cls = [s.complete ? 'done' : s.done ? 'partial' : '', d.kind === 'review' ? 'review' : '', d.tasks.some(t => t.type === 'test' && !t.optional) || d.kind === 'final' ? 'test' : '', d.n === cur ? 'current' : ''].join(' ');
        return `<a class="day ${cls}" href="#/today?d=${d.n}" title="День ${d.n}"><b>${d.n}</b><small>${esc(weekdayLabel(d))}</small></a>`;
      }).join('')}</div></div>`).join('')}
    </div>`;
}

/* ================= Lessons ================= */

export async function viewLessons() {
  await ensureContent();
  const st = getState();
  const groups = [['A1', 'Уровень A1', 1, 20], ['A2', 'Уровень A2', 21, 30], ['B1', 'Уровень B1', 31, 45], ['B2', 'Уровень B2', 46, 50]];
  app().innerHTML = `
    <div class="page-head"><div class="eyebrow">Грамматика</div><h1>50 уроков</h1><p class="lead">От чтения и чисел до Konjunktiv I. Каждый урок: теория, примеры, слова, фразы курса и упражнения.</p></div>
    ${groups.map(([lv, title, a, b]) => `
      <div class="level-head"><h3>${title}</h3><span class="small muted">уроки ${a}–${b}</span></div>
      <div class="card" style="padding:4px 0">${C.lessons.slice(a - 1, b).map(l => {
        const ls = st.lessons[l.id];
        const cls = ls && ls.exBest >= 70 ? 'done' : ls && ls.theory ? 'started' : '';
        const inPlan = st.profile && l.id >= st.profile.startLesson && l.id <= st.profile.endLesson;
        return `<a class="lesson-item ${cls} ${l.missing ? 'locked' : ''}" href="#/lesson/${l.id}"><span class="lesson-num">${l.id}</span>
          <span style="flex:1;min-width:0"><b>${esc(l.title)}</b><br><span class="small muted">${l.missing ? 'готовится' : esc(l.goal || '')}</span></span>
          ${ls && ls.exBest ? `<span class="pill ${ls.exBest >= 70 ? 'ok' : ''}">${ls.exBest}%</span>` : inPlan ? '' : '<span class="pill">вне плана</span>'}</a>`;
      }).join('')}</div>`).join('')}`;
}

export async function viewLesson(id, tab = 'theory') {
  await ensureContent();
  let L;
  try { L = await content.lesson(id); } catch (e) { app().innerHTML = `${backLink('#/lessons', 'Уроки')}<div class="empty">Урок ${id} ещё не готов.</div>`; return; }
  const ls = lessonState(id);
  const dayN = qs().get('day');
  const tabs = [['theory', 'Теория'], ['examples', 'Примеры'], ['vocab', `Слова · ${L.vocab?.length || 0}`], ['phrases', `Фразы · ${L.phrases?.length || 0}`], ['ex', `Упражнения · ${L.exercises?.length || 0}`]];
  const root = app();
  root.innerHTML = `
    ${backLink(dayN ? '#/today?d=' + dayN : '#/lessons', dayN ? 'К заданиям дня' : 'Все уроки')}
    <div class="page-head"><div class="row"><span class="pill accent">Урок ${id}</span><span class="pill">${esc(L.level || levelOfLesson(id))}</span>${L.minutes ? `<span class="pill">~${L.minutes} мин</span>` : ''}</div>
      <h1 style="margin-top:10px">${esc(L.title)}</h1>${L.goal ? `<p class="lead">${esc(L.goal)}</p>` : ''}</div>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
    <div data-body></div>`;
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    history.replaceState(null, '', `#/lesson/${id}/${b.dataset.tab}${dayN ? '?day=' + dayN : ''}`);
    viewLesson(id, b.dataset.tab);
  }));
  const body = root.querySelector('[data-body]');
  bindSpeak(body);

  if (tab === 'theory') {
    body.innerHTML = `<div class="theory">${(L.theory || []).map(s => `<div class="sec"><h3>${esc(s.h)}</h3>${safeHtml(s.html)}</div>`).join('')}</div>
      ${(L.tips || []).length ? `<h3 style="margin:8px 0 10px">Советы</h3>${L.tips.map(t => `<div class="tip"><span>${esc(t)}</span></div>`).join('')}` : ''}
      <div class="card flat" style="margin-top:18px">
        ${ls.theory ? `<div class="row"><span class="pill ok">✓ Теория пройдена</span><span class="spacer"></span><button class="btn small" data-next="examples">Примеры ${ICONS.chev}</button></div>`
          : `<p class="small muted">Прочитайте внимательно, проговаривая немецкие примеры вслух. Затем отметьте — слова урока появятся в карточках.</p><button class="btn primary block" data-read>Я разобрался(-ась) в теме</button>`}
      </div>`;
    body.querySelector('[data-read]')?.addEventListener('click', () => {
      ls.theory = true; touch(); srs.syncPool([L]);
      toast('Отлично! Слова урока добавлены в карточки');
      viewLesson(id, 'examples');
    });
  } else if (tab === 'examples') {
    body.innerHTML = `<div class="card">${(L.examples || []).map(p => pairHtml(p)).join('') || '<div class="empty">Нет примеров</div>'}</div>
      <button class="btn block" data-next="vocab">К словам ${ICONS.chev}</button>`;
  } else if (tab === 'vocab') {
    body.innerHTML = `<div class="card table-scroll"><table class="vocab-table">${(L.vocab || []).map(v => `<tr>
        <td>${artHtml(v.de)}${v.pl ? `<div class="small muted">мн.: ${esc(v.pl)}</div>` : ''}${v.forms ? `<div class="small muted">${esc(v.forms)}</div>` : ''}</td>
        <td>${esc(v.ru)}</td><td style="width:40px">${speakBtn(v.de)}</td></tr>`).join('')}</table></div>
      <p class="small muted">Цвет артикля: <span class="art-der">der</span> · <span class="art-die">die</span> · <span class="art-das">das</span>. Слова попадут в карточки после изучения теории.</p>
      <button class="btn block" data-next="phrases">К фразам ${ICONS.chev}</button>`;
  } else if (tab === 'phrases') {
    body.innerHTML = `${L.phrasesNote ? `<div class="callout">${esc(L.phrasesNote)}</div>` : ''}
      <div class="row" style="margin-bottom:12px"><a class="btn primary" href="#/drill/${id}${dayN ? '?day=' + dayN : ''}">Тренировать фразы</a><span class="small muted">Пройдено раз: ${ls.phr}</span></div>
      <div class="card">${(L.phrases || []).map(p => pairHtml(p)).join('') || '<div class="empty">Нет фраз</div>'}</div>`;
  } else if (tab === 'ex') {
    const items = (L.exercises || []).map((x, i) => ({ ...x, _idx: i }));
    if (ls.exBest) body.insertAdjacentHTML('beforebegin', '');
    runQuiz(body, items, {
      onFinish: r => {
        if (!r.isRetry) { ls.exTries++; ls.exBest = Math.max(ls.exBest, r.score); ls.mistakes = r.wrong; }
        touch();
      },
      resultExtra: score => score >= 70 ? `<p class="small">Урок засчитан ✓</p>` : `<p class="small">Перечитайте теорию и попробуйте ещё раз — нужно 70%.</p>`,
      doneLabel: dayN ? 'К заданиям дня' : 'К урокам',
      onDone: () => go(dayN ? '#/today?d=' + dayN : '#/lessons'),
    });
  }
  body.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => {
    history.replaceState(null, '', `#/lesson/${id}/${b.dataset.next}${dayN ? '?day=' + dayN : ''}`);
    viewLesson(id, b.dataset.next); window.scrollTo(0, 0);
  }));
}

function pairHtml(p) {
  return `<div class="pair"><div class="pair-text"><div class="de-line">${esc(p.de)}</div><div class="ru-line">${esc(p.ru || '')}</div></div>${speakBtn(p.de)}</div>`;
}

/* ================= Phrase drill ================= */

export async function viewDrill(id) {
  const L = await content.lesson(id);
  const ls = lessonState(id);
  const dayN = qs().get('day');
  const list = L.phrases || [];
  let mode = 'say'; // say: RU → проговорить → показать DE; write: RU → написать DE
  let i = 0, known = 0;
  const root = app();
  bindSpeak(root);
  function header() {
    return `${backLink(`#/lesson/${id}/phrases${dayN ? '?day=' + dayN : ''}`, 'Урок ' + id)}
      <div class="page-head"><div class="eyebrow">Фразы · урок ${id} · проход ${ls.phr + 1}</div><h2>${esc(L.title)}</h2></div>`;
  }
  function start() {
    root.innerHTML = `${header()}
      <div class="card">
        <p>Метод курса: читаем фразу и понимаем каждую форму → медленно проговариваем, «смакуя» грамматику → ускоряемся до свободной речи.</p>
        <div class="seg" style="margin:6px 0 14px"><button data-m="say" class="${mode === 'say' ? 'active' : ''}">Говорю вслух</button><button data-m="write" class="${mode === 'write' ? 'active' : ''}">Пишу</button></div>
        <p class="small muted">${mode === 'say' ? 'Видите русскую фразу — произносите по-немецки вслух, затем открываете ответ и сверяете.' : 'Видите русскую фразу — пишете по-немецки, приложение проверяет.'} Всего фраз: ${list.length}.</p>
        <button class="btn primary block" data-start>Начать</button>
      </div>`;
    root.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; start(); }));
    root.querySelector('[data-start]').addEventListener('click', () => mode === 'say' ? card() : write());
  }
  function finish() {
    ls.phr++; touch();
    root.innerHTML = `${header()}<div class="q-card" style="text-align:center"><div class="result-big">${known}/${list.length}</div>
      <p class="lead">Проход №${ls.phr} засчитан. Повторяйте фразы несколько дней подряд — пока они не станут «вашими».</p>
      <div class="q-actions"><button class="btn" data-again>Ещё раз</button><a class="btn primary" href="${dayN ? '#/today?d=' + dayN : '#/lesson/' + id}">Готово</a></div></div>`;
    root.querySelector('[data-again]').addEventListener('click', () => { i = 0; known = 0; start(); });
  }
  function card() {
    if (i >= list.length) return finish();
    const p = list[i];
    root.innerHTML = `${header()}
      <div class="quiz-head"><span class="small muted">${i + 1} / ${list.length}</span><div class="progress"><i style="width:${i / list.length * 100}%"></i></div></div>
      <div class="flash" data-flip><div class="sub">Скажите по-немецки:</div><div class="word" style="font-size:24px">${esc(p.ru || p.de)}</div>
        <div class="back hidden">${esc(p.de)} <span style="display:inline-block;vertical-align:middle">${speakBtn(p.de)}</span></div>
        <div class="sub small" data-hint>нажмите, чтобы открыть ответ</div></div>
      <div class="grade hidden" style="grid-template-columns:1fr 1fr"><button class="btn again" data-g="0">Ошибся</button><button class="btn good" data-g="1">Сказал верно</button></div>`;
    const flash = root.querySelector('[data-flip]');
    flash.addEventListener('click', e => {
      if (e.target.closest('[data-speak]')) return;
      flash.querySelector('.back').classList.remove('hidden');
      flash.querySelector('[data-hint]').classList.add('hidden');
      root.querySelector('.grade').classList.remove('hidden');
      speak(p.de);
    }, { once: true });
    root.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { if (b.dataset.g === '1') known++; i++; card(); }));
  }
  function write() {
    const items = list.map(p => ({ type: 'translate', q: p.ru || p.de, answer: [p.de], label: 'Фраза по-немецки' }));
    runQuiz(root, items, {
      onFinish: r => { known = r.correct; },
      doneLabel: 'Засчитать проход',
      onDone: () => finish(),
      onExit: () => start(),
    });
  }
  start();
}

/* ================= Vocabulary ================= */

export async function viewVocab() {
  await ensureContent();
  const st = getState();
  srs.syncPool(C.lessons);
  const dayN = qs().get('day');
  const minutes = st.profile?.minutes || 60;
  let queue = srs.session(minutes);
  let mode = localStorage.getItem('dk90-vmode') || 'de-ru';
  let done = 0;
  const root = app();
  bindSpeak(root);

  function overview() {
    const s = srs.stats();
    queue = srs.session(minutes);
    root.innerHTML = `
      <div class="page-head"><div class="eyebrow">Интервальное повторение</div><h1>Слова</h1></div>
      <div class="grid three" style="margin-bottom:14px">
        <div class="kpi"><b>${queue.length}</b><span>на сегодня</span></div>
        <div class="kpi"><b>${s.learned}</b><span>выучено (≥ 7 дней)</span></div>
        <div class="kpi"><b>${s.total}</b><span>всего в колоде</span></div>
      </div>
      ${s.total === 0 ? `<div class="callout">Колода пуста. Слова добавляются, когда вы проходите теорию урока.</div>` : ''}
      <div class="card">
        <div class="seg" style="margin-bottom:12px"><button data-m="de-ru" class="${mode === 'de-ru' ? 'active' : ''}">DE → RU</button><button data-m="ru-de" class="${mode === 'ru-de' ? 'active' : ''}">RU → DE (писать)</button></div>
        <p class="small muted">Новых слов в день: ${srs.newPerDay(minutes)}. Повторение по интервалам 1 → 3 → 7 → 14 → 30 → 60 дней.</p>
        <button class="btn primary block" data-start ${queue.length ? '' : 'disabled'}>${queue.length ? 'Начать (' + queue.length + ')' : 'На сегодня всё повторено ✓'}</button>
      </div>
      <a class="list-link" href="#/words"><span style="flex:1"><span class="t">Весь словарь</span><br><span class="s">Поиск по всем словам уроков</span></span><span class="chev">${ICONS.chev}</span></a>`;
    root.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; localStorage.setItem('dk90-vmode', mode); overview(); }));
    root.querySelector('[data-start]').addEventListener('click', next);
    if (dayN && !queue.length && !getState().done[`vocab-${dayN}`]) { setDone(`vocab-${dayN}`); }
  }
  function complete() {
    if (dayN) setDone(`vocab-${dayN}`);
    root.innerHTML = `<div class="q-card" style="text-align:center"><div class="result-big">✓</div><p class="lead">Повторено карточек: ${done}. Возвращайтесь завтра!</p>
      <div class="q-actions"><a class="btn" href="#/vocab">Обзор</a><a class="btn primary" href="${dayN ? '#/today?d=' + dayN : '#/today'}">К плану</a></div></div>`;
  }
  function next() {
    if (!queue.length) return complete();
    const c = queue[0];
    const front = mode === 'de-ru' ? artHtml(c.de) : esc(c.ru);
    const extra = [c.pl && 'мн.: ' + c.pl, c.forms].filter(Boolean).map(esc).join(' · ');
    root.innerHTML = `
      <div class="quiz-head"><span class="small muted">осталось ${queue.length}</span><div class="progress ok"><i style="width:${done / (done + queue.length) * 100}%"></i></div><a class="btn ghost small" href="#/vocab">Стоп</a></div>
      <div class="flash" data-flip>
        <div class="sub">${c.box < 0 ? '<span class="pill gold">новое</span>' : 'урок ' + c.lesson}</div>
        <div class="word">${front}</div>
        ${mode === 'de-ru' ? `<div style="margin-top:8px">${speakBtn(c.de)}</div>` : `<input class="answer-input" style="margin-top:14px" placeholder="по-немецки (с артиклем)" autocomplete="off" autocapitalize="off" spellcheck="false">`}
        <div class="back hidden"><div>${mode === 'de-ru' ? esc(c.ru) : artHtml(c.de)}</div>${extra ? `<div class="small muted">${extra}</div>` : ''}<div data-verdict></div></div>
        <div class="sub small" data-hint>${mode === 'de-ru' ? 'вспомните перевод и нажмите' : 'Enter — проверить'}</div>
      </div>
      <div class="grade hidden">
        <button class="btn again" data-g="0">Не помню<small>сегодня ещё раз</small></button>
        <button class="btn" data-g="1">С трудом<small>завтра</small></button>
        <button class="btn good" data-g="2">Помню<small>позже</small></button>
      </div>`;
    const flash = root.querySelector('[data-flip]');
    const input = flash.querySelector('input');
    const reveal = () => {
      if (!flash.querySelector('.back').classList.contains('hidden')) return;
      flash.querySelector('.back').classList.remove('hidden');
      flash.querySelector('[data-hint]').classList.add('hidden');
      root.querySelector('.grade').classList.remove('hidden');
      speak(c.de);
      if (input) {
        const r = checkAnswer(input.value, [c.de, c.de.replace(/^(der|die|das)\s+/i, '')]);
        const withArt = /^(der|die|das)\s/i.test(c.de);
        const artOk = !withArt || checkAnswer(input.value, [c.de]).ok;
        flash.querySelector('[data-verdict]').innerHTML = r.ok ? `<span class="pill ok">${artOk ? 'верно' : 'верно, но без артикля'}</span>` : `<span class="pill accent">неверно</span>`;
        input.disabled = true;
      }
    };
    if (input) { setTimeout(() => input.focus(), 30); input.addEventListener('keydown', e => { if (e.key === 'Enter') reveal(); }); }
    flash.addEventListener('click', e => { if (e.target.closest('[data-speak]') || e.target === input) return; reveal(); });
    root.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
      const g = Number(b.dataset.g);
      srs.grade(c.de, g);
      queue.shift(); done++;
      if (g === 0) queue.push({ ...c, box: 0 });
      next();
    }));
  }
  overview();
}

export async function viewWords() {
  await ensureContent();
  const all = C.lessons.flatMap(l => (l.vocab || []).map(v => ({ ...v, lesson: l.id })));
  const root = app();
  bindSpeak(root);
  root.innerHTML = `${backLink('#/vocab', 'Слова')}<div class="page-head"><h1>Словарь курса</h1><p class="lead">${all.length} слов из 50 уроков</p></div>
    <input class="search" placeholder="Поиск по-немецки или по-русски" data-q><div class="card table-scroll" style="padding:6px 12px" data-list></div>`;
  const list = root.querySelector('[data-list]');
  const draw = q => {
    const f = q ? all.filter(v => (v.de + ' ' + v.ru).toLowerCase().includes(q.toLowerCase())) : all;
    list.innerHTML = `<table class="vocab-table">${f.slice(0, 300).map(v => `<tr><td>${artHtml(v.de)}${v.pl ? `<div class="small muted">мн.: ${esc(v.pl)}</div>` : ''}</td><td>${esc(v.ru)}</td><td class="small muted">ур. ${v.lesson}</td><td style="width:40px">${speakBtn(v.de)}</td></tr>`).join('')}</table>${f.length > 300 ? '<p class="small muted">Показаны первые 300 — уточните поиск.</p>' : ''}`;
  };
  root.querySelector('[data-q]').addEventListener('input', e => draw(e.target.value.trim()));
  draw('');
}

/* ================= Review & tests ================= */

export async function viewReview(n) {
  await ensureContent();
  const P = plan();
  const day = P[n - 1];
  const ids = day?.lessons?.length ? day.lessons : [];
  const lessons = await Promise.all(ids.map(id => content.lesson(id).catch(() => null)));
  let items = [];
  lessons.filter(Boolean).forEach(L => {
    const ls = lessonState(L.id);
    const ex = L.exercises || [];
    const mistakes = (ls.mistakes || []).map(i => ex[i]).filter(Boolean);
    const rest = shuffle(ex.filter((_, i) => !(ls.mistakes || []).includes(i))).slice(0, 4);
    const phr = shuffle(L.phrases || []).slice(0, 2).map(p => ({ type: 'translate', q: p.ru, answer: [p.de], label: `Фраза · урок ${L.id}` }));
    items.push(...mistakes, ...rest, ...phr);
  });
  items = shuffle(items).slice(0, 25);
  const root = app();
  root.innerHTML = `${backLink('#/today?d=' + n, 'День ' + n)}<div class="page-head"><div class="eyebrow">День ${n} · повторение</div><h2>Смешанная тренировка</h2>
    <p class="small muted">Сначала ваши прошлые ошибки, затем случайные задания и фразы.</p></div><div data-q></div>`;
  runQuiz(root.querySelector('[data-q]'), items, {
    onFinish: r => { if (r.score >= 60 && !r.isRetry) setDone(`review-${n}`); },
    doneLabel: 'К заданиям дня',
    onDone: () => go('#/today?d=' + n),
  });
}

export async function viewTests() {
  await ensureContent();
  const st = getState();
  app().innerHTML = `<div class="page-head"><div class="eyebrow">Контроль</div><h1>Тесты курса</h1><p class="lead">Перевод с русского на немецкий. Проверка по ключу курса.</p></div>
    <div class="card">${C.tests.map(t => `<a class="list-link" href="#/test/${t.id}">
      <span style="width:16px;height:16px;border-radius:50%;background:${esc(t.color || '#ccc')};border:1px solid var(--line);flex:none"></span>
      <span style="flex:1"><span class="t">${esc(t.name)}</span><br><span class="s">после урока ${t.afterLesson} · ${t.sections.reduce((a, s) => a + s.items.length, 0)} заданий</span></span>
      ${st.tests[t.id] ? `<span class="pill ${st.tests[t.id].score >= 70 ? 'ok' : ''}">${st.tests[t.id].score}%</span>` : ''}<span class="chev">${ICONS.chev}</span></a>`).join('') || '<div class="empty">Тесты готовятся</div>'}</div>
    <a class="btn block" href="#/placement">Пройти тест уровня заново</a>`;
}

export async function viewTest(id) {
  await ensureContent();
  const t = C.tests.find(x => x.id === id);
  const dayN = qs().get('day');
  const root = app();
  if (!t) { root.innerHTML = '<div class="empty">Тест не найден</div>'; return; }
  const items = t.sections.flatMap(s => s.items.map(it => ({ type: 'translate', q: it.q, answer: it.answer, label: s.title })));
  root.innerHTML = `${backLink(dayN ? '#/today?d=' + dayN : '#/tests', 'Назад')}<div class="page-head"><div class="eyebrow">Тест курса</div><h2>${esc(t.name)}</h2>
    <p class="small muted">${items.length} заданий. Пишите полные предложения. Небольшие расхождения (порядок слов, синонимы) отмечайте сами — смотрите ключ.</p></div><div data-q></div>`;
  runQuiz(root.querySelector('[data-q]'), items, {
    onFinish: r => { if (!r.isRetry) { const st = getState(); st.tests[id] = { score: Math.max(st.tests[id]?.score || 0, r.score), at: todayISO() }; touch(); } },
    resultExtra: s => s >= 70 ? '<p class="small">Тест сдан ✓</p>' : '<p class="small">Повторите уроки перед тестом и попробуйте снова.</p>',
    doneLabel: 'Готово', onDone: () => go(dayN ? '#/today?d=' + dayN : '#/tests'),
  });
}

/* ================= Library ================= */

export async function viewTopics() {
  await ensureContent();
  const st = getState();
  const blocks = [...new Set(C.conversation.map(t => t.block))];
  app().innerHTML = `${backLink('#/more', 'Ещё')}<div class="page-head"><div class="eyebrow">Разговорный курс</div><h1>Живая речь</h1><p class="lead">Все значения частых предлогов и «хитрых» слов: bei, nach, doch, wohl, knapp…</p></div>
    ${blocks.map(b => `<div class="level-head"><h3>${b === 4 ? 'Бонус' : 'Блок ' + b}</h3></div><div class="card">${C.conversation.filter(t => t.block === b).map(t => `
      <a class="list-link" href="#/topic/${t.id}"><span style="flex:1"><span class="t">${esc(t.title)}</span><br><span class="s">${esc(t.intro || '')}</span></span>${st.topics[t.id] ? '<span class="pill ok">✓</span>' : ''}<span class="chev">${ICONS.chev}</span></a>`).join('')}</div>`).join('') || '<div class="empty">Готовится</div>'}`;
}

export async function viewTopic(id) {
  await ensureContent();
  const t = C.conversation.find(x => x.id === id);
  const dayN = qs().get('day');
  const root = app();
  if (!t) { root.innerHTML = '<div class="empty">Тема не найдена</div>'; return; }
  bindSpeak(root);
  root.innerHTML = `${backLink(dayN ? '#/today?d=' + dayN : '#/topics', 'Назад')}
    <div class="page-head"><div class="eyebrow">Разговорный курс</div><h1>${esc(t.title)}</h1>${t.intro ? `<p class="lead">${esc(t.intro)}</p>` : ''}</div>
    ${(t.groups || []).map(g => `<div class="card"><h3>${esc(g.meaning)}</h3>${g.items.map(pairHtml).join('')}</div>`).join('')}
    ${t.advice ? `<div class="note">${esc(t.advice)}</div>` : ''}
    ${(t.practice || []).length ? `<h3 style="margin:18px 0 10px">Практика: переведите</h3><div data-q></div>` : `<button class="btn primary block" data-done>Тема изучена</button>`}`;
  const mark = () => { getState().topics[id] = todayISO(); touch(); };
  root.querySelector('[data-done]')?.addEventListener('click', () => { mark(); toast('Тема отмечена ✓'); go(dayN ? '#/today?d=' + dayN : '#/topics'); });
  if ((t.practice || []).length) {
    runQuiz(root.querySelector('[data-q]'), t.practice.map(p => ({ type: 'translate', q: p.ru, answer: p.de })), {
      onFinish: r => { if (r.score >= 60) mark(); },
      doneLabel: 'Готово', onDone: () => go(dayN ? '#/today?d=' + dayN : '#/topics'),
    });
  }
}

export async function viewVerbs() {
  await ensureContent();
  const g = (qs().get('g') || '').split(',').filter(Boolean).map(Number);
  const dayN = qs().get('day');
  const list = g.length ? C.irregular.filter(v => g.includes(v.group)) : C.irregular;
  const root = app();
  bindSpeak(root);
  root.innerHTML = `${backLink(dayN ? '#/today?d=' + dayN : '#/more', 'Назад')}
    <div class="page-head"><div class="eyebrow">Справочник</div><h1>Неправильные глаголы</h1><p class="lead">${g.length ? 'Группы ' + g.join(', ') + ' · ' : ''}${list.length} глаголов. Глаголы сгруппированы по одинаковому чередованию гласных — учите группами.</p></div>
    <div class="row" style="margin-bottom:12px"><button class="btn primary" data-train>Тренировать формы</button>${g.length ? `<a class="btn" href="#/verbs">Все глаголы</a>` : ''}</div>
    <div class="card table-scroll" data-body><table class="data-table"><tr><th>Infinitiv</th><th>Präteritum</th><th>Partizip II</th><th>Перевод</th><th></th></tr>
    ${list.map(v => `<tr><td><b>${esc(v.inf)}</b></td><td>${esc(v.prat)}</td><td>${esc(v.p2)}</td><td>${esc(v.ru)}</td><td>${speakBtn(`${v.inf}, ${v.prat}, ${v.p2}`)}</td></tr>`).join('')}</table></div>`;
  root.querySelector('[data-train]').addEventListener('click', () => {
    const items = shuffle(list).map(v => ({ type: 'translate', label: 'Präteritum и Partizip II через запятую', q: `${v.inf} (${v.ru})`, answer: [`${v.prat}, ${v.p2}`, `${v.prat} ${v.p2}`, `${v.prat}, ${v.p2.replace(/^(ist|hat)\s+/, '')}`, `${v.prat} ${v.p2.replace(/^(ist|hat)\s+/, '')}`] }));
    runQuiz(root.querySelector('[data-body]'), items, {
      onFinish: r => { if (r.score >= 70 && dayN) { const t = plan()[dayN - 1].tasks.find(x => x.type === 'verbs'); if (t) setDone(t.key); } },
      doneLabel: 'Готово', onDone: () => go(dayN ? '#/today?d=' + dayN : '#/verbs'),
    });
  });
}

export async function viewGovernment() {
  await ensureContent();
  const from = Number(qs().get('from')) || 1, to = Number(qs().get('to')) || C.government.length;
  const dayN = qs().get('day');
  const list = C.government.slice(from - 1, to);
  const root = app();
  bindSpeak(root);
  root.innerHTML = `${backLink(dayN ? '#/today?d=' + dayN : '#/more', 'Назад')}
    <div class="page-head"><div class="eyebrow">Справочник</div><h1>Управление глаголов</h1><p class="lead">Глагол + предлог + падеж (A — Akkusativ, D — Dativ). ${from}–${to} из ${C.government.length}.</p></div>
    <div class="row" style="margin-bottom:12px"><button class="btn primary" data-train>Тренировать</button>${from > 1 || to < C.government.length ? `<a class="btn" href="#/government">Все</a>` : ''}</div>
    <div data-body>${list.map(v => `<div class="card flat"><div class="row"><b>${esc(v.verb)}</b><span class="pill info">${esc(v.case)}</span><span class="spacer"></span>${speakBtn(v.ex_de)}</div>
      <div class="muted small">${esc(v.ru)}</div><div style="margin-top:6px"><span class="de">${esc(v.ex_de)}</span><br><span class="small muted">${esc(v.ex_ru)}</span></div></div>`).join('')}</div>`;
  root.querySelector('[data-train]').addEventListener('click', () => {
    const items = shuffle(list).map(v => ({ type: 'translate', q: v.ex_ru, answer: [v.ex_de], explain: `${v.verb} + ${v.case}` }));
    runQuiz(root.querySelector('[data-body]'), items, {
      onFinish: r => { if (r.score >= 70 && dayN) { const t = plan()[dayN - 1].tasks.find(x => x.type === 'gov'); if (t) setDone(t.key); } },
      doneLabel: 'Готово', onDone: () => go(dayN ? '#/today?d=' + dayN : '#/government'),
    });
  });
}

/* ================= More / settings ================= */

export async function viewMore() {
  await ensureContent();
  const st = getState();
  const lessonsDone = Object.values(st.lessons).filter(l => l.exBest >= 70).length;
  const s = srs.stats();
  const theme = document.documentElement.dataset.theme || 'auto';
  const rate = localStorage.getItem('dk90-rate') || '0.9';
  const root = app();
  root.innerHTML = `
    <div class="page-head"><div class="eyebrow">Разделы</div><h1>Ещё</h1></div>
    <div class="grid three" style="margin-bottom:14px">
      <div class="kpi"><b>${lessonsDone}</b><span>уроков засчитано</span></div>
      <div class="kpi"><b>${s.learned}/${s.total}</b><span>слов выучено</span></div>
      <div class="kpi"><b>${streak()}</b><span>дней подряд</span></div>
    </div>
    <div class="card">
      ${[['#/tests', 'Тесты курса', 'Белый, Жёлтый, Оранжевый, Зелёный, Чёрный'], ['#/topics', 'Разговорный курс', 'Предлоги и «хитрые» слова живой речи'], ['#/verbs', 'Неправильные глаголы', `${C.irregular.length} глаголов по группам`], ['#/government', 'Управление глаголов', `${C.government.length} глаголов с предлогами`], ['#/words', 'Словарь курса', 'Все слова уроков'], ['#/method', 'Как учиться по курсу', 'Методика автора курса']]
        .map(([h, t, sub]) => `<a class="list-link" href="${h}"><span style="flex:1"><span class="t">${t}</span><br><span class="s">${sub}</span></span><span class="chev">${ICONS.chev}</span></a>`).join('')}
    </div>
    <h3 style="margin:20px 0 10px">Настройки</h3>
    <div class="card stack">
      <div class="row"><b>Тема</b><span class="spacer"></span><div class="seg">${[['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, t]) => `<button data-theme="${k}" class="${theme === k ? 'active' : ''}">${t}</button>`).join('')}</div></div>
      <div class="row"><b>Скорость озвучки</b><span class="spacer"></span><div class="seg">${[['0.7', 'Медленно'], ['0.9', 'Обычно'], ['1.05', 'Быстро']].map(([k, t]) => `<button data-rate="${k}" class="${rate === k ? 'active' : ''}">${t}</button>`).join('')}</div></div>
      <div class="row"><b>План</b><span class="spacer"></span><a class="btn small" href="#/setup">Изменить время / старт</a><a class="btn small" href="#/placement">Тест уровня</a></div>
      <div class="divider"></div>
      <p class="small muted">Прогресс хранится в этом браузере. Сохраняйте резервную копию, чтобы перенести его на другое устройство.</p>
      <div class="row"><button class="btn small" data-export>Скачать резервную копию</button><label class="btn small">Загрузить копию<input type="file" accept="application/json" data-import hidden></label><span class="spacer"></span><button class="btn small ghost" data-reset style="color:var(--bad)">Сбросить всё</button></div>
      <p class="small muted" style="margin-top:8px">Версия приложения: ${APP_VERSION}</p>
    </div>`;
  root.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.theme;
    if (k === 'auto') { delete document.documentElement.dataset.theme; localStorage.removeItem('dk90-theme'); }
    else { document.documentElement.dataset.theme = k; localStorage.setItem('dk90-theme', k); }
    viewMore();
  }));
  root.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => { localStorage.setItem('dk90-rate', b.dataset.rate); speak('Guten Tag! Wie geht es dir?'); viewMore(); }));
  root.querySelector('[data-export]').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
    a.download = `deutsch90-${todayISO()}.json`; a.click();
  });
  root.querySelector('[data-import]').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { importJSON(await f.text()); resetPlanCache(); toast('Прогресс загружен'); go('#/today'); } catch (err) { toast('Не удалось прочитать файл'); }
  });
  root.querySelector('[data-reset]').addEventListener('click', () => {
    if (confirm('Удалить весь прогресс и план? Это нельзя отменить.')) { resetAll(); resetPlanCache(); go('#/'); }
  });
}

export function viewMethod() {
  app().innerHTML = `${backLink('#/more', 'Ещё')}
    <div class="page-head"><div class="eyebrow">Методика</div><h1>Как учиться по курсу</h1><p class="lead">Руководство автора курса — в сокращении и на русском.</p></div>
    <div class="card"><h3>Каждый урок — в три шага</h3><ol style="padding-left:20px"><li><b>Изучаем тему</b> — теория и примеры.</li><li><b>Работаем с фразами</b> — многократно проговариваем вслух одни и те же предложения, понимая каждую форму. Сначала медленно, «смакуя» грамматику, потом быстрее — до свободной речи.</li><li><b>Переводим упражнения</b> на немецкий и проверяем себя по ключу.</li></ol></div>
    <div class="card"><h3>Блок 1. С нуля до A1</h3><p>Уроки 1–8 → <b>Белый тест</b>. Затем подключаем учебник <i>Begegnungen A1</i>: пока только тексты, диалоги и фонетику — тренируем произношение и понимание. Пересказывайте диалоги и записывайте себя на диктофон. Для уверенной сдачи A1 — уроки 1–20, <b>Жёлтый тест</b> и первые 4 главы Begegnungen. Самое сложное здесь — Akkusativ и Dativ.</p></div>
    <div class="card"><h3>Блок 2. A2</h3><p>Уроки 21–30, <b>Оранжевый тест</b>, Begegnungen A1 до конца (тексты, диалоги, фонетика — обязательно). Начинаем учить управление глаголов. Самое сложное — неправильные глаголы.</p></div>
    <div class="card"><h3>Блок 3. B1</h3><p>Уроки 31–45 и Begegnungen A2 полностью. На уровнях B1 и B2 грамматика почти одинакова — разница в словарном запасе и скорости реакции. Нужно уверенно владеть управлением глаголов. <b>Зелёный тест</b> после урока 35.</p></div>
    <div class="card"><h3>Блок 4. B2</h3><p>Begegnungen B1 полностью: понимать на слух все тексты и уметь их пересказать. Уроки 46–50, <b>Чёрный тест</b>. Начинайте смотреть немецкие каналы — вы будете понимать 70–80%.</p></div>
    <div class="card"><h3>C1 и дальше</h3><p>Устойчивые выражения, разговорные «фишки», специальная лексика. Учебники Erkundungen, фильмы, газеты, книги в оригинале и общение с носителями.</p></div>
    <div class="note">Главное правило: заниматься <b>каждый день</b>. Семь занятий по 20–30 минут дают намного больше, чем три часа раз в неделю. Дорогу осилит идущий!</div>`;
}
