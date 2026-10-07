/* ============================================================
   Shared Memory Project — script.js
   화면 렌더링과 이벤트 처리
   · 분석 계산은 nlp-analyzer.js / shared-memory-analyzer.js,
     저장·불러오기는 shared-store.js, 지도 그리기는 memory-map.js가 담당합니다.
   ============================================================ */

let currentEventId = null;
let sharedNarratives = [];
let sharedLanguageFilter = 'all';
let sharedVisibleCount = 20;          // 목록에 한 번에 보여줄 제안 수
let sharedLoadState = 'idle';         // idle | loading | ready | error
let sharedLoadError = '';
let sharedLimited = false;            // 불러오기 상한(500건)에 도달했는지

let eventNlp = null;                  // 현재 사건의 국가별 서술 NLP 결과 (열 때 한 번 계산)
let expressionAnalysis = null;        // 현재 사건의 공동 표현 분석 결과
let selectedClusterId = null;
let draftContext = null;              // 작성 중 실시간 분석용 문맥
let empathyCounts = {};
let empathyAvailable = false;

let memoryAgeFilter = 'all';          // 공동 기억 지도 연령대 필터
let ageParticipantCounts = null;      // 서버 집계: 연령대별 참여자 수 (집계 함수가 없으면 null)
let memoryCache = {};                 // 연령대별로 다시 계산한 분석 결과 (불러올 때마다 초기화)

const Analyzer = window.SharedMemoryAnalyzer || null;
const Gen = window.GenerationAnalysis || null;
const Guide = window.ContributionGuide || { STYLES: [], TEMPLATES: [], REASONS: [] };
const Store = window.SharedStore || null;
const MemoryMap = window.SharedMemoryMap || null;
const SOURCES = typeof sourcesData !== 'undefined' ? sourcesData : [];

function currentEvent() {
  return eventsData.find(e => e.id === currentEventId) || null;
}

function eventNarratives(event) {
  return event ? { korea: event.korea, japan: event.japan, china: event.china } : {};
}

function navigateTo(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.querySelector(`[data-page-name="${pageName}"]`);
  if (targetPage) targetPage.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderEventCards() {
  const grid = document.getElementById('eventsGrid');
  if (!grid) return;

  grid.innerHTML = eventsData.map(event => `
    <div class="event-card" data-event-id="${event.id}" tabindex="0" role="button" aria-label="${escapeAttr(event.title)} 서술 비교 열기">
      <div class="event-card__visual" data-mark="${event.mark}">
        ${event.mark}
      </div>
      <div class="event-card__body">
        <div class="event-card__era">${event.era}</div>
        <h3 class="event-card__title">${event.title}</h3>
        <p class="event-card__desc">${event.shortDesc}</p>
        <div class="event-card__tags">
          ${event.tags.map(tag => `<span class="event-card__tag">${tag}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      openEventDetail(card.dataset.eventId);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') openEventDetail(card.dataset.eventId);
    });
  });
}

