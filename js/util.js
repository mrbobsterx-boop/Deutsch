// Small DOM + text helpers shared by all views.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Theory HTML comes from our own content files; still strip anything executable.
const ALLOWED = new Set(['P', 'B', 'I', 'U', 'BR', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'H4', 'SPAN', 'DIV', 'STRONG', 'EM', 'SMALL', 'SUP', 'SUB']);
export function safeHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const walk = node => {
    [...node.children].forEach(el => {
      if (!ALLOWED.has(el.tagName)) { el.replaceWith(document.createTextNode(el.textContent)); return; }
      [...el.attributes].forEach(a => { if (!(a.name === 'class' || a.name === 'colspan' || a.name === 'rowspan')) el.removeAttribute(a.name); });
      walk(el);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function todayISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return todayISO(d);
}
export function diffDays(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export function fmtDate(iso, withWd = false) {
  const d = new Date(iso + 'T12:00:00');
  return `${withWd ? WD[d.getDay()] + ', ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// ---------- Answer checking ----------
function base(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[„“”«»"]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;:,]+$/g, '')
    .replace(/\s+([,.!?])/g, '$1')
    .toLowerCase();
}
function noPunct(s) { return s.replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim(); }
function fold(s) { return s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'); }

// Returns {ok, close, note}
export function checkAnswer(input, answers) {
  const list = Array.isArray(answers) ? answers : [answers];
  const a = base(input);
  if (!a) return { ok: false };
  for (const ans of list) {
    const b = base(ans);
    if (a === b || noPunct(a) === noPunct(b)) return { ok: true };
  }
  for (const ans of list) {
    if (fold(noPunct(a)) === fold(noPunct(base(ans)))) return { ok: true, note: 'Верно, но следите за умлаутами и ß (ä ö ü ß).' };
  }
  // One small typo in a long answer counts as "almost".
  for (const ans of list) {
    const b = noPunct(base(ans));
    if (b.length > 6 && lev(fold(noPunct(a)), fold(b)) <= 1) return { ok: false, close: true };
  }
  return { ok: false };
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// ---------- Text to speech ----------
let deVoice = null;
function pickVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  deVoice = vs.find(v => v.lang === 'de-DE' && /google|natural|premium|enhanced/i.test(v.name))
    || vs.find(v => v.lang === 'de-DE') || vs.find(v => v.lang && v.lang.startsWith('de')) || null;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
// Pre-recorded neural voice (audio/<hash>.mp3, listed in audio/index.json);
// anything not recorded falls back to the browser's speech synthesis.
// The key must match tools/gen_audio.py: same normalisation, FNV-1a over UTF-8.
function normSpeech(t) {
  return String(t ?? '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
function fnv(s) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
let recorded = null;
fetch('audio/index.json').then(r => r.ok ? r.json() : []).then(a => { recorded = new Set(a); }).catch(() => { recorded = new Set(); });
let player = null;

export function canSpeak() { return true; }
export function speak(text, rate) {
  const t = normSpeech(text);
  if (!t) return;
  const r = rate || Number(localStorage.getItem('dk90-rate') || 0.9);
  if (player) { player.pause(); player = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  const key = fnv(t);
  if (recorded && recorded.has(key)) {
    const a = player = new Audio(`audio/${key}.mp3`);
    a.playbackRate = r / 0.9;
    // If the recording can't start (network, Safari quirks), say it with the browser voice instead of staying silent.
    let started = false, fellBack = false;
    const fallback = () => { if (started || fellBack || player !== a) return; fellBack = true; a.pause(); synth(t, r); };
    a.addEventListener('playing', () => { started = true; }, { once: true });
    a.addEventListener('error', fallback, { once: true });
    setTimeout(fallback, 2500);
    a.play().catch(fallback);
    return;
  }
  synth(t, r);
}
function synth(t, r) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'de-DE';
  if (deVoice) u.voice = deVoice;
  u.rate = r;
  speechSynthesis.speak(u);
}

export const ICONS = {
  speak: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  cards: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/></svg>',
  read: '<svg viewBox="0 0 24 24"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>',
  verb: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h7"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
};

export function speakBtn(text) {
  if (!canSpeak()) return '';
  return `<button class="icon-btn" data-speak="${esc(text)}" aria-label="Произнести" title="Произнести">${ICONS.speak}</button>`;
}

// Colour the article of a German noun: der/die/das.
export function artHtml(de) {
  const m = /^(der|die|das)\s+(.*)$/i.exec(de || '');
  if (!m) return esc(de);
  return `<span class="art-${m[1].toLowerCase()}">${esc(m[1])}</span> ${esc(m[2])}`;
}
