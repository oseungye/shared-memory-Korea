/* ============================================================
   Shared Memory Project — ask-ai.js
   '③ 질문하는 AI' — 네 번째 서술자 탭 맨 아래, AI와 두 번 주고받는 짧은 대화
   ============================================================
   · 첫 질문은 fourth-narrator-data.js의 dialogue[사건][0] (AI를 부르지 않음) → 학생 답 → 호출 1 (반응 + 근거 칩 + 두 번째 질문)
     → 학생 답 → 호출 2 (마무리 + 근거 칩). 호출은 최대 2회, 그 뒤 입력을 잠급니다.
   · 호출은 Supabase Edge Function `ask-ai`(db.functions.invoke)가 대신합니다. 키는 브라우저에 없습니다.
   · 실패·타임아웃·429·503·거절({fallback:true})이면 재시도 없이 dialogue[사건][1]·[2]의 미리 써 둔 질문으로 이어갑니다. db가 없으면 처음부터 폴백.
   · 이 사이트는 대화를 저장하지 않습니다(답은 Anthropic으로 전송됨). 학생 답은 전송 전에 빈 답·600자 초과·전화번호·이메일을 막습니다.
   · 제한 시간은 supabase-config.js의 fetchWithTimeout 15초가 담당합니다(별도 타이머 없음).
   · 근거 칩: narrative(비교 탭 나라 카드) · ai(네 번째 서술자 언어 카드·회차) · source(사료 카드)로 이동·강조. 대상이 없으면 무시.
   · 순수 부분(nextState·validateAnswer)은 Node 테스트에서 require로 불러옵니다. 화면 부분은 브라우저에서만 동작합니다.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AskAi = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_ANSWER = 600;
  const FALLBACK_NOTE = 'AI가 응답하지 않아 준비한 질문으로 이어갑니다.';
  const NOTICE = '이 사이트는 답을 저장하지 않습니다. 답은 AI 서비스(Anthropic)로 전송되어 그 쪽 정책에 따라 처리됩니다. 이름·개인정보는 쓰지 마세요.';
  const NATION = { korea: '한국 측 서술', japan: '일본 측 서술', china: '중국 측 서술' };
  const LANG = { ko: '한국어', ja: '일본어', zh: '중국어' };

  /* ---------- 순수 부분 ---------- */

  // 상태기: idle → q1 → wait1 → q2 → wait2 → done. 정해지지 않은 전이는 그대로 머뭅니다.
  const NEXT = { 'idle:start': 'q1', 'q1:submit': 'wait1', 'wait1:reply': 'q2', 'q2:submit': 'wait2', 'wait2:reply': 'done' };
  function nextState(step, action) { return NEXT[step + ':' + action] || step; }

  // 개인정보 패턴 — supabase/functions/ask-ai/core.mjs의 PII와 같아야 합니다(테스트가 검사). 전화번호는 0으로 시작하는 2~3자리 + 3~4자리 + 4자리(연도 1592·1598은 걸리지 않음).
  const PII = { email: /[\w.+-]+@[\w-]+\.[\w.-]+/, phone: /(^|\D)0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(\D|$)/ };

  /** 전송 전 검사. { ok: true, text } 또는 { ok: false, message } */
  function validateAnswer(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { ok: false, message: '답을 한 문장이라도 써 주세요.' };
    if (text.length > MAX_ANSWER) return { ok: false, message: `${MAX_ANSWER}자 이내로 써 주세요. (지금 ${text.length}자)` };
    if (PII.email.test(text)) return { ok: false, message: '이메일 주소는 쓰지 마세요. 개인정보는 보내지 않습니다.' };
    if (PII.phone.test(text)) return { ok: false, message: '전화번호는 쓰지 마세요. 개인정보는 보내지 않습니다.' };
    return { ok: true, text };
  }

  /** 근거 칩이 가리키는 대상이 실재하는지 (없는 것은 그리지도, 누르지도 않음) */
  function isValidEvidence(e) {
    if (!e || typeof e.kind !== 'string' || typeof e.id !== 'string' || !/^[\w-]+$/.test(e.id)) return false;
    if (e.kind === 'narrative') return !!NATION[e.id];
    if (e.kind === 'ai') return /^(ko|ja|zh)-[1-3]$/.test(e.id);
    if (e.kind === 'source') return typeof sourcesData !== 'undefined' && sourcesData.some(s => s.id === e.id);
    return false;
  }

  /* ---------- 화면 부분 (브라우저 전용) ---------- */

  let state = null;     // { eventId, step, log: [...], history: [...], turn, requestId }
  let listening = false;
  let seq = 0;          // 호출 번호(모듈 전체) — 사건을 바꾼 뒤 늦게 도착한 옛 응답을 버리기 위해

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const box = () => (typeof document !== 'undefined' ? document.getElementById('askAi') : null);
  const dialogueFor = eventId => {
    const d = typeof fourthNarratorData !== 'undefined' && fourthNarratorData.dialogue ? fourthNarratorData.dialogue[eventId] : null;
    return Array.isArray(d) && d.length >= 3 ? d : null;
  };

  function evidenceLabel(e) {
    if (e.kind === 'narrative') return NATION[e.id] || e.id;
    if (e.kind === 'ai') { const [lang, run] = String(e.id).split('-'); return `AI · ${LANG[lang] || lang} ${run}회차 답변`; }
    const s = typeof sourcesData !== 'undefined' ? sourcesData.find(x => x.id === e.id) : null;
    return s ? `사료 · ${s.title}` : `사료 · ${e.id}`;
  }

  function chipsHtml(evidence) {
    const list = (evidence || []).filter(isValidEvidence);
    if (!list.length) return '';
    return `<div class="nlp-chips ask-chips" aria-label="근거">${list.map(e =>
      `<button type="button" class="nlp-chip ask-chip" data-ask-evidence="${esc(e.kind)}:${esc(e.id)}">${esc(evidenceLabel(e))}</button>`).join('')}</div>`;
  }

  function entryHtml(x) {
    if (x.type === 'student') return `<li class="ask-turn ask-turn--student"><span class="ask-turn__who">내 답</span><p class="ask-turn__text">${esc(x.text)}</p></li>`;
    if (x.type === 'note') return `<li class="ask-turn ask-turn--note" role="status">${esc(x.text)}</li>`;
    // AI 질문·반응
    const who = x.preset
      ? (x.question ? 'AI의 질문 <small>(미리 준비한 질문)</small>' : 'AI의 마무리 <small>(미리 준비한 글)</small>')
      : (x.question ? 'AI의 반응과 질문' : 'AI의 마무리');
    return `<li class="ask-turn ask-turn--ai">
      <span class="ask-turn__who">${who}</span>
      ${x.reply ? `<p class="ask-turn__text">${esc(x.reply)}</p>` : ''}
      ${x.question ? `<p class="ask-turn__q">${esc(x.question)}</p>` : ''}
      ${chipsHtml(x.evidence)}
    </li>`;
  }

  function render() {
    const el = box();
    if (!el || !state) return;
    const idle = state.step === 'idle';
    const waiting = state.step === 'wait1' || state.step === 'wait2';
    const canAnswer = state.step === 'q1' || state.step === 'q2';
    el.innerHTML = `
      <section class="ask-ai" aria-labelledby="askAiTitle">
        <p class="step-head__kicker">③ 질문하는 AI</p>
        <h4 class="section-h section-h--small" id="askAiTitle">이번엔 AI가 묻습니다</h4>
        <p class="ask-ai__desc">세 나라의 서술과 AI 답변을 읽었다면, 이제 AI가 두 번 짧게 묻습니다. 주어가 누구였는지, 무엇이 빠졌는지 직접 말해 보세요. 정답 판정은 없습니다.</p>
        <p class="ask-ai__notice">${esc(NOTICE)}</p>
        ${idle ? `<button type="button" class="btn btn--primary ask-ai__start" data-ask-start>시작</button>` : `
        <ol class="ask-ai__log" aria-live="polite">${state.log.map(entryHtml).join('')}</ol>
        ${waiting ? `<p class="ask-ai__status" role="status" aria-live="polite">AI가 읽고 있습니다…</p>` : ''}
        ${canAnswer ? `
        <form class="ask-ai__form" data-ask-form>
          <label class="ask-ai__label" for="askAiInput">내 답 <small>(${state.turn + 1}/2)</small></label>
          <textarea id="askAiInput" name="answer" maxlength="${MAX_ANSWER + 50}" rows="3" placeholder="자료에서 본 것을 바탕으로 한두 문장으로 써 주세요."></textarea>
          <p class="ask-ai__error" id="askAiError" role="alert" hidden></p>
          <div class="ask-ai__row">
            <button type="submit" class="btn btn--primary btn--small">보내기</button>
            <span class="ask-ai__count"><span id="askAiCount">0</span>/${MAX_ANSWER}자</span>
          </div>
        </form>` : ''}
        ${state.step === 'done' ? `<p class="ask-ai__done" role="status">대화가 끝났습니다. 이 대화는 저장되지 않았습니다.</p>` : ''}`}
      </section>`;
  }

  /** 함수 호출. 어떤 실패든 null (폴백). 성공이면 { reply, question, evidence } — 대상이 없는 근거는 걸러내고, 남는 근거가 없으면 폴백. */
  function callFunction(body) {
    const client = typeof db !== 'undefined' ? db : null;
    if (!client || !client.functions || typeof client.functions.invoke !== 'function') return Promise.resolve(null);
    return client.functions.invoke('ask-ai', { body })
      .then(res => {
        const d = res && !res.error ? res.data : null;
        if (!d || d.fallback || typeof d.reply !== 'string' || !d.reply.trim()) return null;
        const evidence = (Array.isArray(d.evidence) ? d.evidence : []).filter(isValidEvidence);
        return evidence.length ? { reply: d.reply, question: d.question, evidence } : null;
      })
      .catch(() => null);
  }

  function start() {
    const d = dialogueFor(state.eventId);
    if (!d) return;
    state.step = nextState(state.step, 'start');
    state.log.push({ type: 'ai', preset: true, question: d[0].q, evidence: d[0].evidence });
    state.history.push({ role: 'assistant', content: d[0].q });
    render();
    const input = document.getElementById('askAiInput');
    if (input) input.focus();
  }

  function submit(form) {
    const d = dialogueFor(state.eventId);
    if (!d) return;
    const v = validateAnswer(form.answer.value);
    const err = document.getElementById('askAiError');
    if (!v.ok) { if (err) { err.textContent = v.message; err.hidden = false; } return; }
    const turn = state.turn + 1;                       // 1 또는 2
    state.turn = turn;
    state.step = nextState(state.step, 'submit');
    state.log.push({ type: 'student', text: v.text });
    state.history.push({ role: 'user', content: v.text });
    render();
    const requestId = state.requestId = ++seq;
    callFunction({ eventId: state.eventId, turn, history: state.history.slice() }).then(res => {
      if (!state || state.requestId !== requestId) return;          // 사건이 바뀌었거나 초기화됨
      const preset = d[turn];                                        // 폴백용: [1] 두 번째 질문, [2] 마무리
      if (res) {
        const question = turn === 1 ? (res.question || preset.q) : null;
        state.log.push({ type: 'ai', reply: res.reply, question, evidence: res.evidence });
        state.history.push({ role: 'assistant', content: question ? `${res.reply}\n\n${question}` : res.reply });
      } else {
        state.log.push({ type: 'note', text: FALLBACK_NOTE });
        // [1]은 두 번째 질문, [2]는 더 답할 수 없는 자리라 질문이 아닌 마무리 글
        state.log.push(turn === 1
          ? { type: 'ai', preset: true, question: preset.q, evidence: preset.evidence }
          : { type: 'ai', preset: true, reply: preset.q, evidence: preset.evidence });
        state.history.push({ role: 'assistant', content: preset.q });
      }
      state.step = nextState(state.step, 'reply');
      render();
      const input = document.getElementById('askAiInput');
      if (input) input.focus();
    });
  }

  function focusCard(card) {
    if (!card) return;
    document.querySelectorAll('.narrative-card.is-focused, .fourth-card.is-focused').forEach(c => c.classList.remove('is-focused'));
    card.classList.add('is-focused');
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  /** 근거 칩 → 해당 카드로 이동·강조. 대상이 없으면 아무 일도 하지 않습니다. */
  function gotoEvidence(kind, id) {
    if (!isValidEvidence({ kind, id })) return;
    if (kind === 'narrative') {
      const card = document.querySelector(`.narrative-card--${id}`);
      if (!card) return;
      if (typeof gotoTab === 'function') gotoTab('compare');
      focusCard(card);
    } else if (kind === 'ai') {
      const [lang, run] = String(id).split('-');
      const show = document.querySelector(`#fourthNarrator [data-ai-show="${lang}"]`);
      if (show && show.getAttribute('aria-pressed') !== 'true') show.click();     // 좁은 화면: 언어 카드 전환 (다시 그려짐)
      const runBtn = document.querySelector(`#fourthNarrator [data-ai-card="${lang}"] [data-ai-run="${run}"]`);
      if (runBtn && runBtn.getAttribute('aria-pressed') !== 'true') runBtn.click();
      focusCard(document.querySelector(`#fourthNarrator [data-ai-card="${lang}"]`));
    } else if (kind === 'source') {
      if (typeof gotoSource === 'function') gotoSource(id);
    }
  }

  function listen(el) {
    if (listening) return;
    listening = true;
    el.addEventListener('click', e => {
      if (!state) return;
      if (e.target.closest('[data-ask-start]')) { start(); return; }
      const chip = e.target.closest('[data-ask-evidence]');
      if (chip) { const v = chip.dataset.askEvidence; const at = v.indexOf(':'); gotoEvidence(v.slice(0, at), v.slice(at + 1)); }
    });
    el.addEventListener('submit', e => {
      const form = e.target.closest('[data-ask-form]');
      if (!form) return;
      e.preventDefault();
      if (state) submit(form);
    });
    el.addEventListener('input', e => {
      if (e.target.id !== 'askAiInput') return;
      const n = document.getElementById('askAiCount');
      if (n) n.textContent = String(e.target.value.trim().length);
      const err = document.getElementById('askAiError');
      if (err) err.hidden = true;
    });
  }

  /** 네 번째 서술자 탭을 그릴 때마다 부릅니다. 같은 사건이면 진행 중인 대화를 유지합니다. */
  function mount(event) {
    const el = box();
    if (!el) return;
    if (!event || !dialogueFor(event.id)) { state = null; el.innerHTML = ''; return; }
    listen(el);
    if (state && state.eventId === event.id) return;
    state = { eventId: event.id, step: 'idle', turn: 0, log: [], history: [], requestId: 0 };
    render();
  }

  /** 사건이 바뀌면 대화를 비웁니다 (저장하지 않음). */
  function reset() {
    state = null;
    const el = box();
    if (el) el.innerHTML = '';
  }

  return { nextState, validateAnswer, mount, reset, MAX_ANSWER, FALLBACK_NOTE, NOTICE, PII };
});