function openEventDetail(eventId) {
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;

  currentEventId = eventId;

  document.getElementById('detailHeader').innerHTML = `
    <div class="detail__era">${event.era}</div>
    <h2 class="detail__title">${event.title}</h2>
    <p class="detail__desc">${event.shortDesc}</p>
  `;

  const countries = [
    { key: 'korea', name: '대한민국', en: 'KOREA', flag: '韓', titleField: event.title },
    { key: 'japan', name: '일본', en: 'JAPAN', flag: '日', titleField: event.titleJP },
    { key: 'china', name: '중국', en: 'CHINA', flag: '中', titleField: event.titleCN }
  ];

  document.getElementById('narrativesGrid').innerHTML = countries.map(c => {
    const n = event[c.key];
    return `
      <div class="narrative-card narrative-card--${c.key}">
        <div class="narrative-card__flag">
          <div class="narrative-card__flag-mark">${c.flag}</div>
          <div>
            <div class="narrative-card__country">${c.name}</div>
            <div class="narrative-card__country-en">${c.en} · ${c.titleField}</div>
          </div>
        </div>
        <h4 class="narrative-card__title">${n.title}</h4>
        <p class="narrative-card__text">${n.text}</p>

        <div class="narrative-card__section">
          <div class="narrative-card__label">핵심 키워드</div>
          <div class="narrative-card__keywords">
            ${n.keywords.map(k => `<span class="narrative-card__keyword">${k}</span>`).join('')}
          </div>
        </div>

        <div class="narrative-card__section">
          <div class="narrative-card__label">표현 특징 (편집자 해설)</div>
          <p class="narrative-card__feature">${n.feature}</p>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('timelineTrack').innerHTML = event.timeline.map(t => `
    <div class="timeline__item">
      <div class="timeline__year">${t.year}</div>
      <div class="timeline__text">${t.text}</div>
    </div>
  `).join('');

  document.getElementById('aiResult').classList.remove('show');
  document.getElementById('aiResult').innerHTML = '';

  // 서술 NLP 결과는 작성 가이드·사료 연결·공동 기억 지도에서도 쓰므로 먼저 한 번 계산합니다.
  eventNlp = computeEventNlp(event);
  nlpAnalysis = null;
  nlpSelectedTerm = null;
  beforeEditing = false;
  expressionAnalysis = null;
  selectedClusterId = null;
  sharedNarratives = [];
  empathyCounts = {};
  sharedVisibleCount = 20;
  sourcesFilter = 'all';
  memoryAgeFilter = 'all';
  memoryCache = {};
  ageParticipantCounts = null;
  priorEditing = false;
  loadFlow();
  const next = document.getElementById('submitNext');
  if (next) next.hidden = true;

  switchTab('compare');
  renderBeforeCard();
  renderFlowProgress();
  renderKeywordChart(event);
  renderSourcesTab();
  resetGuide(event);
  rebuildDraftContext();
  updateDraftPanel();
  loadSharedNarratives();
  navigateTo('detail');
  // "Shared Memory 보기"로 들어왔다면 결과(공동 기억 지도) 탭을 먼저 보여줍니다. 다른 탭은 그대로 이동 가능.
  if (eventsMode === 'memory') switchTab('memory');
}

function computeEventNlp(event) {
  if (!window.SharedMemoryNLP) return null;
  try {
    return SharedMemoryNLP.analyzeEventData(event, eventsData);
  } catch (e) {
    console.error('NLP 분석 오류:', e);
    return null;
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.querySelector(`[data-tab-content="${tabName}"]`)?.classList.add('active');

  // 연구용 최소 milestone (클릭 로그는 남기지 않습니다)
  if (tabName === 'ai') markFlow({ viewedNlp: true });
  if (tabName === 'sources') markFlow({ viewedSources: true });
  if (tabName === 'memory' && flow && flow.submitted) markFlow({ viewedResult: true });
  if (tabName === 'compare') watchCompareView(); else stopCompareTimer();

  // 지도는 보이는 상태에서 너비를 재야 하므로 탭을 열 때 다시 그립니다.
  if (tabName === 'memory') renderMemoryTab();
}

/* ------------------------------------------------------------
   권장 탐구 흐름 (진행 표시)
   · 탭 이동을 막거나 잠그지 않습니다. "지금 어디쯤인지 / 다음에 무엇을 하면 되는지"만 보여줍니다.
   · 공동 표현을 등록할 때 연구에 필요한 최소 milestone만 함께 저장합니다.
   ------------------------------------------------------------ */

const FLOW_STEPS = [
  { id: 'select', label: '사건 선택' },
  { id: 'before', label: '처음 생각', hint: '아래에 이 사건에 대한 지금의 생각을 한 문장으로 남겨 보세요. 건너뛰어도 됩니다.' },
  { id: 'compare', label: '서술 탐구', hint: '‘국가별 서술’에서 세 나라의 서술을 차례로 읽어 보세요.' },
  { id: 'shared', label: '공동 표현', hint: '‘공동 표현 작성’에서 나의 공동 표현을 남겨 보세요.' },
  { id: 'result', label: '결과 확인', hint: '‘공동 기억 지도’에서 다른 사람들의 표현과 비교해 보세요.' }
];
const COMPARE_DWELL_MS = 5000;        // 국가별 서술이 화면에 이만큼 보이면 "서술 확인"으로 기록

let flow = null;

function defaultFlow() {
  return { viewedCompare: false, viewedNlp: false, viewedSources: false, submitted: false, viewedResult: false };
}
function flowKey() { return `sm_flow_${currentEventId}`; }

function loadFlow() {
  flow = defaultFlow();
  try {
    const saved = Store ? JSON.parse(Store.storageGet(flowKey()) || '{}') : {};
    Object.keys(flow).forEach(k => { if (typeof saved[k] === 'boolean') flow[k] = saved[k]; });
  } catch (e) { /* 저장된 값이 없거나 손상됨: 처음부터 */ }
}

function markFlow(patch) {
  if (!flow || !currentEventId) return;
  const changed = Object.keys(patch).some(k => flow[k] !== patch[k]);
  if (!changed) return;
  Object.assign(flow, patch);
  if (Store) Store.storageSet(flowKey(), JSON.stringify(flow));
  renderFlowProgress();
}

function flowStepDone(id) {
  if (!flow) return false;
  if (id === 'select') return true;
  if (id === 'before') return !!getBefore() || isBeforeSkipped() || !!getPriorLearning();
  if (id === 'compare') return flow.viewedCompare;
  if (id === 'shared') return flow.submitted;
  if (id === 'result') return flow.submitted && flow.viewedResult;
  return false;
}

function renderFlowProgress() {
  const box = document.getElementById('flowProgress');
  if (!box || !flow) return;
  const current = FLOW_STEPS.find(s => !flowStepDone(s.id));
  const items = FLOW_STEPS.map((step, i) => {
    const done = flowStepDone(step.id);
    const isCurrent = current && current.id === step.id;
    const state = done ? '완료' : (isCurrent ? '지금 단계' : '');
    return `
      <li class="flow-progress__step${done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}">
        <button type="button" data-flow-step="${step.id}"${isCurrent ? ' aria-current="step"' : ''}>
          <span class="flow-progress__num" aria-hidden="true">${done ? '✓' : i + 1}</span>
          <span class="flow-progress__label">${step.label}</span>
          ${state ? `<span class="sr-only"> — ${state}</span>` : ''}
        </button>
      </li>`;
  }).join('');
  const next = current
    ? `<span class="flow-progress__next-label">다음</span> ${current.hint}
       <button type="button" class="before-card__link" data-flow-step="${current.id}">바로 가기</button>`
    : '탐구를 모두 마쳤습니다. 다른 탭을 자유롭게 둘러보거나, 다른 사건도 살펴보세요.';
  box.innerHTML = `
    <ol class="flow-progress__list">${items}</ol>
    <p class="flow-progress__next">${next}</p>`;
}

function gotoFlowStep(id) {
  if (id === 'select') { navigateTo('events'); return; }
  if (id === 'before') {
    const card = document.getElementById('beforeCard');
    if (card && !getBefore() && isBeforeSkipped()) { beforeEditing = true; renderBeforeCard(); }
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('beforeInput')?.focus({ preventScroll: true }), 300);
    return;
  }
  gotoTab({ compare: 'compare', shared: 'shared', result: 'memory' }[id] || 'compare');
}

/* 국가별 서술이 실제로 화면에 일정 시간 보였는지 확인합니다 (단순 탭 열기와 구분). */
let compareObserver = null;
let compareTimer = null;
let compareVisible = false;

function stopCompareTimer() { clearTimeout(compareTimer); compareTimer = null; }

function startCompareTimer() {
  if (compareTimer || !flow || flow.viewedCompare) return;
  const eventId = currentEventId;
  compareTimer = setTimeout(() => {
    compareTimer = null;
    if (eventId === currentEventId && compareVisible && document.querySelector('[data-tab-content="compare"].active')) {
      markFlow({ viewedCompare: true });
    }
  }, COMPARE_DWELL_MS);
}

function watchCompareView() {
  const grid = document.getElementById('narrativesGrid');
  if (!grid) return;
  if (!('IntersectionObserver' in window)) { markFlow({ viewedCompare: true }); return; }
  if (!compareObserver) {
    compareObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        // 서술 카드가 화면의 상당 부분(카드 높이의 절반 또는 화면 높이의 35%)을 차지할 때만 "보는 중"으로 봅니다.
        const need = Math.min(entry.boundingClientRect.height * 0.5, window.innerHeight * 0.35);
        compareVisible = entry.isIntersecting && entry.intersectionRect.height >= need;
        if (compareVisible && document.querySelector('.page--detail.active')) startCompareTimer();
        else stopCompareTimer();
      });
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    compareObserver.observe(grid);
  }
  if (compareVisible) startCompareTimer();
}

function gotoTab(tabName) {
  switchTab(tabName);
  document.querySelector('.tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------
   탐구 전 한 문장 (BEFORE)
   · 국가별 서술을 읽기 전에 적어 두면, 공동 표현(AFTER)과 비교합니다.
   · 이 브라우저에만 임시 저장되고, 공동 표현을 등록할 때 before_content로 함께 저장됩니다.
   ------------------------------------------------------------ */

let beforeEditing = false;

function beforeKey(kind) { return `sm_before_${kind || ''}${currentEventId}`; }
function getBefore() { return (Store && Store.storageGet(beforeKey())) || ''; }
function setBefore(value) { if (Store) Store.storageSet(beforeKey(), value); }
function isBeforeSkipped() { return !!(Store && Store.storageGet(beforeKey('skip_'))); }

/* 이 사건을 이전에 배우거나 접한 경험 (사건마다 한 번, 이 브라우저에만 임시 저장 → 등록 시 prior_learning) */
let priorEditing = false;
function getPriorLearning() {
  const v = Store ? Store.storageGet(beforeKey('prior_')) : null;
  return Gen ? Gen.normalizePriorLearning(v) : null;
}
function setPriorLearning(value) { if (Store) Store.storageSet(beforeKey('prior_'), value); }

function renderPriorQuestion() {
  if (!Gen) return '';
  const value = getPriorLearning();
  if (value && !priorEditing) {
    return `
      <div class="before-card__prior is-answered">
        <span class="before-card__prior-q">이 사건을 이전에 배우거나 접한 경험</span>
        <span class="before-card__text">${escapeHtml(Gen.priorLabel(value))}</span>
        <button type="button" class="before-card__link" data-prior-action="edit">변경</button>
      </div>`;
  }
  return `
    <div class="before-card__prior">
      <span class="before-card__prior-q" id="priorQuestion">이 사건을 이전에 배워보거나 자세히 접한 적이 있나요? <small>(선택)</small></span>
      <div class="age-picker__options age-picker__options--compact" role="group" aria-labelledby="priorQuestion">
        ${Gen.PRIOR_LEARNING.map(p => `<button type="button" class="age-chip${value === p.id ? ' is-selected' : ''}" aria-pressed="${value === p.id}" data-prior-value="${p.id}">${escapeHtml(p.label)}</button>`).join('')}
      </div>
    </div>`;
}

function handlePriorAnswer(value) {
  setPriorLearning(value);
  priorEditing = false;
  renderBeforeCard();
  renderFlowProgress();
}

function renderBeforeCard() {
  const box = document.getElementById('beforeCard');
  if (!box) return;
  const saved = getBefore();

  if (saved && !beforeEditing) {
    box.className = 'before-card is-saved';
    box.innerHTML = `
      <span class="before-card__label">탐구 전 나의 한 문장</span>
      <span class="before-card__text">“${escapeHtml(saved)}”</span>
      <button type="button" class="before-card__link" data-before-action="edit">수정</button>
      ${renderPriorQuestion()}`;
    return;
  }
  if (isBeforeSkipped() && !beforeEditing) {
    box.className = 'before-card is-collapsed';
    box.innerHTML = `
      <span class="before-card__hint">서술을 읽기 전의 생각을 한 문장으로 남겨 두면, 나중에 공동 표현과 비교해 생각의 변화를 볼 수 있어요.</span>
      <button type="button" class="before-card__link" data-before-action="edit">지금 적기</button>
      ${renderPriorQuestion()}`;
    return;
  }
  box.className = 'before-card';
  box.innerHTML = `
    <div class="before-card__head">
      <span class="before-card__label">탐구 전 한 문장 <small>(선택)</small></span>
      <p class="before-card__desc">국가별 서술을 읽기 전에, 지금 알고 있는 내용만으로 이 사건을 한 문장으로 표현해 주세요.</p>
    </div>
    <div class="before-card__row">
      <input type="text" id="beforeInput" class="shared-form__input" maxlength="500" value="${escapeAttr(saved)}" placeholder="예: 일본이 조선을 침략한 전쟁" aria-label="탐구 전 한 문장" />
      <button type="button" class="btn btn--small" data-before-action="save">저장</button>
      <button type="button" class="before-card__link" data-before-action="skip">건너뛰기</button>
    </div>
    <p class="before-card__note">이 브라우저에만 임시로 저장되며, 공동 표현을 등록할 때 함께 저장되어 탐구 전·후 변화 분석에 쓰입니다.</p>
    ${renderPriorQuestion()}`;
}

function handleBeforeAction(action) {
  if (action === 'edit') {
    beforeEditing = true;
    renderBeforeCard();
    document.getElementById('beforeInput')?.focus();
    return;
  }
  if (action === 'save') {
    const value = (document.getElementById('beforeInput')?.value || '').trim();
    setBefore(value);
    beforeEditing = false;
    if (!value && Store) Store.storageSet(beforeKey('skip_'), '1');
  }
  if (action === 'skip') {
    if (Store) Store.storageSet(beforeKey('skip_'), '1');
    beforeEditing = false;
  }
  renderBeforeCard();
  renderFlowProgress();
  updateDraftPanel();
}

/* ------------------------------------------------------------
   NLP 비교 분석 (nlp-analyzer.js 사용)
   · 결과는 events-data.js의 서술 텍스트로부터 매번 계산됩니다.
   ------------------------------------------------------------ */

const NLP_COUNTRIES = [
  { key: 'korea', name: '한국', flag: '韓' },
  { key: 'japan', name: '일본', flag: '日' },
  { key: 'china', name: '중국', flag: '中' }
];

let nlpAnalysis = null;      // 마지막으로 계산된 분석 결과
let nlpSelectedTerm = null;  // 근거 확인 패널에서 강조할 표현 ('concept:ID'이면 개념 사전 기준)

function nlpCountryName(key) {
  return (NLP_COUNTRIES.find(c => c.key === key) || {}).name || key;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function formatNum(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function runAIAnalysis() {
  const event = currentEvent();
  if (!event) return;

  const resultBox = document.getElementById('aiResult');
  resultBox.classList.add('show');

  if (!window.SharedMemoryNLP) {
    resultBox.innerHTML = `<div class="shared-empty">분석 모듈(nlp-analyzer.js)을 불러오지 못했습니다.</div>`;
    return;
  }

  nlpAnalysis = eventNlp || SharedMemoryNLP.analyzeEventData(event, eventsData);
  if (!nlpSelectedTerm || !nlpTermExists(nlpSelectedTerm)) {
    nlpSelectedTerm = nlpAnalysis.common[0]?.term || nlpAnalysis.keywords.korea[0]?.term || null;
  }

  resultBox.innerHTML = `
    ${renderNLPAnalysis(nlpAnalysis)}
    ${renderEditorNotes(editorNotes[event.id])}
    ${renderMultilingualSection()}
    <div class="nlp-next">
      <p>분석 결과와 관련 사료를 참고해, 서로 다른 관점을 함께 담을 수 있는 표현을 직접 제안해 보세요.</p>
      <button type="button" class="btn btn--primary" data-goto-tab="shared">공동 표현 제안하러 가기 →</button>
    </div>
  `;
}

function nlpTermExists(term) {
  if (!nlpAnalysis || !term) return false;
  if (term.indexOf('concept:') === 0) return true;
  const counts = nlpAnalysis.countsFor(term);
  return NLP_COUNTRIES.some(c => counts[c.key] > 0);
}

function nlpChip(term, country, extra = '', label = null) {
  const selected = term === nlpSelectedTerm ? ' is-selected' : '';
  const tone = country ? ` nlp-chip--${country}` : '';
  return `<button type="button" class="nlp-chip${tone}${selected}" data-nlp-term="${escapeAttr(term)}" title="원문에서 근거 보기">${escapeHtml(label == null ? term : label)}${extra}</button>`;
}

function nlpCountsLabel(counts) {
  return NLP_COUNTRIES.map(c => `${c.name} ${counts[c.key]}`).join(' · ');
}

function renderNLPAnalysis(a) {
  const statLine = NLP_COUNTRIES.map(c =>
    `${c.name} ${a.stats[c.key].tokens}개 어휘 토큰(서로 다른 어휘 ${a.stats[c.key].uniqueTerms}개)`
  ).join(' / ');

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading"><span>⌬</span><span>분석 개요</span></div>
      <ul class="ai-result__list">
        <li>분석 대상: 각 국가 서술의 제목과 본문 — ${statLine}</li>
        <li>가중치 기준: 사이트에 등록된 전체 서술 ${a.meta.corpusSize}개를 말뭉치로 사용해, 여러 서술에 흔히 나오는 단어의 비중을 낮춥니다.</li>
        <li>아래의 모든 단어 칩을 누르면 <strong>5. 근거 확인</strong>에서 해당 표현이 원문 어디에 쓰였는지, 그리고 연결된 사료가 무엇인지 보여줍니다.</li>
      </ul>
    </div>
    ${renderNLPKeywords(a)}
    ${renderNLPCommon(a)}
    ${renderNLPDistinctive(a)}
    ${renderNLPSimilarity(a)}
    <div class="ai-result__section">
      <div class="ai-result__heading"><span>⌕</span><span>5. 근거 확인 — 원문에서 표현 찾기</span></div>
      <div id="nlpEvidence">${renderNLPEvidence()}</div>
    </div>
    ${renderNLPEmphasis(a)}
    ${renderNLPMethod(a)}
  `;
}

function renderNLPKeywords(a) {
  const cols = NLP_COUNTRIES.map(c => {
    const list = a.keywords[c.key];
    const max = list.length ? list[0].score : 1;
    const rows = list.map(k => `
      <li class="nlp-row">
        ${nlpChip(k.term, c.key)}
        <span class="nlp-bar"><span class="nlp-bar__fill nlp-bar__fill--${c.key}" style="width:${Math.round(k.score / max * 100)}%"></span></span>
        <span class="nlp-meta" title="TF(등장 횟수) × IDF(희소성)">${k.tf}회 × ${formatNum(k.idf)} = ${formatNum(k.score)}</span>
      </li>`).join('');
    return `
      <div class="nlp-col nlp-col--${c.key}">
        <div class="nlp-col__head">${c.flag} ${c.name} 서술</div>
        <ul class="nlp-rows">${rows || '<li class="nlp-meta">추출된 어휘가 없습니다.</li>'}</ul>
      </div>`;
  }).join('');

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading"><span>★</span><span>1. 국가별 핵심 키워드 (TF-IDF)</span></div>
      <p class="nlp-desc">해당 서술에서 자주 쓰이면서(TF) 다른 서술에서는 드문(IDF) 단어일수록 점수가 높습니다.</p>
      <div class="nlp-grid">${cols}</div>
    </div>`;
}

function renderNLPCommon(a) {
  const commonHtml = a.common.length
    ? a.common.map(e => nlpChip(e.term, null, `<small>${nlpCountsLabel(e.counts)}</small>`)).join('')
    : '<span class="nlp-meta">세 서술에 모두 등장하는 표현이 없습니다.</span>';

  const pairHtml = SharedMemoryNLP.PAIRS.map(([x, y]) => {
    const list = a.pairShared[`${x}-${y}`].slice(0, 6);
    const chips = list.length
      ? list.map(e => nlpChip(e.term, null, `<small>${nlpCountsLabel(e.counts)}</small>`)).join('')
      : '<span class="nlp-meta">없음</span>';
    return `<div class="nlp-pair"><div class="nlp-pair__label">${nlpCountryName(x)}–${nlpCountryName(y)}만</div><div class="nlp-chips">${chips}</div></div>`;
  }).join('');

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading"><span>∩</span><span>2. 세 국가 서술의 공통 표현</span></div>
      <p class="nlp-desc">세 서술 모두에 등장한 단어·2어절 표현입니다. 숫자는 국가별 등장 횟수입니다.</p>
      <div class="nlp-chips">${commonHtml}</div>
      <p class="nlp-desc nlp-desc--sub">두 국가만 함께 쓰고 나머지 한 국가는 쓰지 않은 표현</p>
      ${pairHtml}
    </div>`;
}

function renderNLPDistinctive(a) {
  const cols = NLP_COUNTRIES.map(c => {
    const rows = a.distinctive[c.key].map(d => {
      const others = Object.entries(d.otherCounts).map(([k, v]) => `${nlpCountryName(k)} ${v}`).join('·');
      return `
        <li class="nlp-row nlp-row--stack">
          <div>${nlpChip(d.term, c.key)}${d.exclusive ? '<span class="nlp-badge">단독 사용</span>' : ''}</div>
          <span class="nlp-meta">${c.name} ${d.count}회 / ${others}회 · 상대 빈도 ${formatNum(d.ratio, 1)}배</span>
        </li>`;
    }).join('');
    return `
      <div class="nlp-col nlp-col--${c.key}">
        <div class="nlp-col__head">${c.flag} ${c.name} 서술에서 두드러지는 표현</div>
        <ul class="nlp-rows">${rows || '<li class="nlp-meta">두드러지는 표현이 없습니다.</li>'}</ul>
      </div>`;
  }).join('');

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading"><span>≠</span><span>3. 국가별 특징적 표현</span></div>
      <p class="nlp-desc">한 국가의 서술에서 나머지 두 국가보다 상대적으로 많이 쓰인 표현입니다. 여러 번 반복된 표현일수록 위에 놓입니다.</p>
      <div class="nlp-grid">${cols}</div>
    </div>`;
}

function renderNLPSimilarity(a) {
  const sorted = a.similarity.slice().sort((x, y) => y.cosine - x.cosine);
  const pairName = s => `${nlpCountryName(s.pair[0])}–${nlpCountryName(s.pair[1])}`;
  const summary = sorted[0].cosine === sorted[sorted.length - 1].cosine
    ? '세 쌍의 어휘 유사도가 같습니다.'
    : `세 쌍 가운데 <strong>${pairName(sorted[0])}</strong> 서술의 어휘가 가장 가깝고(${formatNum(sorted[0].cosine)}), <strong>${pairName(sorted[sorted.length - 1])}</strong> 서술이 가장 멉니다(${formatNum(sorted[sorted.length - 1].cosine)}).`;

  const rows = a.similarity.map(s => {
    const contrib = s.contributions.length
      ? s.contributions.map(c => nlpChip(c.term, null, `<small>+${formatNum(c.contribution, 3)}</small>`)).join('')
      : '<span class="nlp-meta">공유 어휘 없음</span>';
    return `
      <div class="nlp-sim">
        <div class="nlp-sim__label">${pairName(s)}</div>
        <div class="nlp-sim__bars">
          <div class="nlp-sim__metric">
            <span>코사인</span>
            <span class="nlp-bar"><span class="nlp-bar__fill" style="width:${Math.round(s.cosine * 100)}%"></span></span>
            <strong>${formatNum(s.cosine)}</strong>
          </div>
          <div class="nlp-sim__metric">
            <span>Jaccard</span>
            <span class="nlp-bar"><span class="nlp-bar__fill nlp-bar__fill--soft" style="width:${Math.round(s.jaccard * 100)}%"></span></span>
            <strong>${formatNum(s.jaccard)}</strong>
          </div>
          <div class="nlp-meta">공유 어휘 ${s.sharedTerms.length}개 / 전체 어휘 ${s.unionSize}개 · 유사도에 기여한 단어:</div>
          <div class="nlp-chips">${contrib}</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading"><span>≈</span><span>4. 서술 간 텍스트 유사도</span></div>
      <p class="nlp-desc">${summary}<br />
        <small>코사인 유사도는 TF-IDF 가중치 기준(0~1), Jaccard는 어휘 집합이 겹치는 비율입니다. 서술이 짧아 값이 전반적으로 낮게 나오므로 세 쌍을 서로 비교해 읽는 것이 좋습니다.</small></p>
      ${rows}
    </div>`;
}

function highlightSpans(text, spans) {
  const sorted = spans.slice().sort((x, y) => x[0] - y[0]);
  let html = '';
  let pos = 0;
  sorted.forEach(([start, end]) => {
    if (start < pos) return;
    html += escapeHtml(text.slice(pos, start)) + `<mark class="nlp-mark">${escapeHtml(text.slice(start, end))}</mark>`;
    pos = end;
  });
  html += escapeHtml(text.slice(pos));

  // 첫 줄은 서술 제목입니다.
  const lineBreak = html.indexOf('\n');
  return lineBreak < 0
    ? html
    : `<strong>${html.slice(0, lineBreak)}</strong><br />${html.slice(lineBreak + 1).replace(/\n/g, '<br />')}`;
}

/** 선택한 표현(단어 또는 'concept:ID')의 원문 위치와 국가별 등장 수 */
function evidenceFor(term) {
  const empty = { label: term, occ: { korea: [], japan: [], china: [] }, counts: { korea: 0, japan: 0, china: 0 }, isConcept: false };
  if (!term || !nlpAnalysis) return empty;
  if (term.indexOf('concept:') === 0) {
    const id = term.slice(8);
    const concept = Analyzer && Analyzer.CONCEPTS.find(c => c.id === id);
    if (!concept) return empty;
    const occ = {}, counts = {};
    NLP_COUNTRIES.forEach(c => {
      occ[c.key] = Analyzer.matchForms(nlpAnalysis.texts[c.key], concept.forms.ko || []).spans;
      counts[c.key] = occ[c.key].length;
    });
    return { label: concept.label, occ, counts, isConcept: true, concept };
  }
  return { label: term, occ: nlpAnalysis.occurrences(term), counts: nlpAnalysis.countsFor(term), isConcept: false };
}

function renderNLPEvidence() {
  if (!nlpAnalysis) return '';

  const term = nlpSelectedTerm;
  const ev = evidenceFor(term);

  const head = term
    ? `<p class="nlp-desc">선택한 ${ev.isConcept ? '개념' : '표현'} <strong>“${escapeHtml(ev.label)}”</strong> — ${nlpCountsLabel(ev.counts)}회 등장 <small>${ev.isConcept
      ? `(개념 사전 기준: ${escapeHtml((ev.concept.forms.ko || []).join('·'))})`
      : '(조사·어미를 떼어낸 기본형 기준, 원문은 어절 단위로 강조)'}</small></p>`
    : '<p class="nlp-desc">위의 단어를 선택하면 원문에서 위치를 보여줍니다.</p>';

  const cols = NLP_COUNTRIES.map(c => `
    <div class="nlp-col nlp-col--${c.key}">
      <div class="nlp-col__head">${c.flag} ${c.name} 서술 <span class="nlp-meta">(${ev.counts[c.key]}회)</span></div>
      <p class="nlp-evidence__text">${highlightSpans(nlpAnalysis.texts[c.key], ev.occ[c.key])}</p>
    </div>`).join('');

  return `${head}<div class="nlp-grid">${cols}</div>${renderEvidenceSources(term)}`;
}

/** NLP 결과 → 원문 위치 → 관련 사료 (sources-data.js의 relatedTerms로 사람이 검증한 연결) */
function renderEvidenceSources(term) {
  if (!term) return '';
  const list = sourcesForTerm(currentEventId, term);
  const body = list.length
    ? list.map(s => `<button type="button" class="source-link" data-goto-source="${escapeAttr(s.id)}">${escapeHtml(s.title)} <small>${escapeHtml(sourceTypeLabel(s.sourceType))} · ${escapeHtml(s.year || '')}</small></button>`).join('')
    : '<span class="nlp-meta">이 표현과 연결된 자료가 아직 등록되지 않았습니다.</span>';
  return `
    <div class="evidence-sources">
      <div class="nlp-desc nlp-desc--sub">이 표현과 연결된 관련 사료·자료</div>
      <div class="nlp-chips">${body}</div>
      <p class="nlp-meta">연결은 자동 추정이 아니라 자료마다 편집자가 지정한 관련 표현(relatedTerms)을 기준으로 합니다.</p>
    </div>`;
}

function selectNLPTerm(term) {
  nlpSelectedTerm = term;
  document.querySelectorAll('#aiResult [data-nlp-term]').forEach(chip => {
    chip.classList.toggle('is-selected', chip.dataset.nlpTerm === term);
  });
  const evidence = document.getElementById('nlpEvidence');
  if (evidence) {
    evidence.innerHTML = renderNLPEvidence();
    evidence.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* 6. 서술 강조점 비교 — 개념 사전 기준 언급 밀도 (편향 탐지가 아님) */
function renderNLPEmphasis(a) {
  if (!Analyzer) return '';
  const profile = Analyzer.emphasisProfile(a.texts);
  if (!profile.rows.length) return '';
  const dots = level => [1, 2, 3].map(i => `<span class="emph-dot${i <= level ? ' is-on' : ''}"></span>`).join('');
  const rows = profile.rows.map(r => `
    <div class="emph-row">
      <div class="emph-row__label">${nlpChip('concept:' + r.id, null, '', r.label)}</div>
      ${NLP_COUNTRIES.map(c => `
        <div class="emph-cell emph-cell--${c.key}" title="${c.name} 서술 ${r.counts[c.key]}회">
          <span class="emph-cell__name">${c.name}</span>
          <span class="emph-dots" aria-label="${c.name} ${r.counts[c.key]}회, 강조 수준 ${r.levels[c.key]}/3">${dots(r.levels[c.key])}</span>
          <span class="nlp-meta">${r.counts[c.key]}회</span>
        </div>`).join('')}
    </div>`).join('');

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading"><span>◎</span><span>6. 서술 강조점 비교 — 관점별 강조 요소</span></div>
      <p class="nlp-desc">각 서술이 어떤 요소를 얼마나 언급하는지 개념 사전 기준으로 비교합니다. ●의 개수는 서술 길이 대비 언급 밀도를 세 서술 중 가장 높은 값 기준 3단계로 나타낸 것입니다.<br />
        <small>이는 편향 탐지가 아닙니다. 어떤 요소를 덜 언급했다고 해서 왜곡이라고 판단할 수 없으며, 부정문(“굴종이 아닌”)도 언급으로 셉니다. 한 서술에서만 언급된 요소부터 보여줍니다.</small></p>
      <div class="emph-table">${rows}</div>
    </div>`;
}

function renderNLPMethod(a) {
  return `
    <details class="ai-result__section nlp-method">
      <summary class="ai-result__heading"><span>?</span><span>분석 방법 자세히 보기</span></summary>
      <ul class="ai-result__list">
        <li><strong>전처리</strong>: 문장을 어절로 나누고, 규칙 기반으로 조사·어미를 떼어 기본형으로 맞춥니다(예: “일본군을”→“일본군”, “희생되었다”→“희생”). 의미가 약한 기능어는 제외합니다.</li>
        <li><strong>핵심 키워드</strong>: TF-IDF = 등장 횟수 × IDF, IDF = ln((1+N)/(1+df))+1 (N = 전체 서술 ${a.meta.corpusSize}개, df = 그 단어가 나온 서술 수).</li>
        <li><strong>공통 표현</strong>: 세 서술에 모두 한 번 이상 나온 단어와 이어진 2어절 표현.</li>
        <li><strong>특징적 표현</strong>: 해당 국가의 상대 빈도 ÷ 나머지 두 국가의 상대 빈도(가산 평활 α=${a.meta.alpha}). 정렬은 로그 오즈비를 표준오차로 나눈 z-점수 기준이라, 한 번만 나온 단어보다 반복된 단어를 더 신뢰합니다.</li>
        <li><strong>유사도</strong>: 두 서술의 TF-IDF 벡터 사이 코사인 값. 각 공유 단어의 기여도를 모두 더하면 코사인 값과 같습니다. Jaccard = 공통 어휘 수 ÷ 전체 어휘 수.</li>
        <li><strong>서술 강조점</strong>: 사람이 만든 다국어 개념 사전(concept-lexicon.js)의 한국어 표현이 각 서술에 나온 횟수 ÷ 서술의 어휘 토큰 수. 세 서술 중 최댓값을 3으로 두고 반올림합니다(언급이 있으면 최소 1).</li>
        <li><strong>사료 연결</strong>: 자료마다 편집자가 지정한 관련 표현(relatedTerms)과 선택한 표현이 일치하거나 포함 관계일 때 연결합니다.</li>
        <li><strong>한계</strong>: 형태소 분석기가 아닌 규칙 기반 처리라 일부 활용형이 남거나 잘릴 수 있고, 개념 사전에 없는 동의어는 서로 다른 단어로 계산됩니다. 결과는 어휘 선택의 경향을 보여줄 뿐, 역사 해석의 옳고 그름을 판정하지 않습니다.</li>
      </ul>
    </details>`;
}

function renderEditorNotes(data) {
  if (!data) return '';
  const list = items => items.map(item => `<li>${item}</li>`).join('');
  return `
    <details class="ai-result__section nlp-editor">
      <summary class="ai-result__heading"><span>✎</span><span>참고: 편집자 해설 (사람이 작성한 해석 · 자동 분석 결과 아님)</span></summary>
      <p class="nlp-desc nlp-desc--sub">공통점</p>
      <ul class="ai-result__list">${list(data.common)}</ul>
      <p class="nlp-desc nlp-desc--sub">핵심 차이점</p>
      <ul class="ai-result__list">${list(data.diff)}</ul>
      <p class="nlp-desc nlp-desc--sub">표현 특징</p>
      <ul class="ai-result__list">${list(data.feature)}</ul>
    </details>`;
}

// 편집자 해설: 사람이 작성한 사건별 해석입니다. (자동 분석 결과와 구분해 표시)
const editorNotes = {
  'imjin': {
    common: [
      '세 국가 모두 1592–1598년의 사건임에는 일치하며, 일본의 군사 행동이 시작이었다는 사실 자체는 부정하지 않는다.',
      '명나라의 참전이 전쟁의 향방을 바꾼 중요 변수였다는 점도 공통적으로 인정한다.'
    ],
    diff: [
      '한국: "침략"이라는 가치 평가가 들어간 용어를 사용한다.',
      '일본: "침략" 대신 "출병"·"진출"이라는 표현을 사용해 행위의 성격 규정을 드러내지 않는다.',
      '중국: "왜에 맞서 조선을 도왔다"는 구원자적 위치를 강조한다.'
    ],
    feature: [
      '한국은 저항과 피해의 서사를 강조한다.',
      '일본은 군사 행동과 문화 교류의 결과를 강조한다.',
      '중국은 동아시아 질서 수호와 명나라의 역할을 강조한다.'
    ]
  },
  'culture': {
    common: [
      '문화 교류가 일방향이 아닌 다방향이었다는 사실은 세 국가 모두 인정한다.',
      '한자·불교·유교가 동아시아 공통 문화 기반이라는 점에 합의한다.'
    ],
    diff: [
      '한국: 문화 전파의 교량 역할을 강조한다.',
      '일본: 주체적 수용과 변용을 강조한다.',
      '중국: 문명의 중심이자 발신자 역할을 강조한다.'
    ],
    feature: [
      '같은 문화 교류를 두고 각국은 자신을 서로 다른 위치에 놓는다.',
      '한국은 중계자, 일본은 수용자이자 변용자, 중국은 발신자로 서술한다.'
    ]
  },
  'tribute': {
    common: [
      '동아시아에 중국 중심의 국제 질서가 존재했다는 사실 자체는 부정되지 않는다.',
      '조공 체제가 19세기 말 서구의 충격으로 붕괴되었다는 점도 공통적으로 나타난다.'
    ],
    diff: [
      '한국: 조공을 실리 외교로 재해석한다.',
      '일본: 조공 체제에서 벗어난 독자성을 강조한다.',
      '중국: 조공을 조화로운 천하 질서로 설명한다.'
    ],
    feature: [
      '같은 제도를 두고 실리, 이탈, 조화라는 서로 다른 평가가 나타난다.',
      '평가 어휘의 차이가 국제 질서를 보는 관점의 차이를 드러낸다.'
    ]
  },
  'modern': {
    common: [
      '19세기 서구 열강의 충격이 동아시아 근대화의 출발점이었다는 점에 일치한다.',
      '각국이 자강을 위한 개혁을 시도했다는 사실도 공통적이다.'
    ],
    diff: [
      '한국: 자주적 근대화의 좌절을 강조한다.',
      '일본: 메이지 유신의 성공을 강조한다.',
      '중국: 백 년의 치욕과 민족 부흥 서사를 강조한다.'
    ],
    feature: [
      '같은 시대를 한국은 비극, 일본은 성공, 중국은 굴욕으로 기억한다.',
      '근대화 서술은 각국의 현재 역사 인식과 깊게 연결된다.'
    ]
  },
  'zainichi': {
    common: [
      '세 국가 모두 재일조선인이 일본 제국주의 시기와 전후 일본 사회의 변화 속에서 형성된 집단이라는 점은 인정한다.',
      '국적, 정체성, 차별 문제가 재일조선인 서술의 핵심 쟁점이라는 점도 공통적으로 나타난다.'
    ],
    diff: [
      '한국: 식민지 지배와 강제 동원의 결과로 보며 피해와 권리 회복을 강조한다.',
      '일본: 전후 일본 사회의 외국인 주민 문제로 보며 제도와 통합을 강조한다.',
      '중국: 일본 제국주의가 남긴 동아시아 문제로 보며 역사 책임을 강조한다.'
    ],
    feature: [
      '한국 서술은 식민지 지배와 차별이라는 역사적 책임의 언어를 사용한다.',
      '일본 서술은 특별영주자·지역사회처럼 행정적 표현을 선호한다.',
      '중국 서술은 재일조선인을 동아시아 반제국주의 역사 인식의 사례로 연결한다.'
    ]
  },
  'hiroshima': {
    common: [
      '세 국가 모두 히로시마 원폭이 대규모 민간인 피해를 낳은 사건이라는 점은 인정한다.',
      '조선인 피해자의 존재는 전쟁 피해와 식민지 동원을 함께 보게 만드는 중요한 지점이다.'
    ],
    diff: [
      '한국: 조선인 피해자를 강제 동원과 식민지 지배의 맥락에서 설명한다.',
      '일본: 핵무기의 참혹성과 평화의 중요성을 중심으로 설명한다.',
      '중국: 일본 군국주의와 전쟁 책임의 결과로 해석한다.'
    ],
    feature: [
      '한국 서술은 해방과 피해가 동시에 존재한 복합적 기억을 강조한다.',
      '일본 서술은 반핵·평화 담론이 강하지만 식민지 피해자의 위치는 약해질 수 있다.',
      '중국 서술은 원폭 피해를 일본의 전쟁 책임과 분리하지 않고 해석한다.'
    ]
  }
};

/** NLP 분석 탭 하단의 공동 표현 요약 (자세한 결과는 "공동 기억 지도" 탭) */
function renderMultilingualSection() {
  const result = runMultilingualAnalysis();

  if (result.empty) {
    return `
      <div class="ai-result__section">
        <div class="ai-result__heading">
          <span>⇄</span>
          <span>다국어 공동 표현 분석</span>
        </div>
        <ul class="ai-result__list">
          <li>${result.message}</li>
        </ul>
      </div>
    `;
  }

  const a = result.analysis;
  const frames = Analyzer.FRAMES;
  const langRows = ['ko', 'ja', 'en', 'unknown'].filter(l => a.byLanguage[l] > 0).map(lang => {
    const badge = getLangBadge(lang);
    const f = a.framing.byLanguage[lang] || {};
    const frameText = frames.map(fr => `${fr.short} ${f[fr.id] || 0}`).join(' · ');
    return `<li>${badge.flag} ${badge.label} — 제안 ${a.byLanguage[lang]}건 <span class="nlp-meta">(표현 프레임 어휘: ${frameText})</span></li>`;
  }).join('');

  const concepts = a.topConcepts.slice(0, 6).map(c => `<li>“${escapeHtml(c.label)}” — ${c.count}건의 제안에서 등장 <span class="nlp-meta">(${c.langs.map(l => getLangBadge(l).label).join('·')})</span></li>`).join('')
    || '<li>아직 개념 사전과 일치하는 표현이 충분히 등장하지 않았습니다.</li>';

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading">
        <span>⇄</span>
        <span>다국어 공동 표현 분석 (총 ${a.total}건)</span>
      </div>
      <ul class="ai-result__list">${langRows}</ul>
    </div>

    <div class="ai-result__section">
      <div class="ai-result__heading">
        <span>∞</span>
        <span>언어를 가로지르는 공통 개념</span>
      </div>
      <p class="nlp-desc">다국어 개념 사전으로 한국어·일본어·영어 표현을 같은 개념으로 묶어 셉니다. (예: 침략 · 侵略 · invasion)</p>
      <ul class="ai-result__list">${concepts}</ul>
      <button type="button" class="nlp-chip" data-goto-tab="memory">공동 기억 지도에서 표현군 보기 →</button>
    </div>
  `;
}

function runMultilingualAnalysis() {
  if (!Analyzer) return { empty: true, message: '공동 표현 분석 모듈(shared-memory-analyzer.js)을 불러오지 못했습니다.' };
  if (sharedLoadState === 'loading') return { empty: true, message: '공동 표현을 불러오는 중입니다. 잠시 후 다시 실행해 주세요.' };
  const a = expressionAnalysis;
  if (!a || a.total === 0) {
    return {
      empty: true,
      message: '아직 등록된 공동 표현 제안이 없습니다. "공동 표현 작성" 탭에서 한국어·일본어·영어 어떤 언어로든 표현을 등록해 주세요.'
    };
  }
  return { empty: false, analysis: a, totalCount: a.total };
}

/* ------------------------------------------------------------
   키워드 비교 차트
   · events-data.js의 keywordGroups(표현 묶음)를 서술 원문에서 실제로 세어 그립니다.
   ------------------------------------------------------------ */

function renderKeywordChart(event) {
  const chart = document.getElementById('keywordsChart');
  if (!chart) return;

  let rows = [];
  let manual = false;
  if (event.keywordGroups && Analyzer) {
    rows = Analyzer.keywordGroupCounts(event).map(g => ({
      label: g.label,
      counts: g.counts,
      sub: `묶음: ${g.forms.join(' · ')}`
    }));
  } else if (event.keywordFreq) {
    // 예전 형식(사람이 입력한 숫자)이 남아 있는 경우 — 수동 입력값임을 표시합니다.
    manual = true;
    rows = Object.entries(event.keywordFreq).map(([label, counts]) => ({ label, counts, sub: '수동 입력값' }));
  }

  if (!rows.length) {
    chart.innerHTML = '<div class="shared-empty">이 사건에는 비교할 키워드 묶음이 아직 없습니다.</div>';
    return;
  }

  const max = Math.max(1, ...rows.map(r => Math.max(r.counts.korea, r.counts.japan, r.counts.china)));
  const bar = (key, name, value) => `
        <div class="keyword-bar">
          <div class="keyword-bar__country keyword-bar__country--${key}">${name}</div>
          <div class="keyword-bar__track">
            <div class="keyword-bar__fill keyword-bar__fill--${key}" data-width="${Math.round(value / max * 100)}"></div>
          </div>
          <div class="keyword-bar__value">${value}${manual ? '' : '회'}</div>
        </div>`;

  chart.innerHTML = rows.map(r => `
    <div class="keyword-row">
      <div class="keyword-row__label">${escapeHtml(r.label)}<small class="keyword-row__sub">${escapeHtml(r.sub)}</small></div>
      <div class="keyword-row__bars">
        ${bar('korea', '한국', r.counts.korea)}
        ${bar('japan', '일본', r.counts.japan)}
        ${bar('china', '중국', r.counts.china)}
      </div>
    </div>
  `).join('');

  setTimeout(() => {
    chart.querySelectorAll('.keyword-bar__fill').forEach(b => {
      b.style.width = b.dataset.width + '%';
    });
  }, 100);
}

/* ------------------------------------------------------------
   관련 사료 · 자료 (sources-data.js)
   ------------------------------------------------------------ */

let sourcesFilter = 'all';
const SOURCE_COUNTRY_LABEL = { korea: '한국', japan: '일본', china: '중국', other: '기타' };

function sourceTypeLabel(type) {
  return { primary: '1차 사료', secondary: '2차 자료', memorial: '기념물·기억 자료' }[type] || '자료';
}

function safeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

function sourcesForEvent(eventId) {
  return SOURCES.filter(s => s && s.eventId === eventId);
}

/** 선택한 표현(또는 개념)과 연결된 자료 — relatedTerms 기준 */
function sourcesForTerm(eventId, term) {
  if (!term) return [];
  let needles = [term];
  if (term.indexOf('concept:') === 0 && Analyzer) {
    const concept = Analyzer.CONCEPTS.find(c => c.id === term.slice(8));
    needles = concept ? (concept.forms.ko || []).map(f => f.replace(/^=/, '')) : [];
  }
  const matches = rt => needles.some(n => rt === n || (n.length >= 2 && rt.indexOf(n) >= 0) || (rt.length >= 2 && n.indexOf(rt) >= 0));
  return sourcesForEvent(eventId).filter(s => (s.relatedTerms || []).some(matches));
}

function renderSourcesTab() {
  const grid = document.getElementById('sourcesGrid');
  const filterBox = document.getElementById('sourcesFilter');
  if (!grid || !filterBox) return;
  const all = sourcesForEvent(currentEventId);

  const present = ['korea', 'japan', 'china', 'other'].filter(c => all.some(s => s.country === c));
  const filters = [['all', `전체 ${all.length}`]].concat(present.map(c => [c, `${SOURCE_COUNTRY_LABEL[c]} ${all.filter(s => s.country === c).length}`]));
  filterBox.innerHTML = filters.map(([key, label]) =>
    `<button type="button" class="shared-language-tabs__tab${sourcesFilter === key ? ' is-active' : ''}" role="tab" aria-selected="${sourcesFilter === key}" data-sources-filter="${key}">${label}</button>`
  ).join('');

  const list = all.filter(s => sourcesFilter === 'all' || s.country === sourcesFilter);
  if (!list.length) {
    grid.innerHTML = '<div class="shared-empty">이 사건에 등록된 자료가 아직 없습니다. sources-data.js에 자료를 추가하면 여기에 표시됩니다.</div>';
    return;
  }

  grid.innerHTML = list.map(s => {
    const url = safeUrl(s.url);
    const related = (s.relatedTerms || []).map(t => {
      const normalized = window.SharedMemoryNLP && t.indexOf(' ') < 0 ? SharedMemoryNLP.normalizeToken(t) : t;
      const counts = eventNlp ? eventNlp.countsFor(normalized) : null;
      const inText = counts && NLP_COUNTRIES.some(c => counts[c.key] > 0);
      return inText
        ? `<button type="button" class="nlp-chip" data-evidence-term="${escapeAttr(normalized)}" title="서술 원문에서 위치 보기">${escapeHtml(t)}</button>`
        : `<span class="source-card__term">${escapeHtml(t)}</span>`;
    }).join('');
    const meta = [
      ['연도', s.year],
      ['작성 주체', s.creator],
      ['소장·제공', [s.institution, s.archive].filter(Boolean).join(' · ')],
      ['자료의 관점', s.perspective]
    ].filter(([, v]) => v).map(([k, v]) => `<div class="source-card__meta-row"><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');

    return `
      <article class="source-card source-card--${escapeAttr(s.country)}" id="source-${escapeAttr(s.id)}" data-source-id="${escapeAttr(s.id)}">
        <div class="source-card__badges">
          <span class="source-card__type source-card__type--${escapeAttr(s.sourceType)}">${escapeHtml(sourceTypeLabel(s.sourceType))}</span>
          ${s.typeNote ? `<span class="source-card__note">${escapeHtml(s.typeNote)}</span>` : ''}
          ${s.reviewed ? '' : '<span class="source-card__review">검토 전</span>'}
        </div>
        <h4 class="source-card__title">${escapeHtml(s.title)}</h4>
        ${s.originalTitle ? `<div class="source-card__original">${escapeHtml(s.originalTitle)}</div>` : ''}
        <dl class="source-card__meta">${meta}</dl>
        ${s.description ? `<p class="source-card__desc">${escapeHtml(s.description)}</p>` : ''}
        ${related ? `<div class="source-card__related"><span class="narrative-card__label">연결된 표현</span><div class="nlp-chips">${related}</div></div>` : ''}
        <div class="source-card__link">
          ${url
            ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">자료 제공 기관 페이지 열기 ↗</a>`
            : '<span class="nlp-meta">링크 준비 중</span>'}
          ${s.urlNote ? `<span class="nlp-meta">${escapeHtml(s.urlNote)}</span>` : ''}
        </div>
      </article>`;
  }).join('');
}

function gotoSource(sourceId) {
  const source = SOURCES.find(s => s.id === sourceId);
  if (!source) return;
  if (sourcesFilter !== 'all' && sourcesFilter !== source.country) {
    sourcesFilter = 'all';
    renderSourcesTab();
  }
  gotoTab('sources');
  const card = document.querySelector(`[data-source-id="${CSS.escape ? CSS.escape(sourceId) : sourceId}"]`);
  if (card) {
    document.querySelectorAll('.source-card.is-focused').forEach(c => c.classList.remove('is-focused'));
    card.classList.add('is-focused');
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
}

function showEvidenceFor(term) {
  gotoTab('ai');
  if (!document.getElementById('aiResult').classList.contains('show')) {
    nlpSelectedTerm = term;
    runAIAnalysis();
  }
  selectNLPTerm(term);
}

/* ------------------------------------------------------------
   공동 표현 작성 — Guided Contribution
   STEP 1 핵심 요소 → STEP 2 표현 방식 → STEP 3 문장(문장 틀) → STEP 4 이유
   ------------------------------------------------------------ */

const guideState = { candidates: [], selected: new Map(), style: null, reasons: new Set() };

function candidateKey(c) {
  return c.conceptId ? `concept:${c.conceptId}` : `term:${c.term}`;
}

const CANDIDATE_SOURCE_LABEL = { common: '세 서술 공통', korea: '한국 서술 특징', japan: '일본 서술 특징', china: '중국 서술 특징' };

function resetGuide(event) {
  guideState.selected = new Map();
  guideState.style = null;
  guideState.reasons = new Set();
  const cands = Analyzer ? Analyzer.candidateElements(event, eventNlp) : { concepts: [], terms: [], general: [] };
  guideState.candidates = cands.concepts.concat(cands.terms, cands.general);

  const chip = c => {
    const dots = c.presentIn
      ? `<span class="guide-chip__dots" aria-hidden="true">${c.presentIn.map(k => `<i class="dot dot--${k}"></i>`).join('')}</span>`
      : '';
    const title = c.presentIn
      ? `${c.presentIn.map(nlpCountryName).join('·')} 서술에서 확인됨`
      : (CANDIDATE_SOURCE_LABEL[c.source] || '');
    return `<button type="button" class="guide-chip" aria-pressed="false" data-guide-key="${escapeAttr(candidateKey(c))}" title="${escapeAttr(title)}">${escapeHtml(c.label)}${dots}</button>`;
  };
  const group = (label, list, note) => list.length ? `
    <div class="guide-group">
      <div class="guide-group__label">${label}${note ? ` <small>${note}</small>` : ''}</div>
      <div class="guide-group__chips">${list.map(chip).join('')}</div>
    </div>` : '';

  const conceptsBox = document.getElementById('guideConcepts');
  if (conceptsBox) {
    conceptsBox.innerHTML =
      group('서술에서 확인되는 개념', cands.concepts, '점: 해당 개념이 나온 국가 서술') +
      group('서술에 자주 쓰인 어휘', cands.terms, 'NLP 공통·특징 표현') +
      group('함께 생각해 볼 개념', cands.general) ||
      '<p class="guide-step__desc">후보를 만들지 못했습니다. 바로 STEP 3에서 문장을 작성해도 됩니다.</p>';
  }

  const stylesBox = document.getElementById('guideStyles');
  if (stylesBox) {
    stylesBox.innerHTML = Guide.STYLES.map(s => `
      <button type="button" class="guide-style" role="radio" aria-checked="false" data-guide-style="${escapeAttr(s.id)}">
        <strong>${escapeHtml(s.label)}</strong>
        <span>${escapeHtml(s.desc)}</span>
      </button>`).join('');
  }
  const hint = document.getElementById('guideStyleHint');
  if (hint) hint.textContent = '어떤 방식도 정답이 아닙니다. 역사적 사실을 지우거나 약화시키지 않는 것이 공통의 출발점입니다.';

  const templatesBox = document.getElementById('guideTemplates');
  if (templatesBox) {
    const sample = event.sampleExpression
      ? `<div class="guide-sample">
          <span class="guide-sample__tag">참고 예시 · 정답 아님</span>
          <p>“${escapeHtml(event.sampleExpression)}”</p>
        </div>`
      : '';
    templatesBox.innerHTML = `
      ${sample}
      <div class="guide-templates__label">문장 틀로 시작하기 <small>누르면 입력창에 넣어 드려요. 빈칸(______)을 자신의 말로 채워 보세요. 참고용이며 정답이 아닙니다.</small></div>
      <div class="guide-templates__list">
        ${Guide.TEMPLATES.map(t => `
          <button type="button" class="guide-template" data-guide-template="${escapeAttr(t.id)}">
            <span class="guide-template__name">${escapeHtml(t.label)}</span>
            <span class="guide-template__text">${escapeHtml(t.text)}</span>
          </button>`).join('')}
      </div>`;
  }

  const reasonsBox = document.getElementById('guideReasons');
  if (reasonsBox) {
    reasonsBox.innerHTML = Guide.REASONS.map(r => `
      <label class="guide-reason">
        <input type="checkbox" value="${escapeAttr(r.id)}" data-guide-reason />
        <span>${escapeHtml(r.label)}</span>
      </label>`).join('');
  }
  setSubmitStatus('');
}

function toggleGuideCandidate(key, button) {
  const cand = guideState.candidates.find(c => candidateKey(c) === key);
  if (!cand) return;
  if (guideState.selected.has(key)) guideState.selected.delete(key);
  else guideState.selected.set(key, cand);
  button.setAttribute('aria-pressed', String(guideState.selected.has(key)));
  button.classList.toggle('is-selected', guideState.selected.has(key));
  updateDraftPanel();
}

function selectGuideStyle(id) {
  guideState.style = guideState.style === id ? null : id;
  document.querySelectorAll('[data-guide-style]').forEach(b => {
    const on = b.dataset.guideStyle === guideState.style;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-checked', String(on));
  });
  const style = Guide.STYLES.find(s => s.id === guideState.style);
  const hint = document.getElementById('guideStyleHint');
  if (hint) hint.textContent = style ? style.hint : '어떤 방식도 정답이 아닙니다. 역사적 사실을 지우거나 약화시키지 않는 것이 공통의 출발점입니다.';
}

function insertTemplate(id) {
  const template = Guide.TEMPLATES.find(t => t.id === id);
  const area = document.getElementById('userNarrative');
  if (!template || !area) return;
  const current = area.value.trim();
  area.value = current ? `${current} ${template.text}` : template.text;
  const blank = area.value.indexOf('______', current.length);
  area.focus();
  if (blank >= 0) area.setSelectionRange(blank, blank + 6);
  updateDraftPanel();
}

/* ------------------------------------------------------------
   작성 중 실시간 표현 분석 패널
   · 표현의 옳고 그름을 평가하지 않습니다. 텍스트의 특징만 보여줍니다.
   ------------------------------------------------------------ */

function draftKeywordsFor() {
  if (!eventNlp) return [];
  const out = [];
  const push = t => { if (t && t.indexOf(' ') < 0 && !/[0-9]/.test(t) && out.indexOf(t) < 0) out.push(t); };
  eventNlp.common.slice(0, 4).forEach(e => push(e.term));
  NLP_COUNTRIES.forEach(c => (eventNlp.distinctive[c.key] || []).slice(0, 1).forEach(d => push(d.term)));
  NLP_COUNTRIES.forEach(c => (eventNlp.keywords[c.key] || []).slice(0, 1).forEach(k => push(k.term)));
  return out.slice(0, 8);
}

function rebuildDraftContext() {
  const event = currentEvent();
  if (!Analyzer || !event) { draftContext = null; return; }
  try {
    draftContext = Analyzer.createDraftContext({
      narratives: eventNarratives(event),
      existing: sharedNarratives,
      eventKeywords: draftKeywordsFor()
    });
  } catch (e) {
    console.error('실시간 분석 준비 오류:', e);
    draftContext = null;
  }
}

let draftTimer = null;
function scheduleDraftPanel() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(updateDraftPanel, 250);
}

function simBar(key, name, value) {
  return `
    <div class="draft-sim">
      <span class="draft-sim__name draft-sim__name--${key}">${name}</span>
      <span class="nlp-bar"><span class="nlp-bar__fill nlp-bar__fill--${key}" style="width:${Math.round(Math.min(1, value) * 100)}%"></span></span>
      <strong>${formatNum(value)}</strong>
    </div>`;
}

function updateDraftPanel() {
  const panel = document.getElementById('draftPanel');
  if (!panel) return;
  const text = document.getElementById('userNarrative')?.value || '';
  const head = `
    <div class="draft-panel__head">
      <h4>내 표현 분석</h4>
      <p>표현의 옳고 그름을 평가하지 않습니다. 문장의 텍스트 특징을 보여주는 참고 정보입니다.</p>
    </div>`;

  if (!draftContext) {
    panel.innerHTML = `${head}<p class="draft-panel__empty">분석 모듈을 불러오지 못했습니다. 작성과 등록은 그대로 할 수 있어요.</p>`;
    return;
  }

  let a;
  try {
    a = draftContext.analyze(text, { selected: [...guideState.selected.values()], before: getBefore() });
  } catch (e) {
    console.error('실시간 분석 오류:', e);
    panel.innerHTML = `${head}<p class="draft-panel__empty">분석 중 문제가 생겼습니다. 작성과 등록은 그대로 할 수 있어요.</p>`;
    return;
  }

  const section = (title, body) => `<div class="draft-panel__section"><div class="draft-panel__title">${title}</div>${body}</div>`;

  const selectedHtml = a.selected.length
    ? `<ul class="draft-check">${a.selected.map(s => `<li class="${s.included ? 'is-on' : ''}"><span aria-hidden="true">${s.included ? '✓' : '○'}</span> ${escapeHtml(s.label)}<span class="sr-only">${s.included ? ' — 문장에 포함됨' : ' — 아직 없음'}</span></li>`).join('')}</ul>`
    : '<p class="draft-panel__muted">STEP 1에서 요소를 고르면 문장에 들어갔는지 여기서 확인할 수 있어요.</p>';

  if (!a.text) {
    panel.innerHTML = `${head}${section('선택한 핵심 요소', selectedHtml)}<p class="draft-panel__empty">문장을 입력하면 분석이 여기에 나타납니다.</p>`;
    return;
  }

  const kwHtml = a.keywords.length
    ? `<div class="nlp-chips">${a.keywords.map(k => `<span class="draft-kw${k.included ? ' is-on' : ''}">${k.included ? '✓ ' : ''}${escapeHtml(k.term)}</span>`).join('')}</div>`
    : '<p class="draft-panel__muted">사건 주요 어휘를 만들지 못했습니다.</p>';

  const langNote = a.lang !== 'ko'
    ? '<p class="draft-panel__muted">국가별 서술은 한국어로 작성되어 있어, 다른 언어의 문장은 개념 사전(침략·侵略·invasion 등)을 통해서만 비교됩니다.</p>'
    : '';
  const simHtml = NLP_COUNTRIES.map(c => simBar(c.key, c.name, a.narrativeSimilarity[c.key])).join('') +
    `<p class="draft-panel__muted">단어·문자·개념 기반 코사인 유사도(0~1). 값이 높다고 더 좋은 표현이라는 뜻이 아닙니다.</p>${langNote}`;

  const frameHtml = `<div class="draft-frames">${Analyzer.FRAMES.map(f => `<span title="${escapeAttr(f.desc)}">${f.short} <strong>${a.frames.counts[f.id]}</strong></span>`).join('')}</div>`;

  const existingHtml = !a.existingCount
    ? '<p class="draft-panel__muted">아직 비교할 다른 제안이 없습니다.</p>'
    : a.similarExisting.length
      ? `<ul class="draft-similar">${a.similarExisting.map(x => `<li><strong>${formatNum(x.score)}</strong> “${escapeHtml(truncateText(x.item.text, 60))}” <span class="nlp-meta">— ${escapeHtml(x.item.user || '익명')}</span></li>`).join('')}</ul>
         <p class="draft-panel__muted">비슷한 제안이 있다면, 등록된 목록에서 공감 표시로 함께할 수도 있어요.</p>`
      : `<p class="draft-panel__muted">등록된 ${a.existingCount}건과 겹치는 표현이 거의 없습니다.</p>`;

  let beforeHtml = '';
  if (a.beforeAfter) {
    const b = a.beforeAfter;
    const chips = (list, cls) => list.length ? list.slice(0, 8).map(t => `<span class="draft-kw ${cls}">${escapeHtml(t)}</span>`).join('') : '<span class="nlp-meta">없음</span>';
    const shift = NLP_COUNTRIES.filter(c => b.narrativeShift[c.key]).map(c => {
      const s = b.narrativeShift[c.key];
      return `<li>${c.name} ${formatNum(s.before)} → ${formatNum(s.after)}</li>`;
    }).join('');
    beforeHtml = section('탐구 전 → 지금', `
      <p class="draft-panel__muted">탐구 전: “${escapeHtml(truncateText(getBefore(), 60))}”</p>
      <div class="draft-ba"><span>새롭게 등장</span><div class="nlp-chips">${chips(b.addedConcepts.concat(b.added), 'is-new')}</div></div>
      <div class="draft-ba"><span>유지</span><div class="nlp-chips">${chips(b.keptConcepts.concat(b.kept), 'is-on')}</div></div>
      <div class="draft-ba"><span>사라진 표현</span><div class="nlp-chips">${chips(b.removedConcepts.concat(b.removed), 'is-gone')}</div></div>
      <p class="draft-panel__muted">두 문장의 텍스트 유사도 ${formatNum(b.similarity)} · 국가별 서술과의 유사도 변화</p>
      <ul class="draft-shift">${shift}</ul>`);
  }

  panel.innerHTML = `
    ${head}
    ${section('선택한 핵심 요소', selectedHtml)}
    ${section('사건 주요 어휘 포함 여부', kwHtml)}
    ${section('문장 길이', `<p class="draft-panel__stat">${a.chars}자 · 내용어 ${a.tokens}개 · ${getLangBadge(a.lang).label}로 인식</p>`)}
    ${section('국가별 서술과의 텍스트 유사도', simHtml)}
    ${section('표현 프레임 어휘', frameHtml)}
    ${section('이미 등록된 공동 표현과의 텍스트 유사도', existingHtml)}
    ${beforeHtml}`;
}

function truncateText(str, max) {
  const s = String(str || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function setSubmitStatus(message, tone) {
  const el = document.getElementById('submitStatus');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'shared-form__status' + (tone ? ` is-${tone}` : '');
}

async function submitSharedNarrative() {
  const nameInput = document.getElementById('userName');
  const narrativeInput = document.getElementById('userNarrative');
  const reasonInput = document.getElementById('userReason');

  // 닉네임은 선택 항목입니다. 비워 두면 '익명'으로 저장합니다.
  const name = (nameInput ? nameInput.value.trim() : '') || '익명';
  const text = narrativeInput ? narrativeInput.value.trim() : '';
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (!text) {
    setSubmitStatus('STEP 3의 공동 표현 문장을 입력해 주세요.', 'error');
    narrativeInput?.focus();
    return;
  }
  if (text.indexOf('______') >= 0) {
    setSubmitStatus('문장 틀의 빈칸(______)을 자신의 말로 채운 뒤 등록해 주세요.', 'error');
    narrativeInput?.focus();
    return;
  }
  if (!currentEventId) {
    setSubmitStatus('먼저 역사 사건을 선택해주세요.', 'error');
    return;
  }
  if (!Store) {
    setSubmitStatus('저장 모듈(shared-store.js)을 불러오지 못했습니다.', 'error');
    return;
  }

  const submitButton = document.getElementById('submitNarrative');
  if (submitButton) {
    if (submitButton.disabled) return;
    submitButton.disabled = true;
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.textContent = '등록 중...';
  }
  setSubmitStatus('');

  const eventIdAtSubmit = currentEventId;
  const f = flow || defaultFlow();
  const milestones = {
    viewedCompare: f.viewedCompare,
    viewedNlp: f.viewedNlp,
    viewedSources: f.viewedSources,
    completedFlow: Gen ? Gen.computeCompletedFlow({
      eventSelected: true,
      startedExploration: true,           // 사건 상세를 열어 탐구를 시작한 기록
      beforeWritten: !!getBefore(),
      viewedCompare: f.viewedCompare,
      submitted: true
    }) : false
  };
  const result = await Store.insertExpression({
    eventKey: eventIdAtSubmit,
    author: name,
    lang: detectLanguage(text),
    content: text,
    reason,
    style: guideState.style,
    selectedConcepts: [...guideState.selected.values()].map(c => c.label),
    reasonTags: [...guideState.reasons],
    before: getBefore(),
    ageGroup: getAgeGroup(),
    priorLearning: getPriorLearning(),
    milestones
  });

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = submitButton.dataset.originalText || '제안 등록하기';
  }

  if (!result.ok) {
    console.error('Supabase 저장 오류:', result.raw || result.error);
    setSubmitStatus(`등록에 실패했습니다. ${result.error || ''}`, 'error');
    return;
  }

  if (narrativeInput) narrativeInput.value = '';
  if (reasonInput) reasonInput.value = '';
  document.querySelectorAll('[data-guide-reason]').forEach(cb => { cb.checked = false; });
  guideState.reasons = new Set();

  setSubmitStatus(result.legacy
    ? '공동 표현이 등록되었습니다. (일부 항목은 데이터베이스 확장 후 함께 저장됩니다)'
    : '공동 표현이 등록되었습니다. 이제 다른 참여자들의 표현과 함께 볼 수 있어요.', 'ok');

  if (eventIdAtSubmit === currentEventId) {
    markFlow({ submitted: true, viewedResult: false });
    const next = document.getElementById('submitNext');
    if (next) next.hidden = false;
    await loadSharedNarratives();
  }
  loadParticipantCount();
}

/* ------------------------------------------------------------
   공동 표현 불러오기 · 목록
   ------------------------------------------------------------ */

async function loadSharedNarratives() {
  if (!currentEventId) {
    sharedNarratives = [];
    renderSharedList();
    return;
  }

  const eventId = currentEventId;
  sharedLoadState = 'loading';
  const list = document.getElementById('sharedList');
  if (list) list.innerHTML = '<div class="shared-empty">공동 표현을 불러오는 중입니다...</div>';
  renderMemoryTab();

  if (!Store) {
    sharedLoadState = 'error';
    sharedLoadError = '저장 모듈(shared-store.js)을 불러오지 못했습니다.';
    renderSharedList();
    renderMemoryTab();
    return;
  }

  const [res, emp, ages] = await Promise.all([
    Store.loadExpressions(eventId),
    Store.fetchEmpathyCounts(eventId),
    Store.fetchAgeGroupParticipants ? Store.fetchAgeGroupParticipants(eventId) : { available: false, counts: null }
  ]);
  if (eventId !== currentEventId) return;   // 불러오는 사이 다른 사건으로 이동한 경우

  if (res.error) {
    console.error('Supabase 불러오기 오류:', res.error);
    sharedLoadState = 'error';
    sharedLoadError = res.error;
    sharedNarratives = [];
  } else {
    sharedLoadState = 'ready';
    sharedLoadError = '';
    sharedLimited = !!res.limited;
    sharedNarratives = res.data.map(item => Object.assign(item, {
      date: formatSharedDate(item.createdAt),
      translationOpen: false
    }));
  }
  empathyAvailable = emp.available;
  empathyCounts = emp.counts || {};
  ageParticipantCounts = ages && ages.available ? ages.counts : null;
  memoryCache = {};

  recomputeExpressionAnalysis();
  rebuildDraftContext();
  renderSharedList();
  renderMemoryTab();
  updateDraftPanel();
}

function recomputeExpressionAnalysis() {
  const event = currentEvent();
  if (!Analyzer || !event) { expressionAnalysis = null; return; }
  try {
    expressionAnalysis = Analyzer.analyzeExpressions(sharedNarratives, { narratives: eventNarratives(event) });
  } catch (e) {
    console.error('공동 표현 분석 오류:', e);
    expressionAnalysis = null;
  }
}

function formatSharedDate(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

document.getElementById('sharedLanguageTabs')?.addEventListener('click', event => {
  const button = event.target.closest('[data-shared-language]');
  if (!button) return;
  sharedLanguageFilter = button.dataset.sharedLanguage;
  sharedVisibleCount = 20;
  document.querySelectorAll('[data-shared-language]').forEach(tab => {
    const active = tab === button;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  renderSharedList();
});

function styleLabel(id) {
  const s = Guide.STYLES.find(x => x.id === id);
  return s ? s.label : '';
}

function reasonLabel(id) {
  const r = Guide.REASONS.find(x => x.id === id);
  return r ? r.label : '';
}

function renderSharedList() {
  const list = document.getElementById('sharedList');
  if (!list) return;

  if (sharedLoadState === 'error') {
    list.innerHTML = `<div class="shared-empty">데이터를 불러오지 못했습니다. ${escapeHtml(sharedLoadError)}</div>`;
    return;
  }

  const items = sharedNarratives.filter(item => item.eventId === currentEventId &&
    (sharedLanguageFilter === 'all' || item.lang?.toLowerCase() === sharedLanguageFilter));

  if (items.length === 0) {
    list.innerHTML = `<div class="shared-empty">${sharedLanguageFilter === 'all' ? '아직 등록된 제안이 없습니다. 첫 번째 제안을 작성해 보세요!' : '이 언어로 등록된 제안이 없습니다.'}</div>`;
    return;
  }

  const empathized = Store ? Store.empathizedSet() : new Set();
  const visible = items.slice(0, sharedVisibleCount);

  list.innerHTML = visible.map(item => {
    const badge = getLangBadge(item.lang || 'unknown');
    const id = escapeAttr(String(item.id));

    let translationHtml = '';
    if (item.translationOpen) {
      const trans = buildTranslation(item);
      if (trans) {
        const translatedRows = Object.entries(trans).map(([lang, txt]) => {
          const b = getLangBadge(lang);
          return `
            <div class="shared-item__translation-row">
              <span class="narrative-card__keyword">${b.flag} ${b.label}</span>
              <div class="shared-item__translation-text">${escapeHtml(txt)}</div>
            </div>
          `;
        }).join('');

        translationHtml = `
          <div class="shared-item__reason">
            <strong>참고 번역 예시:</strong>
            ${translatedRows}
            <div class="shared-item__translation-note">
              ※ 위 문장은 이 사건에 대해 미리 작성해 둔 예시문의 번역입니다. 이 제안을 번역한 것이 아니며, 자동 번역 기능이 아닙니다.
            </div>
          </div>
        `;
      }
    }

    const toggleText = item.translationOpen ? '참고 번역 예시 닫기' : '참고 번역 예시 보기';
    const concepts = (item.selectedConcepts || []).length
      ? `<div class="shared-item__concepts"><span class="shared-item__label">담고 싶은 요소</span>${item.selectedConcepts.map(c => `<span class="narrative-card__keyword">${escapeHtml(c)}</span>`).join('')}</div>`
      : '';
    const reasonTags = (item.reasonTags || []).map(reasonLabel).filter(Boolean);
    const reasonHtml = (item.reason || reasonTags.length) ? `
          <div class="shared-item__reason">
            <strong>작성 이유:</strong>
            ${reasonTags.length ? `<span class="shared-item__reason-tags">${reasonTags.map(escapeHtml).join(' · ')}</span>` : ''}
            ${item.reason ? `<span>${escapeHtml(item.reason)}</span>` : ''}
          </div>` : '';
    const count = empathyCounts[String(item.id)] || 0;
    const mine = empathized.has(String(item.id));
    const empathyHtml = empathyAvailable ? `
        <button type="button" class="shared-item__action${mine ? ' is-done' : ''}" data-empathy-id="${id}" ${mine ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'}>
          ${mine ? '공감했어요' : '공동 표현으로 공감해요'} · <strong>${count}</strong>
        </button>` : '';

    return `
      <div class="shared-item" data-expression-id="${id}">
        <div class="shared-item__header">
          <div class="shared-item__user">
            ${escapeHtml(item.user)}
            <span class="narrative-card__keyword">${badge.flag} ${badge.label}</span>
            ${item.style ? `<span class="shared-item__style">${escapeHtml(styleLabel(item.style))}</span>` : ''}
          </div>
          <div class="shared-item__date">${escapeHtml(item.date || '')}</div>
        </div>

        <div class="shared-item__text">"${escapeHtml(item.text)}"</div>
        ${item.before ? `<div class="shared-item__before"><span class="shared-item__label">탐구 전</span> “${escapeHtml(item.before)}”</div>` : ''}
        ${concepts}
        ${reasonHtml}

        <div class="shared-item__actions">
          ${empathyHtml}
          <button type="button" class="shared-item__action" data-translate-id="${id}">${toggleText}</button>
        </div>

        ${translationHtml}
      </div>
    `;
  }).join('') + (items.length > visible.length
    ? `<button type="button" class="btn btn--small shared-more" data-shared-more>제안 더 보기 (${items.length - visible.length}건 남음)</button>`
    : '') + (sharedLimited ? `<p class="nlp-meta">최신 ${Store ? Store.LOAD_LIMIT : 500}건까지 불러와 분석합니다.</p>` : '');
}

async function handleEmpathy(id, button) {
  if (!Store) return;
  button.disabled = true;
  const res = await Store.addEmpathy(id);
  if (res.ok) {
    empathyCounts[String(id)] = (empathyCounts[String(id)] || 0) + 1;
  } else if (res.unavailable) {
    empathyAvailable = false;
  } else if (!res.duplicate) {
    button.disabled = false;
    setSubmitStatus(`공감을 저장하지 못했습니다. ${res.error || ''}`, 'error');
    return;
  }
  renderSharedList();
  if (document.querySelector('[data-tab-content="memory"].active')) renderMemoryTab();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function detectLanguage(text) {
  if (Analyzer) return Analyzer.detectLanguage(text);
  if (!text || !text.trim()) return 'unknown';
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja';
  if (/[A-Za-z]/.test(text)) return 'en';
  return 'unknown';
}

function getLangBadge(code) {
  const map = {
    'ko': { flag: '🇰🇷', label: '한국어' },
    'ja': { flag: '🇯🇵', label: '日本語' },
    'en': { flag: '🇺🇸', label: 'English' },
    'unknown': { flag: '🌐', label: '미식별' }
  };
  return map[code] || map['unknown'];
}

/* 참고 번역 예시: 사건별로 미리 작성해 둔 예시문의 번역입니다.
   사용자가 입력한 문장을 번역하지 않으며, 번역 API를 사용하지 않습니다. */
const translationSamples = {
  'imjin': {
    ko: {
      ja: '1592年から始まった日本軍の朝鮮半島侵攻と、それに対する朝鮮・明連合軍の7年間の戦争。',
      en: 'A seven-year war beginning in 1592, marked by the Japanese invasion of the Korean peninsula and the resistance of the Joseon-Ming allied forces.'
    },
    ja: {
      ko: '1592년에 시작된 일본군의 조선 침공과 조선·명 연합군의 저항으로 이어진 7년간의 전쟁이다.',
      en: 'A seven-year war beginning in 1592, involving Japanese military campaigns and resistance by Joseon and Ming forces.'
    },
    en: {
      ko: '1592년부터 1598년까지 동북아 삼국이 모두 관여한 국제 전쟁으로, 막대한 피해를 남겼다.',
      ja: '1592年から1598年まで東アジア三国が関与した国際戦争で、莫大な被害を残した。'
    }
  },
  'culture': {
    ko: {
      ja: '韓・中・日三国は文字・宗教・技術を相互に交流させ、東アジア共通の文化的基盤を形成した。',
      en: 'Korea, China, and Japan exchanged scripts, religions, and technologies, forming a shared East Asian cultural foundation.'
    },
    ja: {
      ko: '동아시아 삼국은 한자·불교·유교 등을 상호 변용하며 각자의 독자적 문화를 발전시켰다.',
      en: 'The three East Asian nations adapted Chinese characters, Buddhism, and Confucianism in their own ways.'
    },
    en: {
      ko: '동북아 문화 교류는 단방향이 아닌 다방향의 흐름이었으며, 세 국가 모두 발신자이자 수용자였다.',
      ja: '東アジアの文化交流は一方向ではなく多方向の流れであり、三国すべてが発信者であり受容者でもあった。'
    }
  },
  'tribute': {
    ko: {
      ja: '東アジアの朝貢体制は、儀礼・文化・経済が結びついた複合的な国際秩序であった。',
      en: 'The East Asian tributary system was a complex international order combining ritual, culture, and trade.'
    },
    ja: {
      ko: '동아시아 조공 체제는 의례·문화·경제가 결합된 복합적 국제 질서였다.',
      en: 'The East Asian tributary system was a multi-layered international order encompassing ritual, culture, and commerce.'
    },
    en: {
      ko: '조공 관계는 19세기 서구 충격으로 붕괴되기 전까지 동아시아 국제 질서의 기본 틀이었다.',
      ja: '朝貢関係は19世紀の西欧の衝撃で崩壊するまで、東アジア国際秩序の基本枠組みであった。'
    }
  },
  'modern': {
    ko: {
      ja: '19世紀後半、東アジア三国はそれぞれ異なる経路で近代化を試み、その結果も大きく分岐した。',
      en: 'In the late 19th century, the three East Asian nations pursued modernization along divergent paths.'
    },
    ja: {
      ko: '19세기 후반 동아시아 삼국은 각기 다른 경로로 근대화를 시도했고, 그 결과 또한 크게 갈렸다.',
      en: 'Each of the three East Asian states attempted modernization through different paths in the late 19th century.'
    },
    en: {
      ko: '근대화 과정은 한국에게는 좌절, 일본에게는 성공, 중국에게는 치욕으로 각기 다르게 기억된다.',
      ja: '近代化の過程は、韓国には挫折、日本には成功、中国には屈辱として記憶されている。'
    }
  },
  'zainichi': {
    ko: {
      ja: '在日朝鮮人は、植民地支配と戦後日本社会の変化の中で形成された朝鮮半島出身者とその子孫の共同体である。',
      en: 'Zainichi Koreans are a community of people from the Korean peninsula and their descendants, shaped by colonial rule and postwar Japanese society.'
    },
    ja: {
      ko: '재일조선인은 식민지 지배와 전후 일본 사회의 변화 속에서 형성된 한반도 출신 주민과 그 후손의 공동체이다.',
      en: 'Zainichi Koreans are a community formed through colonial migration, wartime mobilization, and postwar residence in Japan.'
    },
    en: {
      ko: '재일조선인 문제는 식민지 지배, 전후 국적 문제, 차별, 정체성이 겹쳐 있는 역사적 쟁점이다.',
      ja: '在日朝鮮人問題は、植民地支配、戦後の国籍問題、差別、アイデンティティが重なる歴史的課題である。'
    }
  },
  'hiroshima': {
    ko: {
      ja: '広島原爆の被害には、植民地支配や戦時動員によって日本にいた朝鮮人被害者も含まれていた。',
      en: 'The victims of the Hiroshima atomic bombing included Koreans who were in Japan due to colonial rule, migration, or wartime mobilization.'
    },
    ja: {
      ko: '히로시마 원폭 피해에는 식민지 지배와 전쟁 동원으로 일본에 있던 조선인 피해자도 포함되어 있었다.',
      en: 'The Hiroshima atomic bombing caused massive civilian suffering, including among Korean victims who had been brought to or lived in Japan.'
    },
    en: {
      ko: '히로시마 원폭은 핵무기의 비극이면서 동시에 조선인 피해자의 존재를 통해 식민지 동원의 문제를 드러낸다.',
      ja: '広島原爆は核兵器の悲劇であると同時に、朝鮮人被害者の存在を通じて植民地動員の問題を示している。'
    }
  }
};

function toggleTranslation(id) {
  const item = sharedNarratives.find(x => String(x.id) === String(id));
  if (!item) return;

  item.translationOpen = !item.translationOpen;
  renderSharedList();
}

function buildTranslation(item) {
  const samples = translationSamples[item.eventId];
  if (!samples) return null;

  const src = item.lang;
  const srcKey = (src === 'ko' || src === 'ja' || src === 'en') ? src : 'ko';
  const map = samples[srcKey];
  if (!map) return null;

  const result = {};
  Object.keys(map).forEach(targetLang => {
    result[targetLang] = map[targetLang];
  });
  return result;
}

/* ------------------------------------------------------------
   공동 기억 지도 (Shared Memory Consensus)
   · shared-memory-analyzer.js 결과를 화면에 그립니다.
   ------------------------------------------------------------ */

function renderMemoryTab() {
  const box = document.getElementById('memoryResult');
  if (!box) return;

  if (!Analyzer) {
    box.innerHTML = '<div class="shared-empty">공동 표현 분석 모듈(shared-memory-analyzer.js)을 불러오지 못했습니다.</div>';
    return;
  }
  if (sharedLoadState === 'loading') {
    box.innerHTML = '<div class="shared-empty">공동 표현을 불러오는 중입니다...</div>';
    return;
  }
  if (sharedLoadState === 'error') {
    box.innerHTML = `<div class="shared-empty">공동 표현을 불러오지 못해 분석할 수 없습니다. ${escapeHtml(sharedLoadError)}</div>`;
    return;
  }
  if (!expressionAnalysis || expressionAnalysis.total === 0) {
    box.innerHTML = `
      <div class="shared-empty">
        아직 이 사건에 등록된 공동 표현이 없습니다.<br />첫 번째 제안이 공동 기억 지도의 출발점이 됩니다.
        <div><button type="button" class="btn btn--small" data-goto-tab="shared">공동 표현 작성하러 가기</button></div>
      </div>`;
    return;
  }

  const filterHtml = renderAgeFilter();
  const filtered = Gen && memoryAgeFilter !== 'all';
  if (filtered) {
    const n = Gen.sampleSize(memoryAgeFilter, Gen.groupCounts(sharedNarratives), ageParticipantCounts);
    if (!Gen.isSampleSufficient(n)) {
      box.innerHTML = `${filterHtml}
        <div class="shared-empty">
          ${escapeHtml(Gen.ageLabel(memoryAgeFilter))} 참여 ${n}${ageParticipantCounts ? '명' : '건'} — 표본이 적어 세부 분석을 표시하지 않습니다.<br />
          <small>${Gen.MIN_GROUP_SIZE}명 이상 모이면 이 연령대의 분석이 표시됩니다. 이 제안들은 ‘전체’ 분석에는 포함되어 있습니다.</small>
        </div>`;
      return;
    }
  }

  const a = currentMemoryAnalysis();
  if (!a) {
    box.innerHTML = `${filterHtml}<div class="shared-empty">분석 중 문제가 생겼습니다.</div>`;
    return;
  }
  if (selectedClusterId && !a.clusters.some(c => c.id === selectedClusterId)) selectedClusterId = null;

  box.innerHTML = `
    ${filterHtml}
    ${filtered ? `<p class="nlp-desc age-filter__note">‘${escapeHtml(Gen.ageLabel(memoryAgeFilter))}’ 참여자의 제안 ${a.total}건만으로 아래 분석을 같은 방법으로 다시 계산했습니다.</p>` : ''}
    ${renderMemoryOverview(a)}
    ${renderMemoryMapSection(a)}
    ${renderMemoryClusters(a)}
    ${renderMemoryReframe(a)}
    ${renderMemoryFrequency(a)}
    ${renderMemoryFraming(a)}
    ${filtered ? '' : renderGenerationCompare()}
    ${renderMemoryBeforeAfter(memoryItems())}
    ${renderMemoryEmpathy(a)}
    ${renderMemoryMethod(a)}`;

  drawMemoryMap();
}

/* ------------------------------------------------------------
   연령대(세대)별 보기 — 필터링한 제안을 기존 분석 함수에 그대로 넘깁니다.
   ------------------------------------------------------------ */

function memoryItems() {
  return Gen ? Gen.filterByAgeGroup(sharedNarratives, memoryAgeFilter) : sharedNarratives;
}

function currentMemoryAnalysis() {
  if (!Gen || memoryAgeFilter === 'all') return expressionAnalysis;
  if (!(memoryAgeFilter in memoryCache)) {
    try {
      memoryCache[memoryAgeFilter] = Analyzer.analyzeExpressions(memoryItems(), { narratives: eventNarratives(currentEvent()) });
    } catch (e) {
      console.error('연령대별 분석 오류:', e);
      memoryCache[memoryAgeFilter] = null;
    }
  }
  return memoryCache[memoryAgeFilter];
}

function renderAgeFilter() {
  if (!Gen) return '';
  const counts = Gen.groupCounts(sharedNarratives);
  const tabs = [['all', '전체', sharedNarratives.length]]
    .concat(Gen.AGE_GROUPS.map(g => [g.id, g.label, counts[g.id]]));
  const withAge = Gen.AGE_GROUPS.reduce((sum, g) => sum + counts[g.id], 0);
  return `
    <div class="age-filter">
      <div class="age-filter__label" id="ageFilterLabel">연령대별 보기</div>
      <div class="shared-language-tabs age-filter__tabs" role="tablist" aria-labelledby="ageFilterLabel">
        ${tabs.map(([id, label, n]) => `<button type="button" class="shared-language-tabs__tab${memoryAgeFilter === id ? ' is-active' : ''}" role="tab" aria-selected="${memoryAgeFilter === id}" data-age-filter="${id}">${label} <small>${n}</small></button>`).join('')}
      </div>
      <p class="nlp-meta">${withAge ? '' : '아직 연령대 정보가 함께 저장된 제안이 없습니다. '}연령대 정보가 없는 기존 제안과 ‘응답하지 않음’을 고른 제안은 ‘전체’에만 포함됩니다. 숫자는 제안 수입니다.</p>
    </div>`;
}

function setMemoryAgeFilter(id) {
  memoryAgeFilter = id;
  selectedClusterId = null;
  renderMemoryTab();
}

function renderGenerationCompare() {
  if (!Gen) return '';
  const counts = Gen.groupCounts(sharedNarratives);
  const anyAge = Gen.AGE_GROUPS.some(g => counts[g.id] > 0);
  const caveat = '<p class="nlp-meta">연령대별 표현 차이는 참여한 표본에서 관찰된 경향일 뿐, 해당 연령대 전체의 역사 인식을 대표하지 않습니다.</p>';
  if (!anyAge) {
    return memorySection('◫', '세대별 표현 차이', `
      <p class="nlp-desc">연령대 정보가 함께 저장된 제안이 아직 없습니다. 연령대별 참여가 모이면 같은 분석을 연령대마다 다시 계산해 나란히 보여줍니다.</p>${caveat}`);
  }

  if (!('__generation' in memoryCache)) {
    try {
      memoryCache.__generation = Gen.compareAgeGroups(sharedNarratives, {
        narratives: eventNarratives(currentEvent()),
        participantCounts: ageParticipantCounts
      });
    } catch (e) {
      console.error('세대별 비교 오류:', e);
      memoryCache.__generation = null;
    }
  }
  const r = memoryCache.__generation;
  if (!r) return '';

  const unit = ageParticipantCounts ? '명' : '건';
  const rows = r.groups.filter(g => g.expressions > 0).map(g => {
    if (!g.sufficient) {
      return `
        <div class="gen-row is-hidden">
          <div class="gen-row__age">${g.label}<small>${g.sample}${unit}</small></div>
          <div class="gen-row__muted">표본이 적어 세부 분석을 표시하지 않습니다.</div>
        </div>`;
    }
    const concepts = g.topConcepts.length
      ? g.topConcepts.map(c => `<span class="narrative-card__keyword">${escapeHtml(c.label)}</span>`).join('')
      : '<span class="nlp-meta">개념 사전과 일치하는 표현 없음</span>';
    const frames = g.frameHits
      ? Analyzer.FRAMES.map(fr => `${fr.short} ${formatPercent(g.frameShare[fr.id])}`).join(' · ')
      : '프레임 어휘 없음';
    return `
      <div class="gen-row">
        <div class="gen-row__age">${g.label}<small>${g.sample}${unit}</small></div>
        <div class="gen-row__cell"><span class="gen-row__key">많이 쓰인 개념</span><div class="nlp-chips">${concepts}</div></div>
        <div class="gen-row__cell"><span class="gen-row__key">표현 프레임</span><span class="nlp-meta">${frames}</span></div>
        <div class="gen-row__cell"><span class="gen-row__key">서술과의 평균 유사도</span><strong>${formatNum(g.meanNarrativeSimilarity)}</strong></div>
      </div>`;
  }).join('');

  const eligibleLabels = r.groups.filter(g => g.sufficient).map(g => g.label);
  let verdict;
  if (!r.comparable) {
    verdict = `세대를 비교하려면 ${r.minSize}명 이상 참여한 연령대가 2개 이상 필요합니다. 현재 조건을 충족한 연령대: ${eligibleLabels.length ? eligibleLabels.join('·') : '없음'}.`;
  } else {
    const d = r.differences;
    const frame = Analyzer.FRAMES.find(fr => fr.id === d.frameId);
    const nums = `표현 프레임 비율 차이 최대 ${Math.round(d.frameShare * 100)}%p${frame ? `(${frame.short})` : ''}, 국가별 서술과의 평균 유사도 차이 ${formatNum(d.similarity)}`;
    const top = d.sameTopConcept ? '가장 많이 쓰인 개념은 같았습니다.' : '가장 많이 쓰인 개념은 연령대마다 달랐습니다.';
    verdict = r.verdict === 'small'
      ? `${eligibleLabels.join('·')} 사이의 표현 차이는 크지 않았습니다. (${nums}) ${top}`
      : `${eligibleLabels.join('·')} 사이에 일부 차이가 관찰되었습니다. (${nums}) ${top}`;
  }

  return memorySection('◫', '세대별 표현 차이', `
    <p class="nlp-desc">연령대별로 제안을 나눠 같은 분석을 다시 실행한 결과입니다. ${r.minSize}명 미만인 연령대는 세부 결과를 표시하지 않습니다.</p>
    <div class="gen-table">${rows}</div>
    <p class="nlp-desc">${verdict}</p>
    <p class="nlp-meta">“차이가 크지 않음”은 프레임 비율 차이 ${Math.round(Gen.DIFF_THRESHOLDS.frameShare * 100)}%p 미만, 유사도 차이 ${Gen.DIFF_THRESHOLDS.similarity} 미만일 때의 기술적 표현이며 통계적 검정 결과가 아닙니다.</p>
    ${caveat}`);
}

function drawMemoryMap() {
  const container = document.getElementById('memoryMap');
  const a = currentMemoryAnalysis();
  if (!container || !MemoryMap || !a) return;
  MemoryMap.render(container, a, { selectedId: selectedClusterId, onSelect: selectCluster });
}

function selectCluster(id) {
  selectedClusterId = selectedClusterId === id ? null : id;
  drawMemoryMap();
  document.querySelectorAll('.cluster-card').forEach(card => {
    const on = card.dataset.clusterId === selectedClusterId;
    card.classList.toggle('is-selected', on);
    if (on) {
      const details = card.querySelector('details');
      if (details) details.open = true;
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

function memorySection(icon, title, body, extraClass) {
  return `
    <section class="ai-result__section memory-section${extraClass ? ' ' + extraClass : ''}">
      <div class="ai-result__heading"><span>${icon}</span><span>${title}</span></div>
      ${body}
    </section>`;
}

function renderMemoryOverview(a) {
  const langs = ['ko', 'ja', 'en', 'unknown'].filter(l => a.byLanguage[l] > 0)
    .map(l => `${getLangBadge(l).label} ${a.byLanguage[l]}`).join(' · ');
  const few = a.total < 3
    ? '<p class="nlp-desc"><small>제안이 아직 적어 표현군이 뚜렷하게 나타나지 않을 수 있습니다. 제안이 모일수록 경향이 더 분명해집니다.</small></p>'
    : '';
  return `
    <div class="memory-stats">
      <div class="memory-stat"><strong>${a.total}</strong><span>전체 제안</span></div>
      <div class="memory-stat"><strong>${a.clusters.length}</strong><span>표현군</span></div>
      <div class="memory-stat"><strong>${a.meta.clustered}</strong><span>표현군에 속한 제안</span></div>
      <div class="memory-stat"><strong>${formatNum(a.similarity.mean)}</strong><span>제안 간 평균 텍스트 유사도</span></div>
    </div>
    <p class="nlp-desc memory-langs">언어별 제안 수 — ${langs}</p>
    ${few}`;
}

function renderMemoryMapSection(a) {
  if (!a.clusters.length) {
    return memorySection('◌', 'Shared Memory Map', `
      <p class="nlp-desc">아직 서로 비슷한 제안끼리 묶인 표현군이 없습니다. 비슷한 표현이 2건 이상 모이면 지도에 원으로 나타납니다.</p>`);
  }
  return memorySection('◌', 'Shared Memory Map', `
    <p class="nlp-desc">원 하나가 하나의 표현군입니다. <strong>원의 크기</strong>는 제안 수, <strong>선</strong>은 표현군 사이의 텍스트 유사도(굵을수록 가까움)를 나타냅니다. 원을 누르면 해당 표현군의 제안을 볼 수 있습니다.<br />
      <small>원의 위치는 보기 좋게 배치한 것으로, 거리 자체에는 의미가 없습니다. 짙은 원은 현재 참여자 제안에서 가장 큰 표현군입니다.</small></p>
    <div class="memory-map" id="memoryMap"></div>
    ${a.unclustered.length ? `<p class="nlp-meta">아직 다른 제안과 묶이지 않은 개별 제안 ${a.unclustered.length}건은 지도에 표시하지 않고 아래 목록에 따로 보여줍니다.</p>` : ''}`);
}

function expressionQuote(item, extra) {
  return `
    <li class="cluster-member">
      <span class="cluster-member__text">“${escapeHtml(item.text)}”</span>
      <span class="nlp-meta">— ${escapeHtml(item.user || '익명')} · ${getLangBadge(item.lang).label}${extra || ''}</span>
    </li>`;
}

function renderMemoryClusters(a) {
  const cards = a.clusters.map((c, i) => {
    const rep = a.items[c.representative];
    const langs = Object.keys(c.languages).map(l => `${getLangBadge(l).label} ${c.languages[l]}`).join(' · ');
    const conceptChips = c.concepts.slice(0, 4).map(x => `<span class="narrative-card__keyword" title="${x.count}건에 등장">${escapeHtml(x.label)}</span>`).join('');
    const members = c.members.map(idx => expressionQuote(a.items[idx])).join('');
    return `
      <article class="cluster-card${i === 0 ? ' is-largest' : ''}${c.id === selectedClusterId ? ' is-selected' : ''}" data-cluster-id="${c.id}">
        <div class="cluster-card__top">
          <span class="cluster-card__rank">표현군 ${String(i + 1).padStart(2, '0')}</span>
          ${i === 0 ? '<span class="cluster-card__badge">현재 참여자 제안에서 가장 큰 표현군</span>' : ''}
        </div>
        <h4 class="cluster-card__title">${escapeHtml(c.label)}</h4>
        <div class="cluster-card__size"><strong>${c.size}건</strong> / 전체 제안의 ${formatPercent(c.share)}</div>
        <span class="nlp-bar"><span class="nlp-bar__fill" style="width:${Math.round(c.share * 100)}%"></span></span>
        <div class="cluster-card__block">
          <span class="narrative-card__label">핵심 표현</span>
          <div class="nlp-chips">${c.keywords.map(k => `<span class="nlp-chip nlp-chip--static">${escapeHtml(k.term)}<small>${k.count}건</small></span>`).join('') || '<span class="nlp-meta">공통 어휘 없음</span>'}</div>
          ${conceptChips ? `<div class="nlp-chips cluster-card__concepts">${conceptChips}</div>` : ''}
        </div>
        <blockquote class="cluster-card__quote">
          “${escapeHtml(rep.text)}”
          <cite>— ${escapeHtml(rep.user || '익명')} · 표현군의 다른 제안들과 가장 비슷한 제안 (우수작·정답이 아님)</cite>
        </blockquote>
        <div class="nlp-meta">${langs} · 표현군 안 평균 텍스트 유사도 ${formatNum(c.cohesion)}</div>
        <details class="cluster-card__members">
          <summary>이 표현군의 제안 보기 (${c.size})</summary>
          <ul>${members}</ul>
        </details>
      </article>`;
  }).join('');

  const singles = a.unclustered.length ? `
    <details class="cluster-singles">
      <summary>아직 묶이지 않은 개별 제안 ${a.unclustered.length}건 보기</summary>
      <ul>${a.unclustered.map(idx => expressionQuote(a.items[idx])).join('')}</ul>
    </details>` : '';

  return memorySection('◍', '공동 표현군 (Shared Memory Cluster)', `
    <p class="nlp-desc">서로 비슷한 제안을 자동으로 묶은 결과입니다. 표현군 이름은 절반 이상의 제안에 나타난 개념 또는 대표 키워드로 자동 생성됩니다.<br />
      <small>가장 큰 표현군은 “현재 가장 많은 참여자가 비슷하게 쓴 방식”일 뿐, 가장 올바르거나 객관적인 표현이라는 뜻이 아닙니다.</small></p>
    ${cards ? `<div class="cluster-grid">${cards}</div>` : '<p class="nlp-meta">아직 표현군이 없습니다.</p>'}
    ${singles}`);
}

function originMarks(presentIn) {
  return `<span class="origin-dots" title="${presentIn.length ? presentIn.map(nlpCountryName).join('·') + ' 서술에도 등장' : '국가별 서술에는 없던 표현'}">${
    NLP_COUNTRIES.map(c => `<i class="dot dot--${c.key}${presentIn.indexOf(c.key) >= 0 ? '' : ' is-off'}"></i>`).join('')}</span>`;
}

function renderMemoryReframe(a) {
  const link = a.narrativeLink;
  if (!link || !eventNlp) return '';

  const national = NLP_COUNTRIES.map(c => {
    const terms = (eventNlp.distinctive[c.key] || []).slice(0, 3).map(d => d.term);
    return `
      <div class="reframe__col nlp-col nlp-col--${c.key}">
        <div class="nlp-col__head">${c.flag} ${c.name} 서술에서 두드러진 표현</div>
        <div class="reframe__terms">${terms.map(escapeHtml).join(' · ') || '<span class="nlp-meta">없음</span>'}</div>
      </div>`;
  }).join('');
  const commonTerms = eventNlp.common.filter(e => !e.isPhrase).slice(0, 4).map(e => e.term);

  const participantTerms = link.terms.slice(0, 10).map(t => `
    <li class="reframe__item">
      <span class="reframe__term">${escapeHtml(t.term)}</span>
      <span class="nlp-meta">${t.count}건</span>
      ${originMarks(t.presentIn)}
      ${t.origin === 'new' ? '<span class="nlp-badge">새로 등장</span>' : ''}
    </li>`).join('');
  const participantConcepts = link.concepts.slice(0, 8).map(t => `
    <li class="reframe__item">
      <span class="reframe__term">${escapeHtml(t.label)}</span>
      <span class="nlp-meta">${t.count}건</span>
      ${originMarks(t.presentIn)}
      ${t.origin === 'new' ? '<span class="nlp-badge">새로 등장</span>' : ''}
    </li>`).join('');

  const s = link.summary;
  const avg = NLP_COUNTRIES.map(c => simBar(c.key, c.name, link.averageSimilarity[c.key])).join('');

  return memorySection('⇣', '국가별 서술 → 참여자의 공동 표현', `
    <p class="nlp-desc reframe__question">“서로 다른 국가별 서술을 읽은 뒤, 참여자들은 어떤 표현을 공통적으로 선택했는가?”</p>
    <div class="nlp-grid">${national}</div>
    ${commonTerms.length ? `<p class="nlp-meta reframe__common">세 서술 공통: ${commonTerms.map(escapeHtml).join(' · ')}</p>` : ''}
    <div class="reframe__arrow" aria-hidden="true">↓</div>
    <div class="reframe__participants">
      <div>
        <div class="nlp-col__head">참여자 제안에 자주 쓰인 어휘</div>
        <ul class="reframe__list">${participantTerms || '<li class="nlp-meta">없음</li>'}</ul>
      </div>
      <div>
        <div class="nlp-col__head">참여자 제안에 반복된 개념 <small class="nlp-meta">(다국어 통합)</small></div>
        <ul class="reframe__list">${participantConcepts || '<li class="nlp-meta">개념 사전과 일치하는 표현이 아직 없습니다.</li>'}</ul>
      </div>
    </div>
    <p class="nlp-desc">색 점은 그 표현이 어느 국가 서술에도 나왔는지를 뜻합니다 (${NLP_COUNTRIES.map(c => `<i class="dot dot--${c.key}"></i>${c.name}`).join(' ')}).
      참여자 주요 어휘 ${link.terms.length}개 가운데 <strong>세 서술 공통</strong> ${s.common}개 · <strong>일부 서술에만 있던 어휘</strong> ${s.partial}개 · <strong>서술에 없던 새 어휘</strong> ${s.new}개입니다.</p>
    <div class="nlp-desc nlp-desc--sub">참여자 제안과 각 국가 서술의 평균 텍스트 유사도</div>
    <div class="reframe__sims">${avg}</div>
    <p class="nlp-meta">어휘·개념이 얼마나 겹치는지를 나타낼 뿐, 어느 국가의 관점이 옳다거나 참여자가 특정 국가 편이라는 뜻이 아닙니다.</p>`);
}

function renderMemoryFrequency(a) {
  const max = a.topTerms.length ? a.topTerms[0].count : 1;
  const termRows = a.topTerms.map(t => `
    <li class="nlp-row">
      <span class="nlp-chip nlp-chip--static">${escapeHtml(t.term)}</span>
      <span class="nlp-bar"><span class="nlp-bar__fill" style="width:${Math.round(t.count / max * 100)}%"></span></span>
      <span class="nlp-meta">${t.count}건 (${formatPercent(t.share)})</span>
    </li>`).join('');
  const cmax = a.topConcepts.length ? a.topConcepts[0].count : 1;
  const conceptRows = a.topConcepts.map(t => `
    <li class="nlp-row">
      <span class="nlp-chip nlp-chip--static">${escapeHtml(t.label)}</span>
      <span class="nlp-bar"><span class="nlp-bar__fill nlp-bar__fill--soft" style="width:${Math.round(t.count / cmax * 100)}%"></span></span>
      <span class="nlp-meta">${t.count}건 · ${t.langs.map(l => getLangBadge(l).label).join('·')}</span>
    </li>`).join('');
  return memorySection('★', '자주 등장하는 어휘와 반복되는 개념', `
    <p class="nlp-desc">몇 개의 제안에 등장했는지(문서 빈도)를 셉니다. 한 제안 안에서 여러 번 써도 1건으로 셉니다.</p>
    <div class="memory-two">
      <div><div class="nlp-col__head">주요 어휘</div><ul class="nlp-rows">${termRows || '<li class="nlp-meta">없음</li>'}</ul></div>
      <div><div class="nlp-col__head">반복되는 개념 (개념 사전)</div><ul class="nlp-rows">${conceptRows || '<li class="nlp-meta">없음</li>'}</ul></div>
    </div>`);
}

function renderMemoryFraming(a) {
  const f = a.framing;
  const total = f.totalHits || 1;
  const rows = Analyzer.FRAMES.map(fr => `
    <div class="frame-row">
      <div class="frame-row__label"><strong>${fr.label}</strong><small>${escapeHtml(fr.desc)}</small></div>
      <span class="nlp-bar"><span class="nlp-bar__fill frame-fill--${fr.id}" style="width:${Math.round(f.overall[fr.id] / total * 100)}%"></span></span>
      <span class="nlp-meta">어휘 ${f.overall[fr.id]}회 · 제안 ${f.expressions[fr.id]}건</span>
    </div>`).join('');
  const langRows = Object.keys(f.byLanguage).map(l => {
    const r = f.byLanguage[l];
    return `<li>${getLangBadge(l).label} (${r.count}건) — ${Analyzer.FRAMES.map(fr => `${fr.short} ${r[fr.id]}`).join(' · ')}</li>`;
  }).join('');
  return memorySection('◈', '표현 프레이밍 분석', `
    <p class="nlp-desc">참여자 제안에 어떤 결의 어휘가 쓰였는지 개념 사전으로 셉니다. 이전의 “긍정·중립·부정 감정 분석”을 역사 서술에 맞게 바꾼 보조 분석입니다.</p>
    ${rows}
    <ul class="ai-result__list">${langRows}</ul>
    <p class="nlp-meta">${f.noHit ? `프레임 어휘가 하나도 없는 제안 ${f.noHit}건은 집계에서 빠집니다. ` : ''}이 분석은 역사적 가치판단이 아니라 표현의 언어적 특징입니다. 사전 기반이라 목록에 없는 표현은 세지 못하고, 부정문·인용·반어 같은 문맥은 구분하지 못합니다.</p>`);
}

function renderMemoryBeforeAfter(source) {
  const event = currentEvent();
  const withBefore = (source || sharedNarratives).filter(it => it.before);
  if (!withBefore.length) {
    return memorySection('↻', '탐구 전 → 탐구 후 표현 변화', `
      <p class="nlp-desc">탐구 전 표현과 함께 등록된 제안이 아직 없습니다. 페이지 상단의 “탐구 전 한 문장”을 적은 뒤 공동 표현을 등록하면, 서술과 분석을 본 뒤 표현이 어떻게 달라졌는지가 여기에 집계됩니다.</p>`);
  }
  const r = Analyzer.aggregateBeforeAfter(withBefore, { narratives: eventNarratives(event) });
  const chips = list => list.length ? list.map(x => `<span class="nlp-chip nlp-chip--static">${escapeHtml(x.label)}<small>${x.count}</small></span>`).join('') : '<span class="nlp-meta">없음</span>';
  const shift = NLP_COUNTRIES.map(c => {
    const s = r.narrativeShift[c.key];
    return `<li>${c.name} 서술과의 평균 텍스트 유사도 ${formatNum(s.before)} → ${formatNum(s.after)} <span class="nlp-meta">(${s.delta >= 0 ? '+' : ''}${formatNum(s.delta)})</span></li>`;
  }).join('');
  return memorySection('↻', '탐구 전 → 탐구 후 표현 변화', `
    <p class="nlp-desc">탐구 전 표현이 함께 저장된 제안 ${r.count}건을 비교했습니다. 탐구 전·후 문장의 평균 텍스트 유사도는 ${formatNum(r.meanSimilarity)}입니다.</p>
    <div class="draft-ba"><span>새롭게 등장한 개념</span><div class="nlp-chips">${chips(r.addedConcepts)}</div></div>
    <div class="draft-ba"><span>새롭게 등장한 어휘</span><div class="nlp-chips">${chips(r.addedTerms)}</div></div>
    <div class="draft-ba"><span>유지된 개념</span><div class="nlp-chips">${chips(r.keptConcepts)}</div></div>
    <div class="draft-ba"><span>사라진 개념</span><div class="nlp-chips">${chips(r.removedConcepts)}</div></div>
    <ul class="ai-result__list">${shift}</ul>
    <p class="nlp-meta">탐구 전 표현을 적은 참여자만 집계되므로 전체 참여자를 대표하지 않습니다.</p>`);
}

function renderMemoryEmpathy(a) {
  if (!empathyAvailable) return '';
  const r = Analyzer.compareEmpathy(a, empathyCounts);
  if (!r || !r.top.length) {
    return memorySection('♡', '공감과 표현군 비교', '<p class="nlp-desc">아직 공감 표시가 없습니다. 제안 목록의 “공동 표현으로 공감해요” 버튼으로 참여할 수 있어요.</p>');
  }
  const clusterLabel = id => {
    const c = a.clusters.find(x => x.id === id);
    return c ? `표현군 ${String(c.rank).padStart(2, '0')}` : '개별 제안';
  };
  const list = r.top.map(x => expressionQuote(x.item, ` · 공감 ${x.count} · ${clusterLabel(x.clusterId)}`)).join('');
  const verdict = r.largestClusterId
    ? (r.topInLargest
      ? '가장 많은 공감을 받은 제안은 현재 가장 큰 표현군에 속해 있습니다.'
      : '가장 많은 공감을 받은 제안은 현재 가장 큰 표현군에 속해 있지 않습니다. 많이 쓰인 방식과 많이 공감받은 방식이 다를 수 있습니다.')
    : '아직 표현군이 없어 비교할 수 없습니다.';
  return memorySection('♡', '공감과 표현군 비교', `
    <p class="nlp-desc">${verdict}</p>
    <ul class="cluster-members">${list}</ul>
    <p class="nlp-meta">공감 수는 참여자의 반응일 뿐 역사적 정답의 순위가 아닙니다. 공감은 브라우저마다 한 제안에 한 번만 표시할 수 있습니다.</p>`);
}

function renderMemoryMethod(a) {
  return `
    <details class="ai-result__section nlp-method">
      <summary class="ai-result__heading"><span>?</span><span>공동 표현 분석 방법과 한계</span></summary>
      <ul class="ai-result__list">
        <li><strong>데이터</strong>: Supabase에 저장된 이 사건의 공동 표현 ${a.total}건(최신 ${Store ? Store.LOAD_LIMIT : 500}건까지). 결과는 불러올 때마다 다시 계산되며 미리 정해 둔 값이 없습니다.</li>
        <li><strong>언어 판별·토큰화</strong>: 한글·가나·라틴 문자 비율로 언어를 판별합니다. 한국어는 규칙 기반 조사·어미 제거, 일본어는 한자·가타카나 연속 구간, 영어는 불용어 제거와 간단한 어미 정리를 사용합니다.</li>
        <li><strong>특징 벡터</strong>: 단어 + 문자 2-gram(예: “국제전쟁”과 “국제적인 전쟁”이 겹치도록) + 다국어 개념 사전(예: 침략·侵略·invasion을 같은 개념으로)을 TF-IDF로 가중합니다. IDF는 이 사건의 공동 표현과 국가별 서술 전체에서 계산합니다.</li>
        <li><strong>유사도</strong>: 두 벡터의 코사인 유사도(0~1).</li>
        <li><strong>표현군</strong>: 평균 연결 병합 군집화 — 평균 유사도가 가장 높은 두 묶음을 차례로 합치고, 평균 유사도가 ${a.meta.clusterThreshold} 미만이 되면 멈춥니다. 무작위성이 없어 같은 데이터에서는 항상 같은 결과가 나옵니다. ${a.meta.minClusterSize}건 이상인 묶음만 표현군으로 표시합니다.${a.meta.capped ? ` 제안이 많아 앞쪽 ${a.meta.maxClusterItems}건으로 묶음을 만든 뒤 나머지는 가장 가까운 묶음에 배정했습니다.` : ''}</li>
        <li><strong>표현군 이름·대표 제안</strong>: 절반 이상의 제안에 나타난 개념(없으면 “군집 안 등장 제안 수 × IDF”가 높은 어휘)으로 이름을 짓고, 다른 제안들과의 평균 유사도가 가장 높은 제안(medoid)을 대표 제안으로 보여줍니다.</li>
        <li><strong>지도의 연결선</strong>: 표현군 중심 벡터 사이의 코사인 유사도가 ${a.meta.linkThreshold} 이상일 때 그립니다.</li>
        <li><strong>의미 유사도에 대해</strong>: 딥러닝 문장 임베딩은 사용하지 않습니다. 모델 파일이 수십~수백 MB라 GitHub Pages에서 첫 화면이 크게 느려지고, 외부 API는 키를 브라우저에 노출해야 하기 때문입니다. 대신 문자 n-gram과 개념 사전으로 “표현은 다르지만 같은 뜻”인 경우를 일부 잡아냅니다.</li>
        <li><strong>한계</strong>: 개념 사전에 없는 동의어·비유·문맥(부정문, 인용)은 반영되지 않습니다. 제안 수가 적으면 표현군이 불안정합니다. 이 분석은 참여자 제안의 경향을 보여줄 뿐, 역사적 정답이나 “가장 객관적인 표현”을 판정하지 않습니다.</li>
      </ul>
    </details>`;
}

/* ------------------------------------------------------------
   첫 방문 온보딩 — 연령대(선택) · 참여자 수
   · 연령대는 이 브라우저에만 보관했다가 공동 표현을 등록할 때 age_group으로 함께 저장합니다.
   · 정확한 나이·생년월일·학교·이름·연락처는 묻지 않습니다.
   ------------------------------------------------------------ */

const AGE_STORAGE_KEY = 'sm_age_group';

function getAgeGroup() {
  const v = Store ? Store.storageGet(AGE_STORAGE_KEY) : null;
  return Gen ? Gen.normalizeAgeGroup(v) : null;
}
function setAgeGroup(value) {
  if (Store) Store.storageSet(AGE_STORAGE_KEY, value || '');
}

function renderAgeOptions() {
  const boxes = document.querySelectorAll('[data-age-options]');
  if (!Gen) {
    boxes.forEach(box => { box.hidden = true; });
    document.getElementById('formAgeLabel')?.setAttribute('hidden', '');
    return;
  }
  const selected = getAgeGroup();
  const options = Gen.AGE_GROUPS.concat([Gen.AGE_NO_ANSWER]);
  boxes.forEach(box => {
    box.innerHTML = options.map(g => `
      <button type="button" class="age-chip${g.id === Gen.AGE_NO_ANSWER.id ? ' age-chip--quiet' : ''}${selected === g.id ? ' is-selected' : ''}" aria-pressed="${selected === g.id}" data-age-value="${g.id}">${escapeHtml(g.label)}</button>`).join('');
  });
}

function handleAgeChoice(value, context) {
  setAgeGroup(value);
  renderAgeOptions();
  if (context === 'start') {
    // 고른 뒤 바로 넘기지 않고 "다음 → 역사 선택" 버튼을 보여줍니다 (선택을 확인하고 넘어가도록).
    const next = document.getElementById('agePickerNext');
    if (next) next.hidden = false;
    const chosen = document.querySelector('#agePicker [data-age-value].is-selected');
    (document.getElementById('agePickerNextBtn') || chosen)?.focus({ preventScroll: true });
    next?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function closeAgePicker() {
  const picker = document.getElementById('agePicker');
  if (picker) picker.hidden = true;
  document.getElementById('startButton')?.setAttribute('aria-expanded', 'false');
}

function gotoEvents(mode) {
  eventsMode = mode === 'memory' ? 'memory' : 'participate';
  renderEventsHeader();
  navigateTo('events');
}

/* "참여하기": 연령대를 아직 고르지 않았다면 첫 화면의 참여 시작 영역을 먼저 엽니다. */
function startExploration() {
  const picker = document.getElementById('agePicker');
  const button = document.getElementById('startButton');
  // 이미 연령대를 골랐거나(응답하지 않음 포함) 선택 UI를 쓸 수 없으면 바로 역사 선택으로 갑니다.
  if (getAgeGroup() || !Gen || !picker) { gotoEvents('participate'); return; }
  const fromOtherPage = !document.querySelector('.page--home.active');
  if (fromOtherPage) navigateTo('home');
  picker.hidden = false;
  document.getElementById('agePickerNext')?.setAttribute('hidden', '');
  button?.setAttribute('aria-expanded', 'true');
  setTimeout(() => {
    picker.scrollIntoView({ behavior: 'smooth', block: fromOtherPage ? 'center' : 'nearest' });
    picker.querySelector('[data-age-value]')?.focus({ preventScroll: true });
  }, fromOtherPage ? 400 : 50);
}

/* 사건 선택 페이지는 두 가지 목적으로 씁니다: 참여하기(기본) / 결과(Shared Memory) 보기 */
let eventsMode = 'participate';
const EVENTS_COPY = {
  participate: {
    eyebrow: 'STEP 02',
    title: '어떤 역사에 대한 생각을 남겨볼까요?',
    desc: '하나를 선택해주세요.<br />세 나라의 표현을 살펴본 뒤 당신의 생각을 한 문장으로 남길 수 있습니다.'
  },
  memory: {
    eyebrow: 'SHARED MEMORY',
    title: '어떤 역사의 Shared Memory를 볼까요?',
    desc: '하나를 선택하면 다른 참여자들이 남긴 답변과<br />세대별로 어떻게 기억했는지를 바로 볼 수 있습니다.'
  }
};

function renderEventsHeader() {
  const copy = EVENTS_COPY[eventsMode];
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('eventsEyebrow', copy.eyebrow);
  set('eventsTitle', copy.title);
  set('eventsDesc', copy.desc);
}

/** 첫 화면의 참여자 수 — Supabase 집계 함수 결과만 사용합니다 (하드코딩 없음). */
async function loadParticipantCount() {
  const el = document.getElementById('participantCount');
  if (!el || !Store || !Store.fetchParticipationSummary) return;
  const r = await Store.fetchParticipationSummary();
  if (!r.available || !r.participants) { el.hidden = true; return; }
  el.innerHTML = `현재 <strong>${r.participants.toLocaleString('ko-KR')}</strong>명이 Shared Memory에 참여했습니다.`;
  el.hidden = false;
}

/* ------------------------------------------------------------
   초기화 · 이벤트 연결
   ------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-event-count]').forEach(el => { el.textContent = String(eventsData.length); });
  renderEventCards();
  renderAgeOptions();
  navigateTo('home');
  loadParticipantCount();

  document.getElementById('startButton')?.addEventListener('click', startExploration);
  document.addEventListener('click', e => {
    const age = e.target.closest('[data-age-value]');
    if (!age) return;
    const box = age.closest('[data-age-options]');
    handleAgeChoice(age.dataset.ageValue, box ? box.dataset.ageOptions : 'form');
  });

  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      // 상단 메뉴: "지금 참여하기"는 참여 시작 영역부터, "Shared Memory 보기"는 결과 보기용 사건 선택으로
      if (el.dataset.view === 'participate') { startExploration(); return; }
      if (el.dataset.view === 'memory') { gotoEvents('memory'); return; }
      navigateTo(el.dataset.page);
    });
  });
  document.getElementById('agePickerNextBtn')?.addEventListener('click', () => {
    closeAgePicker();
    gotoEvents('participate');
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  document.getElementById('aiAnalyzeBtn')?.addEventListener('click', runAIAnalysis);
  document.getElementById('aiResult')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-nlp-term]');
    if (chip) selectNLPTerm(chip.dataset.nlpTerm);
  });

  // 상세 페이지 전체에서 쓰는 이동 버튼 (탭 이동 / 사료 카드 / 원문 근거)
  document.querySelector('.page--detail')?.addEventListener('click', e => {
    const goto = e.target.closest('[data-goto-tab]');
    if (goto) { gotoTab(goto.dataset.gotoTab); return; }
    const source = e.target.closest('[data-goto-source]');
    if (source) { gotoSource(source.dataset.gotoSource); return; }
    const evidence = e.target.closest('[data-evidence-term]');
    if (evidence) { showEvidenceFor(evidence.dataset.evidenceTerm); return; }
    const filter = e.target.closest('[data-sources-filter]');
    if (filter) { sourcesFilter = filter.dataset.sourcesFilter; renderSourcesTab(); return; }
    const beforeAction = e.target.closest('[data-before-action]');
    if (beforeAction) { handleBeforeAction(beforeAction.dataset.beforeAction); return; }
    const prior = e.target.closest('[data-prior-value]');
    if (prior) { handlePriorAnswer(prior.dataset.priorValue); return; }
    if (e.target.closest('[data-prior-action="edit"]')) { priorEditing = true; renderBeforeCard(); return; }
    const flowStep = e.target.closest('[data-flow-step]');
    if (flowStep) { gotoFlowStep(flowStep.dataset.flowStep); return; }
    const ageFilter = e.target.closest('[data-age-filter]');
    if (ageFilter) { setMemoryAgeFilter(ageFilter.dataset.ageFilter); return; }
  });

  document.getElementById('beforeCard')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'beforeInput') { e.preventDefault(); handleBeforeAction('save'); }
  });

  // 작성 가이드
  document.querySelector('.shared-form')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-guide-key]');
    if (chip) { toggleGuideCandidate(chip.dataset.guideKey, chip); return; }
    const style = e.target.closest('[data-guide-style]');
    if (style) { selectGuideStyle(style.dataset.guideStyle); return; }
    const template = e.target.closest('[data-guide-template]');
    if (template) { insertTemplate(template.dataset.guideTemplate); return; }
  });
  document.getElementById('guideReasons')?.addEventListener('change', e => {
    const cb = e.target.closest('[data-guide-reason]');
    if (!cb) return;
    if (cb.checked) guideState.reasons.add(cb.value); else guideState.reasons.delete(cb.value);
  });
  document.getElementById('userNarrative')?.addEventListener('input', scheduleDraftPanel);
  document.getElementById('submitNarrative')?.addEventListener('click', submitSharedNarrative);

  // 공동 표현 목록 (공감 / 참고 번역 예시 / 더 보기)
  document.getElementById('sharedList')?.addEventListener('click', e => {
    const empathy = e.target.closest('[data-empathy-id]');
    if (empathy) { handleEmpathy(empathy.dataset.empathyId, empathy); return; }
    const translate = e.target.closest('[data-translate-id]');
    if (translate) { toggleTranslation(translate.dataset.translateId); return; }
    if (e.target.closest('[data-shared-more]')) { sharedVisibleCount += 20; renderSharedList(); }
  });

  // 화면 너비가 바뀌면 지도를 다시 그립니다 (모바일 회전 등)
  let resizeTimer = null;
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (document.querySelector('[data-tab-content="memory"].active')) drawMemoryMap();
    }, 200);
  });

  console.log('🎌 Shared Memory Project 로드 완료');
  console.log(`📚 등록된 사건: ${eventsData.length}개 · 등록된 자료: ${SOURCES.length}개`);
});
