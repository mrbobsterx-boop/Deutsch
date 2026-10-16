// Generic exercise runner: choice / gap / translate / order.
import { esc, checkAnswer, shuffle, speak, speakBtn, ICONS } from './util.js';

const TYPE_LABEL = {
  choice: 'Выберите правильный вариант',
  gap: 'Заполните пропуск',
  translate: 'Переведите на немецкий',
  order: 'Составьте предложение',
};

export function normalizeItem(x) {
  if (!x) return null;
  if (x.type === 'choice' && Array.isArray(x.options)) return x;
  if (x.type === 'order' && Array.isArray(x.words)) return { ...x, answer: toList(x.answer) };
  if (x.type === 'gap') return { ...x, answer: toList(x.answer) };
  return { ...x, type: 'translate', answer: toList(x.answer ?? x.de) };
}
const toList = a => (Array.isArray(a) ? a : [a]).filter(Boolean).map(String);

const umlautBar = () => `<div class="umlauts">${['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map(c => `<button type="button" data-ch="${c}">${c}</button>`).join('')}</div>`;

export function runQuiz(root, rawItems, opts = {}) {
  const items = rawItems.map(normalizeItem).filter(Boolean);
  let i = 0;
  const results = [];
  if (!items.length) { root.innerHTML = '<div class="empty">Упражнений пока нет.</div>'; return; }

  function render() {
    const it = items[i];
    const pct = Math.round(i / items.length * 100);
    let body = '';
    if (it.type === 'choice') {
      body = `<div class="options">${it.options.map((o, k) => `<button class="option" data-k="${k}">${esc(o)}</button>`).join('')}</div>`;
    } else if (it.type === 'order') {
      const pieces = shuffle(it.words.map((w, k) => ({ w, k })));
      body = `<div class="chips target" data-target></div><div class="chips" data-pool>${pieces.map(p => `<button class="chip" data-k="${p.k}">${esc(p.w)}</button>`).join('')}</div>`;
    } else {
      body = `<input class="answer-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${it.type === 'gap' ? 'Пропущенное слово' : 'Ваш перевод на немецком'}" aria-label="Ответ">${umlautBar()}`;
    }
    root.innerHTML = `
      <div class="quiz-head">
        <span class="small muted">${i + 1} / ${items.length}</span>
        <div class="progress"><i style="width:${pct}%"></i></div>
        ${opts.onExit ? `<button class="btn ghost small" data-exit>Выйти</button>` : ''}
      </div>
      <div class="q-card">
        <div class="q-type">${esc(it.label || TYPE_LABEL[it.type])}</div>
        <div class="q-text">${esc(it.q)}</div>
        ${body}
        <div class="fb"></div>
        <div class="q-actions">
          ${it.type !== 'choice' ? `<button class="btn" data-skip>Не знаю</button><button class="btn primary" data-check>Проверить</button>` : `<button class="btn" data-skip>Не знаю</button>`}
        </div>
      </div>`;
    const input = root.querySelector('.answer-input');
    if (input) {
      setTimeout(() => input.focus(), 30);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
      root.querySelectorAll('[data-ch]').forEach(b => b.addEventListener('click', () => {
        const s = input.selectionStart ?? input.value.length;
        input.value = input.value.slice(0, s) + b.dataset.ch + input.value.slice(input.selectionEnd ?? s);
        input.focus(); input.setSelectionRange(s + 1, s + 1);
      }));
    }
    if (it.type === 'choice') root.querySelectorAll('.option').forEach(b => b.addEventListener('click', () => check(Number(b.dataset.k))));
    if (it.type === 'order') {
      const target = root.querySelector('[data-target]');
      root.querySelectorAll('[data-pool] .chip').forEach(c => c.addEventListener('click', () => {
        if (c.classList.contains('used')) return;
        c.classList.add('used');
        const t = document.createElement('button');
        t.className = 'chip'; t.textContent = c.textContent; t.dataset.k = c.dataset.k;
        t.addEventListener('click', () => { t.remove(); c.classList.remove('used'); });
        target.appendChild(t);
      }));
    }
    root.querySelector('[data-check]')?.addEventListener('click', () => check());
    root.querySelector('[data-skip]').addEventListener('click', () => finishItem(false, '', true));
    root.querySelector('[data-exit]')?.addEventListener('click', () => opts.onExit());
  }

  function userText() {
    const it = items[i];
    if (it.type === 'order') return [...root.querySelectorAll('[data-target] .chip')].map(c => c.textContent).join(' ');
    return root.querySelector('.answer-input')?.value || '';
  }

  function check(choice) {
    const it = items[i];
    if (it.type === 'choice') {
      const ok = choice === it.answer;
      root.querySelectorAll('.option').forEach((b, k) => {
        b.disabled = true;
        if (k === it.answer) b.classList.add('right');
        else if (k === choice) b.classList.add('wrong');
      });
      return finishItem(ok, it.options[choice]);
    }
    const text = userText();
    if (!text.trim()) return;
    const r = checkAnswer(text, it.answer);
    if (r.close && !it._retried) {
      it._retried = true;
      root.querySelector('.fb').innerHTML = `<div class="feedback bad"><b>Почти!</b>Есть небольшая опечатка — исправьте и проверьте ещё раз.</div>`;
      return;
    }
    finishItem(r.ok, text, false, r.note);
  }

  function finishItem(ok, given, skipped, note) {
    const it = items[i];
    results.push({ item: it, ok, given, idx: it._idx ?? i });
    const right = it.type === 'choice' ? it.options[it.answer] : it.answer[0];
    const sayable = it.type === 'choice' ? (it.q.includes('___') ? it.q.replace(/_{2,}/, right) : '') : (it.type === 'gap' ? it.q.replace(/_{2,}/, right).replace(/\s*\(.*?\)\s*$/, '') : right);
    const alt = it.type !== 'choice' && it.answer.length > 1 ? `<div class="small muted" style="margin-top:4px">Также верно: ${it.answer.slice(1, 4).map(esc).join(' · ')}</div>` : '';
    root.querySelector('.fb').innerHTML = `
      <div class="feedback ${ok ? 'ok' : 'bad'}">
        <b>${ok ? (note ? 'Засчитано' : 'Верно!') : (skipped ? 'Правильный ответ' : 'Неверно')}</b>
        ${note ? `<div>${esc(note)}</div>` : ''}
        ${!ok || it.type !== 'choice' ? `<div class="row" style="gap:8px;margin-top:4px"><span class="correct">${esc(right)}</span>${sayable ? speakBtn(sayable) : ''}</div>${alt}` : ''}
        ${it.explain ? `<div style="margin-top:6px">${esc(it.explain)}</div>` : ''}
      </div>`;
    if (ok && sayable && opts.autoSpeak !== false) speak(sayable);
    const acts = root.querySelector('.q-actions');
    acts.innerHTML = `<button class="btn primary" data-next>${i + 1 < items.length ? 'Дальше' : 'Результат'} ${ICONS.chev}</button>`;
    const next = acts.querySelector('[data-next]');
    next.focus();
    next.addEventListener('click', () => { i++; i < items.length ? render() : done(); });
    root.querySelectorAll('input, [data-pool] .chip, [data-target] .chip').forEach(el => el.disabled = true);
  }

  function done() {
    const correct = results.filter(r => r.ok).length;
    const score = Math.round(correct / results.length * 100);
    const wrong = results.filter(r => !r.ok);
    const verdict = score >= 90 ? 'Отлично! 🎉' : score >= 70 ? 'Хорошо — засчитано' : 'Нужно повторить';
    root.innerHTML = `
      <div class="q-card" style="text-align:center">
        <div class="q-type">Результат</div>
        <div class="result-big" style="color:${score >= 70 ? 'var(--ok)' : 'var(--bad)'}">${score}%</div>
        <p class="lead">${verdict}<br><span class="muted small">${correct} из ${results.length} правильно</span></p>
        ${opts.resultExtra ? opts.resultExtra(score) : ''}
        <div class="q-actions">
          ${wrong.length ? `<button class="btn" data-retry>Повторить ошибки (${wrong.length})</button>` : ''}
          ${opts.doneLabel ? `<button class="btn primary" data-done>${esc(opts.doneLabel)}</button>` : ''}
        </div>
      </div>
      ${wrong.length ? `<div class="card flat" style="margin-top:14px"><h3>Ошибки</h3>${wrong.map(r => `
        <div class="pair"><div class="pair-text"><div class="ru-line">${esc(r.item.q)}</div>
        <div class="de-line">${esc(r.item.type === 'choice' ? r.item.options[r.item.answer] : r.item.answer[0])}</div>
        ${r.given ? `<div class="small" style="color:var(--bad)">Ваш ответ: ${esc(r.given)}</div>` : ''}</div></div>`).join('')}</div>` : ''}`;
    root.querySelector('[data-retry]')?.addEventListener('click', () => runQuiz(root, wrong.map(r => ({ ...r.item, _retried: false })), { ...opts, isRetry: true }));
    root.querySelector('[data-done]')?.addEventListener('click', () => opts.onDone && opts.onDone(score));
    if (opts.onFinish) opts.onFinish({ score, correct, total: results.length, wrong: wrong.map(r => r.idx), isRetry: !!opts.isRetry });
  }

  render();
}
