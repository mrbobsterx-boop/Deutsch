import * as V from './views.js';
import { getState } from './store.js';

try {
  const t = localStorage.getItem('dk90-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) { /* storage blocked */ }

const routes = [
  [/^\/?$/, () => getState().profile ? V.viewToday() : V.viewWelcome(), 'today'],
  [/^\/placement$/, () => V.viewPlacement(), 'today'],
  [/^\/setup$/, () => V.viewSetup(), 'more'],
  [/^\/today$/, () => V.viewToday(), 'today'],
  [/^\/plan$/, () => V.viewPlan(), 'plan'],
  [/^\/lessons$/, () => V.viewLessons(), 'lessons'],
  [/^\/lesson\/(\d+)(?:\/(\w+))?$/, m => V.viewLesson(Number(m[1]), m[2] || 'theory'), 'lessons'],
  [/^\/drill\/(\d+)$/, m => V.viewDrill(Number(m[1])), 'lessons'],
  [/^\/vocab$/, () => V.viewVocab(), 'vocab'],
  [/^\/words$/, () => V.viewWords(), 'vocab'],
  [/^\/review\/(\d+)$/, m => V.viewReview(Number(m[1])), 'today'],
  [/^\/tests$/, () => V.viewTests(), 'more'],
  [/^\/test\/([\w-]+)$/, m => V.viewTest(m[1]), 'more'],
  [/^\/topics$/, () => V.viewTopics(), 'more'],
  [/^\/topic\/([\w-]+)$/, m => V.viewTopic(m[1]), 'more'],
  [/^\/verbs$/, () => V.viewVerbs(), 'more'],
  [/^\/government$/, () => V.viewGovernment(), 'more'],
  [/^\/method$/, () => V.viewMethod(), 'more'],
  [/^\/more$/, () => V.viewMore(), 'more'],
];

// Pages that need a plan redirect to onboarding until one exists.
const NEEDS_PLAN = new Set(['/today', '/plan', '/review']);

async function route() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  if (!getState().profile && [...NEEDS_PLAN].some(p => path.startsWith(p))) { location.hash = '#/'; return; }
  for (const [re, fn, nav] of routes) {
    const m = re.exec(path);
    if (!m) continue;
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
    try {
      await fn(m);
    } catch (e) {
      console.error(e);
      document.getElementById('app').innerHTML = `<div class="empty">Не удалось загрузить страницу.<br><small>${String(e.message || e)}</small></div>`;
    }
    if (!location.hash.includes('?')) window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
