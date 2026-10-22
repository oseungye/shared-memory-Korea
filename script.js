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
const Card = window.MemoryCard || null;
const Choices = window.ChoiceQuestions || null;
const Themes = window.CardThemes || null;
const Guide = window.ContributionGuide || { STYLES: [], TEMPLATES: [], REASONS: [] };
const Store = window.SharedStore || null;
const MemoryMap = window.SharedMemoryMap || null;
const Narrator = window.NarratorAnalysis || null;
const FOURTH_DATA = typeof fourthNarratorData !== 'undefined' ? fourthNarratorData : null;
// AI 답변 기록: 형식 검사(질문 원문 일치 등)를 통과한 기록만 화면에 씁니다.
const AI_RECORDS = (Narrator && FOURTH_DATA && typeof aiNarrativesData !== 'undefined' && Array.isArray(aiNarrativesData.records))
  ? aiNarrativesData.records.filter(r => Narrator.validateRecord(r, FOURTH_DATA.questions).length === 0)
  : [];
const SOURCES = typeof sourcesData !== 'undefined' ? sourcesData : [];

// 공동 표현 작성 언어 — 표시 순서: 한국어 · 中文 · 日本語 · English
// ('unknown'은 언어 정보가 없던 기존 데이터 호환용으로만 통계에 남깁니다)
const EXPRESSION_LANGS = Analyzer ? Analyzer.LANGS.slice() : ['ko', 'zh', 'ja', 'en'];
const EXPRESSION_LANGS_WITH_UNKNOWN = EXPRESSION_LANGS.concat(['unknown']);
let writingLangChoice = null;         // 참여자가 직접 고른 작성 언어 (null이면 자동 감지)

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
  // 사건 화면·카드 화면에서만 주소에 사건 링크(#/e/사건)를 남깁니다. 다른 화면으로 가면 지웁니다.
  if (pageName !== 'detail' && pageName !== 'card') setRouteHash(null);
  if (pageName === 'qr') renderQrSheet();
}

/* ------------------------------------------------------------
   사건별 바로가기 링크 (QR) — #/e/imjin
   · 해시 주소라 GitHub Pages에서 서버 설정 없이 동작합니다.
   · 주소를 바꿀 때 history.replaceState를 써서 뒤로 가기 기록을 늘리지 않습니다.
   ------------------------------------------------------------ */

function routeEventId() {
  if (!Card) return null;
  return Card.parseEventRoute(window.location.hash, window.location.search, eventsData.map(e => e.id));
}

function setRouteHash(eventId) {
  if (!Card || !window.history || !window.history.replaceState) return;
  const want = eventId ? Card.eventHash(eventId) : '';
  if ((window.location.hash || '') === want) return;
  if (!eventId && !/^#\/?e\//.test(window.location.hash || '')) return;   // 다른 해시는 건드리지 않음
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search + want);
  } catch (e) { /* file:// 등에서 실패해도 화면은 그대로 동작 */ }
}

function isReloadNavigation() {
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    return !!(nav && nav.type === 'reload');
  } catch (e) { return false; }
}

function siteBaseUrl() {
  return window.location.origin + window.location.pathname;
}

/** 링크로 들어온 경우 사건을 바로 엽니다. 이미 그 사건이 열려 있으면 아무것도 하지 않습니다. */
function openRouteEvent(routeId) {
  const id = routeId || routeEventId();
  if (!id) return false;
  const onDetail = document.querySelector('.page--detail.active, .page--card.active');
  if (onDetail && id === currentEventId) return true;
  eventsMode = 'participate';
  openEventDetail(id, { quick: true });     // QR·사건 링크는 학생용 기본 체험으로
  return true;
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
        ${event.featured ? '<span class="event-card__featured">먼저 살펴보기</span>' : ''}
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

/**
 * @param {string} eventId
 * @param {{quick?: boolean}} [opts]  quick: 기본 체험으로 열기 (첫 화면 큰 사건 카드·QR 링크).
 *   사건 목록('전체 탐구')·'Shared Memory 보기'는 기존 심화 탐구 4단계로 엽니다.
 */
function openEventDetail(eventId, opts) {
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;
  // 이전 참여 기록이 있는데 이 창에서 아직 "누가 참여하는지" 고르지 않았다면 먼저 묻습니다.
  if (!ensureParticipantChoice(() => openEventDetail(eventId, opts), opts && opts.quick ? 'quick' : 'event')) return;

  currentEventId = eventId;
  // 서술 NLP 결과는 형광펜·공통점/차이점 카드·작성 가이드·사료 연결·공동 기억 지도에서 쓰므로 먼저 한 번 계산합니다.
  eventNlp = computeEventNlp(event);

  document.getElementById('detailHeader').innerHTML = `
    <div class="detail__era">${event.era}</div>
    <h2 class="detail__title">${event.title}</h2>
    ${event.question ? `<p class="detail__question"><span class="detail__question-label">오늘의 질문</span>${escapeHtml(event.question)}</p>` : ''}
    <p class="detail__desc">${event.shortDesc}</p>
  `;

  const countries = [
    { key: 'korea', name: '한국', en: 'KOREA', flag: '韓', titleField: event.title, lang: 'ko' },
    { key: 'japan', name: '일본', en: 'JAPAN', flag: '日', titleField: event.titleJP, lang: 'ja' },
    { key: 'china', name: '중국', en: 'CHINA', flag: '中', titleField: event.titleCN, lang: 'zh-Hans' }
  ];

  document.getElementById('narrativesGrid').innerHTML = countries.map(c => {
    const n = event[c.key];
    return `
      <div class="narrative-card narrative-card--${c.key}">
        <div class="narrative-card__flag">
          <div class="narrative-card__flag-mark">${c.flag}</div>
          <div>
            <div class="narrative-card__country">${c.name} <small class="narrative-card__scope">측 요약 서술</small></div>
            <div class="narrative-card__country-en">${c.en} · <span lang="${c.lang}">${escapeHtml(c.titleField || '')}</span></div>
          </div>
        </div>
        <h4 class="narrative-card__title">${n.title}</h4>
        <p class="narrative-card__text">${narrativeTextHtml(c.key, n)}</p>

        <details class="narrative-card__more">
          <summary>핵심 키워드 · 편집자 해설 보기</summary>
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
        </details>

        ${renderNarrativeBasis(event, c)}
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

  nlpAnalysis = null;
  nlpSelectedTerm = null;
  beforeEditing = false;
  beforeSkipConfirm = false;
  termCheckConfirmedFor = null;
  templateUsed = false;
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

  // 질문이 준비된 사건(임진왜란·재일조선인)은 기본 체험으로, 나머지 사건과 'Shared Memory 보기'는 기존 4단계로 엽니다.
  const quick = !!(opts && opts.quick) && !!(Choices && Choices.hasChoices(eventId)) && eventsMode !== 'memory';
  if (choiceState.eventId !== eventId) resetChoiceState(eventId);
  setExploreMode(quick ? 'quick' : 'deep');
  switchTab('compare');
  // 기본 체험은 세 나라 비교부터. 심화 탐구는 처음이면 STEP 1(내가 아는 역사)부터, 탐구 전 문장을 남겼다면 STEP 2부터.
  exploreStep = quick ? 1 : (flowStepDone('before') ? 2 : 1);
  renderBeforeCard();
  applyExploreStep();
  renderKeywordChart(event);
  renderGlance();
  renderCompareSummary(event);
  fourthRunChoice = {};
  fourthLangShown = null;
  renderFourthTab(event);
  renderSourcesTab();
  resetGuide(event);
  rebuildDraftContext();
  updateDraftPanel();
  resetCardState();
  loadSharedNarratives();
  navigateTo('detail');
  setRouteHash(eventId);
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

/* ------------------------------------------------------------
   서술의 성격과 함께 볼 자료 ("이 서술은 어떻게 작성했나요?")
   · sourceRefs에는 서지·제공처를 확인한 자료(verified/partial)만 들어 있습니다 (tests에서 검사).
   · 같은 국가의 "검토 전" 자료는 따로 구분해 보여줍니다.
   ------------------------------------------------------------ */

const VERIFICATION_LABEL = { verified: '출처 확인', partial: '일부 확인', unverified: '검토 전' };

function sourceVerification(s) {
  if (!s) return 'unverified';
  if (s.verification === 'verified' || s.verification === 'partial') return s.verification;
  return s.reviewed === true ? 'verified' : 'unverified';
}

function verificationBadge(s) {
  const v = sourceVerification(s);
  return `<span class="source-verify source-verify--${v}" title="${escapeAttr(s.verificationNote || '')}">${VERIFICATION_LABEL[v]}</span>`;
}

function renderNarrativeBasis(event, country) {
  const n = event[country.key] || {};
  const refs = (n.sourceRefs || []).map(id => SOURCES.find(s => s.id === id)).filter(Boolean);
  const pending = sourcesForEvent(event.id).filter(s =>
    s.country === country.key && sourceVerification(s) === 'unverified' && refs.indexOf(s) < 0);
  const link = s => `<button type="button" class="source-link" data-goto-source="${escapeAttr(s.id)}">${escapeHtml(s.title)} <small>${escapeHtml(s.year || '')}</small> ${verificationBadge(s)}</button>`;
  const refsHtml = refs.length
    ? `<div class="nlp-chips">${refs.map(link).join('')}</div>`
    : `<p class="narrative-card__basis-empty">아직 출처를 확인한 ${country.name} 측 관련 자료가 없습니다. 이 카드는 편집자가 구성한 비교용 관점 요약이므로 참고용으로 읽어 주세요.</p>`;
  const pendingHtml = pending.length
    ? `<p class="nlp-meta">검토 중인 자료: ${pending.map(s => `<button type="button" class="before-card__link" data-goto-source="${escapeAttr(s.id)}">${escapeHtml(s.title)}</button>`).join(' · ')}</p>`
    : '';
  return `
    <details class="narrative-card__basis">
      <summary>이 서술은 어떻게 작성했나요?</summary>
      <p>이 문장은 ${country.name}의 교과서 원문이나 공식 견해가 아니라, Shared Memory가 비교를 위해 작성한 요약입니다.
        ${country.name} 전체의 역사 인식을 대표하지 않습니다.</p>
      <div class="narrative-card__label">이 서술과 대조해 볼 자료</div>
      ${refsHtml}
      ${pendingHtml}
    </details>`;
}

function switchTab(tabName) {
  // 기본 체험 중 다른 탭(AI·NLP·사료·공동 표현·지도)을 열면 심화 탐구로 바꿉니다(기능은 모두 그대로).
  if (exploreMode === 'quick' && tabName !== 'compare') setExploreMode('deep');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.querySelector(`[data-tab-content="${tabName}"]`)?.classList.add('active');

  // 연구용 최소 milestone (클릭 로그는 남기지 않습니다)
  if (tabName === 'ai') markFlow({ viewedNlp: true });
  if (tabName === 'sources') markFlow({ viewedSources: true });
  if (tabName === 'memory' && flow && flow.submitted) markFlow({ viewedResult: true });
  if (tabName === 'compare') watchCompareView(); else stopCompareTimer();
  if (tabName === 'shared') renderSourceNudge();

  // 지도는 보이는 상태에서 너비를 재야 하므로 탭을 열 때 다시 그립니다.
  if (tabName === 'memory') renderMemoryTab();

  // 탭은 각 탐구 단계의 '자세히 보기'입니다. 탭을 열면 그 탭이 속한 단계로 표시합니다.
  activeTab = tabName;
  if (exploreMode === 'quick') return;          // 기본 체험의 단계는 gotoQuickStep이 정합니다
  if (TAB_STEP[tabName]) {
    exploreStep = TAB_STEP[tabName];
    applyExploreStep();
  }
}

/* ------------------------------------------------------------
   네 번째 서술자 · 기억의 빈자리 (narrator-analysis.js)
   · 세 나라 요약 서술 + AI 답변 기록(ai-narratives-data.js)을 '서술자'로 나란히 놓고 비교합니다.
   · AI는 실시간으로 부르지 않습니다. 기록이 없으면 '기록 전'과 질문 원문만 보여주고, 빈자리는 세 나라만으로 계산합니다.
   · 화면 문구는 판정이 아니라 관찰로 씁니다 ("…가 없다"). 덜 언급했다고 왜곡이라는 뜻이 아닙니다.
   ------------------------------------------------------------ */

let fourthRunChoice = {};             // 언어별로 지금 보고 있는 답변 회차 (lang → run)
let fourthLangShown = null;           // 좁은 화면에서 지금 보이는 언어 카드 (넓은 화면은 세 카드를 나란히)
const NARRATOR_SHORT = { korea: '한국 측', japan: '일본 측', china: '중국 측', 'ai-ko': 'AI · 한국어', 'ai-ja': 'AI · 일본어', 'ai-zh': 'AI · 중국어' };
const AI_HTML_LANG = { ko: 'ko', ja: 'ja', zh: 'zh-Hans' };

function renderFourthTab(event) {
  const box = document.getElementById('fourthNarrator');
  const gapBox = document.getElementById('memoryGaps');
  if (!box || !gapBox) return;
  if (!event || !Narrator || !FOURTH_DATA || !Analyzer) {
    box.innerHTML = '<div class="shared-empty">네 번째 서술자 모듈을 불러오지 못했습니다.</div>';
    gapBox.innerHTML = '';
    return;
  }
  let a;
  try {
    a = Narrator.analyzeEvent(event, AI_RECORDS, FOURTH_DATA);
  } catch (e) {
    console.error('네 번째 서술자 분석 오류:', e);
    box.innerHTML = '<div class="shared-empty">분석 중 문제가 생겼습니다.</div>';
    gapBox.innerHTML = '';
    return;
  }
  box.innerHTML = renderFourthNarrator(event, a);
  gapBox.innerHTML = renderMemoryGaps(a);
}

/**
 * AI 답변 원문의 Markdown(제목 #, 굵게 **, 목록 - · 1.)을 화면에서만 읽기 좋게 바꿉니다.
 * · 원문 데이터는 그대로 둡니다. NLP·빈자리 계산도 원문으로 합니다.
 * · 모든 글자를 먼저 escapeHtml로 바꾼 뒤, 정해 둔 태그(p·ul·ol·li·strong)만 직접 붙입니다 → 답변 속 HTML은 글자로만 보입니다.
 */
function renderAnswerHtml(text) {
  const inline = t => escapeHtml(t).replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '<strong>$1</strong>');
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
  const flushList = () => {
    if (list) out.push(`<${list.tag}${list.start > 1 ? ` start="${list.start}"` : ''}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').forEach(line => {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*(\d{1,3})[.)]\s+(.+)$/);
    if (!line.trim() || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); return; }
    if (heading) { flushPara(); flushList(); out.push(`<p class="md-h">${inline(heading[1].replace(/\*\*/g, ''))}</p>`); return; }
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, start: numbered ? Number(numbered[1]) : 1, items: [] }; }
      list.items.push(bullet ? bullet[1] : numbered[2]);
      return;
    }
    flushList();
    para.push(line.trim());
  });
  flushPara();
  flushList();
  return out.join('');
}

function fourthQuestionsHtml(eventId, open) {
  const q = FOURTH_DATA.questions[eventId] || {};
  const items = Narrator.AI_LANGS.filter(l => q[l]).map(l => `
    <li class="fourth-q"><span class="fourth-q__lang">${Narrator.AI_LANG_LABEL[l]}</span><span lang="${AI_HTML_LANG[l]}">${escapeHtml(q[l])}</span></li>`).join('');
  return `
    <details class="more-box fourth-questions"${open ? ' open' : ''}>
      <summary class="more-box__summary">AI에게 보낸 질문 원문 보기</summary>
      <p class="nlp-desc">질문에는 사건 이름을 넣지 않고 연도와 사실로만 사건을 가리켰습니다. AI가 어떤 이름으로 부르는지도 관찰하기 위해서입니다.
        세 언어의 뜻을 같게 맞추었고, 언어마다 새 대화에서 같은 질문을 여러 번 묻습니다.</p>
      <ol class="fourth-q-list">${items}</ol>
    </details>`;
}

function renderFourthNarrator(event, a) {
  const ai = a.narrators.filter(n => n.kind === 'ai');
  if (!ai.length) {
    return `
      <section class="fourth-section">
        <h4 class="section-h section-h--small">네 번째 서술자 — AI의 서술</h4>
        <div class="fourth-empty">
          <strong>아직 기록 전입니다.</strong>
          <p>같은 질문을 AI에게 한국어·일본어·중국어로 여러 번 물은 뒤, 답변을 모델 이름·날짜와 함께 이곳에 공개합니다.
            답변을 지어 넣지 않기 위해, 기록이 준비될 때까지는 질문만 보여줍니다. 아래 ‘기억의 빈자리’는 지금 세 나라 요약 서술만으로 계산됩니다.</p>
        </div>
        ${fourthQuestionsHtml(event.id, true)}
      </section>`;
  }
  const rowsFor = key => a.rows.filter(r => r.cells[key] && r.cells[key].present);
  const nameChip = (x, count) => {
    const shown = x.forms.length && x.forms.indexOf(x.label) < 0 ? `${x.label} (${x.forms[0]})` : x.label;
    return `<span class="narrative-card__keyword">${escapeHtml(shown)} <small>${x.runs}회 중 ${count}회</small></span>`;
  };
  const shownLang = ai.some(n => n.lang === fourthLangShown) ? fourthLangShown : ai[0].lang;
  const langSwitch = ai.length > 1 ? `
      <div class="fourth-langs" role="group" aria-label="볼 언어 선택">
        ${ai.map(n => `<button type="button" class="fourth-runs__btn${n.lang === shownLang ? ' is-active' : ''}" data-ai-show="${n.lang}" aria-pressed="${n.lang === shownLang}">${Narrator.AI_LANG_LABEL[n.lang]}로 물었을 때</button>`).join('')}
      </div>` : '';
  const cards = ai.map(n => {
    const recs = n.records;
    const chosen = recs.find(r => r.run === fourthRunChoice[n.lang]) || recs[0];
    const runButtons = recs.length > 1 ? `
      <div class="fourth-runs" role="group" aria-label="${escapeAttr(n.label)} 답변 회차">
        ${recs.map(r => `<button type="button" class="fourth-runs__btn${r === chosen ? ' is-active' : ''}" data-ai-lang="${n.lang}" data-ai-run="${r.run}" aria-pressed="${r === chosen}">${r.run}회</button>`).join('')}
      </div>` : '';
    const names = a.names.byNarrator[n.key] || [];
    const firstNames = names.filter(x => x.first > 0).sort((p, q) => q.first - p.first);
    const namesHtml = names.length ? `
        <div class="narrative-card__label">가장 먼저 쓴 이름 <small class="nlp-meta">(답변이 앞세운 이름)</small></div>
        <div class="narrative-card__keywords">${firstNames.map(x => nameChip(x, x.first)).join('')}</div>
        <div class="narrative-card__label">답변에 나온 이름 <small class="nlp-meta">(다른 나라의 이름을 소개한 경우 포함)</small></div>
        <div class="narrative-card__keywords">${names.map(x => nameChip(x, x.hits)).join('')}</div>` : '';
    const elements = rowsFor(n.key).slice(0, 8)
      .map(r => `<span class="nlp-chip nlp-chip--static">${escapeHtml(r.label)}<small>${r.cells[n.key].hits}/${r.cells[n.key].runs}</small></span>`).join('');
    const translation = chosen.translationKo ? `
      <details class="fourth-card__translation">
        <summary>한국어 참고 번역 (AI 번역)</summary>
        <div class="md">${renderAnswerHtml(chosen.translationKo)}</div>
      </details>` : '';
    const date = formatSharedDate(chosen.collectedAt);
    return `
      <article class="fourth-card${n.lang === shownLang ? ' is-shown' : ''}" data-ai-card="${n.lang}">
        <header class="fourth-card__head">
          <span class="fourth-card__mark" aria-hidden="true">AI</span>
          <div><div class="fourth-card__title">${escapeHtml(n.label)}</div>
            <div class="nlp-meta">같은 질문 ${recs.length}회 · 지금 보는 답변 ${chosen.run}회차</div></div>
        </header>
        ${runButtons}
        <div class="fourth-card__answer md" lang="${AI_HTML_LANG[n.lang]}">${renderAnswerHtml(chosen.answer)}</div>
        ${translation}
        ${namesHtml}
        <div class="narrative-card__label">자주 나온 요소 <small class="nlp-meta">(물은 횟수 중 나온 횟수)</small></div>
        <div class="nlp-chips">${elements || '<span class="nlp-meta">개념 사전과 일치하는 요소가 없습니다</span>'}</div>
        <p class="fourth-card__meta">모델 ${escapeHtml(chosen.model)}${chosen.servedByFallback ? ' (처음 요청한 모델이 답하지 않아 대체 모델이 답함)' : ''}${date ? ` · ${escapeHtml(date)} 수집` : ''} · 시스템 지시 없이 새 대화에서 질문</p>
      </article>`;
  }).join('');
  const notes = ((FOURTH_DATA.observations || {})[event.id] || []);
  const notesHtml = notes.length ? `
    <div class="fourth-observe">
      <div class="narrative-card__label">편집자 관찰 <small class="nlp-meta">(사람이 답변을 읽고 쓴 관찰 — 판정이 아닙니다)</small></div>
      <ul>${notes.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    </div>` : '';
  const first = ai[0].records[0];
  const models = [...new Set(ai.reduce((acc, n) => acc.concat(n.records.map(r => r.model)), []))].join(', ');
  const runs = Math.max(...ai.map(n => n.records.length));
  const gapCount = kind => a.gaps.filter(g => (g.narrator.indexOf('ai-') === 0) === (kind === 'ai')).length;
  return `
    <section class="fourth-section">
      <h4 class="section-h section-h--small">네 번째 서술자 — AI의 서술</h4>
      <div class="fourth-intro">
        <p><strong>이렇게 읽어 보세요</strong> ① 어떤 이름을 먼저 쓰는지 ② 누가 무엇을 했다고 쓰는지(주어·동사) ③ 무엇이 빠졌는지</p>
        <p class="nlp-meta">세 나라 서술은 이 프로젝트 편집자가 쓴 짧은 요약이고, 아래 카드는 AI가 쓴 답변 원문입니다
          (${escapeHtml(models)} · ${escapeHtml(formatSharedDate(first.collectedAt))} 수집 · 언어마다 새 대화에서 같은 질문 ${runs}회 · 시스템 지시 없음).
          언어마다 ${runs}회뿐인 작은 표본입니다.</p>
        <p class="fourth-intro__count">이 사건에서 계산된 빈자리 — AI 세 언어 답변 <strong>${gapCount('ai')}곳</strong> · 세 나라 요약 <strong>${gapCount('nation')}곳</strong>
          <span class="nlp-meta">(세 나라 요약은 두세 문장짜리 짧은 글이라 긴 AI 답변과 나란히 놓으면 빈자리가 많이 잡힙니다)</span></p>
      </div>
      ${langSwitch}
      <div class="fourth-grid">${cards}</div>
      ${notesHtml}
      ${fourthQuestionsHtml(event.id, false)}
    </section>`;
}

function gapCellHtml(row, n) {
  const c = row.cells[n.key];
  const multi = c.runs > 1;
  const state = c.present ? 'present' : (c.gap ? 'gap' : 'absent');
  const mark = c.present ? '●' : '○';
  const count = multi ? `<small>${c.hits}/${c.runs}</small>` : '';
  const said = c.forms.length ? ` · 찾은 표현: ${c.forms.join(', ')}` : '';
  const stateText = c.present ? '있음' : (c.gap ? '빈자리 — 다른 서술자 대부분에게는 있음' : '없음');
  const title = `${NARRATOR_SHORT[n.key] || n.label}: ${stateText}${multi ? ` (${c.runs}회 중 ${c.hits}회)` : ''}${said}`;
  return `<td class="gap-cell gap-cell--${state}" title="${escapeAttr(title)}"><span aria-hidden="true">${mark}</span>${count}<span class="sr-only">${escapeHtml(stateText)}${multi ? `, ${c.runs}회 중 ${c.hits}회` : ''}</span></td>`;
}

function renderMemoryGaps(a) {
  const heads = a.narrators.map(n => {
    const dot = n.kind === 'nation' ? `<i class="dot dot--${n.key}" aria-hidden="true"></i>` : '';
    return `<th scope="col"${n.kind === 'ai' ? ' class="gap-col--ai"' : ''}>${dot}${escapeHtml(NARRATOR_SHORT[n.key] || n.label)}</th>`;
  }).join('');
  const focusRows = a.rows.filter(r => r.kind === 'focus');
  const conceptRows = a.rows.filter(r => r.kind === 'concept');
  const rowHtml = r => `
    <tr class="${r.gapKeys.length ? 'has-gap' : ''}">
      <th scope="row">${escapeHtml(r.label)}</th>
      ${a.narrators.map(n => gapCellHtml(r, n)).join('')}
    </tr>`;
  const groupRow = text => `<tr class="gap-group"><th scope="rowgroup" colspan="${a.narrators.length + 1}">${text}</th></tr>`;
  const body = (focusRows.length ? groupRow('이 사건에서 꼭 확인할 요소 (편집자 선정)') + focusRows.map(rowHtml).join('') : '')
    + (conceptRows.length ? groupRow('개념 사전으로 찾은 요소') + conceptRows.map(rowHtml).join('') : '');

  const key = (a.keyGaps || []).map(g => {
    const row = a.rows.find(r => r.id === g.element);
    return `<li class="gap-summary__item gap-summary__item--key"><strong>${escapeHtml(NARRATOR_SHORT[g.narrator] || g.narrator)}</strong>에는 ‘${escapeHtml(row ? row.label : g.element)}’이(가) 없습니다.${g.note ? ` <span class="nlp-meta">${escapeHtml(g.note)}</span>` : ''}</li>`;
  }).join('');
  const keyIds = (a.keyGaps || []).map(g => g.element + '|' + g.narrator);
  const auto = a.gaps.filter(g => keyIds.indexOf(g.rowId + '|' + g.narrator) < 0).slice(0, 4).map(g =>
    `<li class="gap-summary__item"><strong>${escapeHtml(NARRATOR_SHORT[g.narrator] || g.narratorLabel)}</strong>에는 ‘${escapeHtml(g.element)}’이(가) 없습니다. <span class="nlp-meta">(다른 서술자 ${g.presentIn}곳에는 있음)</span></li>`).join('');
  const summary = (key || auto)
    ? `<ul class="gap-summary">${key}${auto}</ul>`
    : '<p class="nlp-desc">지금 비교한 서술자들 사이에서는 계산 기준에 맞는 빈자리가 보이지 않았습니다.</p>';

  return `
    <section class="fourth-section gaps">
      <h4 class="section-h section-h--small">기억의 빈자리</h4>
      <p class="nlp-desc gaps__lead">무엇을 말했는지보다 <strong>무엇을 말하지 않았는지</strong>를 봅니다.
        다른 서술자 대부분에게는 있는데 한 서술자에게만 없는 요소를 ‘빈자리’로 표시합니다.
        ${a.hasAi ? '' : '지금은 AI 기록이 없어 세 나라 요약 서술만 비교합니다.'}</p>
      ${summary}
      <div class="gap-table-wrap" tabindex="0" role="region" aria-label="요소별로 서술자에게 있는지 보여주는 표">
        <table class="gap-table">
          <thead><tr><th scope="col">요소</th>${heads}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="gap-legend"><span class="gap-legend__item"><b class="gap-legend__present">●</b> 있음</span>
        <span class="gap-legend__item"><b class="gap-legend__absent">○</b> 없음</span>
        <span class="gap-legend__item"><b class="gap-legend__gap">○</b> 빈자리 (다른 서술자 대부분에게는 있음)</span>
        <span class="gap-legend__item">한국 측·일본 측·중국 측 = 편집자가 쓴 요약 서술${a.hasAi ? ' · AI · ○○어 = 그 언어로 물은 AI 답변' : ''}</span>
        ${a.hasAi ? '<span class="gap-legend__item">AI 칸의 숫자 = 물은 횟수 중 나온 횟수 (절반 이상이면 있음)</span>' : ''}</p>
      <details class="ai-result__section nlp-method">
        <summary class="ai-result__heading"><span>?</span><span>빈자리는 어떻게 계산하나요? (한계)</span></summary>
        <ul class="ai-result__list">
          <li><strong>요소</strong>: 편집자가 사건마다 고른 확인 요소와, 공동 표현 분석에 쓰는 다국어 개념 사전(${Analyzer.CONCEPTS.length}개 개념)입니다. 한국어·일본어·중국어 표현을 함께 찾습니다.</li>
          <li><strong>빈자리 기준</strong>: 이 서술자에게는 없고, 다른 서술자 가운데 2곳 이상이면서 절반 이상에게 있는 요소입니다.</li>
          <li><strong>AI 답변</strong>: 같은 질문을 여러 번 물었으므로, 절반 이상의 답변에 나오면 ‘있음’으로 봅니다.</li>
          <li><strong>한계</strong>: 사전에 없는 표현·비유는 찾지 못하고, 부정문(“침략이 아니다”)도 언급으로 셉니다. 세 나라 서술은 편집자가 쓴 짧은 요약입니다.
            빈자리는 “덜 언급했다”는 관찰일 뿐, 왜곡이나 의도를 뜻하지 않습니다.</li>
        </ul>
      </details>
    </section>`;
}

/* ------------------------------------------------------------
   탐구 4단계 (STEP 1/4 ~ 4/4)
   1 내가 알고 있는 역사 → 2 세 나라 기록·NLP 비교 → 3 새로운 관점과 나의 최종 표현 → 4 My Memory Card
   · 단계 이동을 막거나 잠그지 않습니다. 진행 표시의 단계 버튼·탭으로 언제든 오갈 수 있습니다.
   · 단계마다 화면 아래 주요 행동 버튼(step-cta)은 하나만 보입니다.
   · 공동 표현을 등록할 때 연구에 필요한 최소 milestone만 함께 저장합니다 (기존과 같음).
   ------------------------------------------------------------ */

const EXPLORE_STEPS = [
  { n: 1, id: 'before', short: '내가 아는 역사', title: '내가 알고 있는 역사 기록',
    todo: '지금 알고 있는 내용만으로 이 역사를 한 문장으로 적어 보세요. 정답을 찾지 않아도 돼요.' },
  { n: 2, id: 'compare', short: '세 나라 비교', title: '국가별 역사 서술 · NLP 비교',
    todo: '세 나라의 기록을 읽고, 형광펜 표현과 공통점·차이점 카드를 살펴보세요.' },
  { n: 3, id: 'shared', short: '나의 표현', title: '새로운 관점과 나의 최종 표현',
    todo: '탐구하며 발견한 관점을 고르고, 이 역사를 기억하고 싶은 나의 한 문장을 써 보세요.' },
  { n: 4, id: 'card', short: 'Memory Card', title: 'My Memory Card',
    todo: '카드 내용을 확인하고 이미지로 저장하세요. 발견한 관점과 남은 질문은 아래에서 다듬을 수 있어요.' }
];
/* 기본 체험 (임진왜란·재일조선인 — choice-questions.js에 질문이 있는 사건)
   1 세 나라 기록 비교 → 2 관점 고르기(객관식, 질문 하나씩) → 3 한 줄 소감(건너뛰기 가능) → 4 My Memory Card
   · 탐구 전 문장·AI·NLP·사료·자유서술 공동 표현은 '심화 탐구'(위의 4단계)로 그대로 남아 있습니다. */
const QUICK_STEPS = [
  { n: 1, id: 'qcompare', short: '세 나라 비교', title: '세 나라 기록 비교',
    todo: '세 나라의 기록을 차례로 읽어 보세요. 다 읽었다면 아래 버튼을 눌러요.' },
  { n: 2, id: 'qchoices', short: '관점 고르기', title: '내가 중요하게 보는 관점 고르기',
    todo: '정답은 없어요. 질문마다 내가 가장 중요하다고 생각하는 것 하나를 누르면 다음 질문으로 넘어가요.' },
  { n: 3, id: 'qreflect', short: '한 줄 소감', title: '한 줄 소감',
    todo: '느낀 점을 한 문장으로 남겨요. 쓰지 않고 넘어가도 괜찮아요.' },
  { n: 4, id: 'card', short: 'Memory Card', title: 'My Memory Card',
    todo: '카드를 이미지로 저장하세요. 아래에서 다른 참여자들이 고른 관점도 볼 수 있어요.' }
];
let exploreMode = 'deep';             // 'quick' 기본 체험 | 'deep' 심화 탐구(기존 4단계)
function stepList() { return exploreMode === 'quick' ? QUICK_STEPS : EXPLORE_STEPS; }

function setExploreMode(mode) {
  exploreMode = mode === 'quick' ? 'quick' : 'deep';
  const page = document.querySelector('.page--detail');
  if (page) page.dataset.mode = exploreMode;
}

/* 기본 체험 상태 — 이 창의 메모리에만 둡니다(공용 기기 보호: 새로고침·새 참여자로 시작하면 사라짐) */
const choiceState = { eventId: null, answers: {}, index: 0, offsets: {}, reflection: '', reflectionSkipped: false, maxStep: 1, sent: false, advanceTimer: 0 };
const QUICK_ADVANCE_MS = 280;          // 선택지를 누른 뒤 고른 표시(✓)를 보여 주고 다음 질문으로 넘어가기까지
const QUICK_TAP_GUARD_MS = 350;        // 새 질문이 뜬 직후의 터치는 무시 (서둘러 두 번 누른 손가락이 다음 질문을 고르지 않게)

function resetChoiceState(eventId) {
  choiceState.eventId = eventId || null;
  choiceState.answers = {};
  choiceState.index = 0;
  choiceState.offsets = {};
  choiceState.reflection = '';
  choiceState.reflectionSkipped = false;
  choiceState.maxStep = 1;
  choiceState.sent = false;
  clearTimeout(choiceState.advanceTimer);
  const input = document.getElementById('reflectInput');
  if (input) input.value = '';
  const consent = document.getElementById('choiceShareConsent');
  if (consent) consent.checked = false;
  const count = document.getElementById('reflectCount');
  if (count) count.textContent = '0';
}

/* 탭 → 탐구 단계 (탭은 각 단계의 '자세히 보기' 역할) */
const TAB_STEP = { compare: 2, fourth: 2, ai: 2, keywords: 2, sources: 2, shared: 3, memory: 3 };
const COMPARE_DWELL_MS = 5000;        // 국가별 서술이 화면에 이만큼 보이면 "서술 확인"으로 기록

let flow = null;
let exploreStep = 1;                  // 사건 화면에서 지금 보고 있는 단계 (1~3)
let activeTab = 'compare';

function defaultFlow() {
  return { viewedCompare: false, viewedNlp: false, viewedSources: false, submitted: false, viewedResult: false, cardMade: false };
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
  if (id === 'before') return !!getBefore() || isBeforeSkipped() || isBeforeSubmitted() || !!getPriorLearning();
  if (id === 'compare') return flow.viewedCompare;
  if (id === 'shared') return flow.submitted || flow.cardMade || !!(document.getElementById('userNarrative')?.value || '').trim();
  if (id === 'card') return flow.cardMade;
  if (id === 'result') return flow.submitted && flow.viewedResult;
  if (id === 'qcompare') return flow.viewedCompare || choiceState.maxStep > 1;
  if (id === 'qchoices') return !!(Choices && Choices.questionsFor(currentEventId).every(q => choiceState.answers[q.id]));
  if (id === 'qreflect') return !!choiceState.reflection || choiceState.reflectionSkipped || flow.cardMade;
  return false;
}

function stepperHtml(current) {
  const steps = stepList();
  const info = steps[current - 1];
  const allDone = steps.every(st => flowStepDone(st.id));
  const items = steps.map(st => {
    const done = flowStepDone(st.id);
    const isCurrent = st.n === current;
    const state = [isCurrent ? '지금 단계' : '', done ? '완료' : ''].filter(Boolean).join(', ');
    return `
      <li class="flow-progress__step${done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}">
        <button type="button" data-step-goto="${st.n}"${isCurrent ? ' aria-current="step"' : ''}>
          <span class="flow-progress__num" aria-hidden="true">${done && !isCurrent ? '✓' : st.n}</span>
          <span class="flow-progress__label">${st.short}</span>
          <span class="sr-only"> (STEP ${st.n}/4${state ? ' — ' + state : ''})</span>
        </button>
      </li>`;
  }).join('');
  const memoryNote = exploreMode === 'deep' && current === 3 && activeTab === 'memory'
    ? '다른 참여자들이 남긴 기억을 둘러보고 있어요. 다 봤다면 아래 버튼으로 나의 카드를 만드세요.'
    : info.todo;
  // 심화 탐구 중인 기본 체험 사건에는 '기본 체험으로 돌아가기'를 함께 보여줍니다.
  const back = exploreMode === 'deep' && Choices && Choices.hasChoices(currentEventId)
    ? '<p class="stepper__mode">심화 탐구 중이에요. <button type="button" class="before-card__link" data-quick-return>← 기본 체험(관점 고르기)으로 돌아가기</button></p>'
    : '';
  return `
    <div class="stepper">
      <p class="stepper__count"><span class="stepper__num">STEP <strong>${current}</strong>/4</span> <span class="stepper__title">${info.title}</span></p>
      <div class="stepper__bar" aria-hidden="true"><i style="width:${current * 25}%"></i></div>
      <ol class="flow-progress__list">${items}</ol>
      <p class="stepper__todo"><span class="stepper__todo-label">지금 할 일</span> ${allDone && current === 4 ? '탐구를 모두 마쳤습니다. 카드를 저장하고, 다른 사건도 살펴보세요.' : memoryNote}</p>
      ${back}
    </div>`;
}

function renderFlowProgress() {
  const box = document.getElementById('flowProgress');
  if (box && flow) {
    box.innerHTML = `${stepperHtml(exploreStep)}
      <p class="flow-progress__newcomer" data-newcomer-note${Store && Store.hasParticipantState() ? '' : ' hidden'}>다른 학생이 이 기기로 이어서 참여하나요? <button type="button" class="before-card__link" data-new-participant>새 참여자로 시작</button></p>`;
  }
  const cardBox = document.getElementById('cardProgress');
  if (cardBox && flow) cardBox.innerHTML = stepperHtml(4);
  renderStepCta();
}

/** 화면 아래 주요 행동 버튼: 지금 단계에 맞는 버튼 하나만 보여줍니다. */
function renderStepCta() {
  const bar = document.getElementById('stepCta');
  if (!bar) return;
  if (exploreMode === 'quick') { renderQuickCta(bar); return; }
  const inputMode = exploreStep === 1 && !!document.getElementById('beforeInput');
  const key = exploreStep === 1 ? (inputMode ? '1' : '1-next') : String(exploreStep);
  bar.querySelectorAll('[data-step-main]').forEach(b => { b.hidden = b.dataset.stepMain !== key; });
  const label = bar.querySelector('[data-step-main="1"] .step-cta__label');
  if (label) label.textContent = beforeSkipConfirm ? '적지 않고 세 나라 기록 보기' : '내 생각 저장하고 세 나라 기록 보기';
  const back = bar.querySelector('[data-step-back]');
  if (back) back.hidden = exploreStep === 1;
  const stepLabel = document.getElementById('stepCtaStep');
  if (stepLabel) stepLabel.textContent = `STEP ${exploreStep}/4 · ${EXPLORE_STEPS[exploreStep - 1].short}`;
  // 미완료 입력 안내: 막지 않고, 왜 한 번 더 확인하는지 버튼 바로 위에서 알려줍니다.
  const hint = document.getElementById('stepCtaHint');
  if (hint) {
    const msg = exploreStep === 1 && inputMode && beforeSkipConfirm
      ? '아직 한 문장을 적지 않았어요. 한 단어만 적어도 괜찮아요. 그대로 넘어가려면 버튼을 한 번 더 누르세요.'
      : '';
    hint.textContent = msg;
    hint.hidden = !msg;
  }
  const cardStatus = document.getElementById('cardStatus');
  if (cardStatus) cardStatus.hidden = exploreStep !== 3 || !cardStatus.textContent;
}

/** 사건 화면의 단계 표시를 지금 상태(exploreStep)에 맞춥니다. */
function applyExploreStep() {
  const page = document.querySelector('.page--detail');
  if (page) { page.dataset.step = String(exploreStep); page.dataset.mode = exploreMode; }
  if (exploreMode === 'quick') {
    choiceState.maxStep = Math.max(choiceState.maxStep, exploreStep);
    if (exploreStep === 2) renderChoiceStep();
    if (exploreStep === 3) renderReflectStep();
  } else if (exploreStep === 3) { renderStepDiscoveries(); renderAfterRecall(); }
  renderFlowProgress();
}

/** 단계 이동 (진행 표시 버튼 · 이전 버튼 · 주요 행동 버튼). 이동을 막지 않습니다. */
function gotoStep(n) {
  n = Number(n);
  if (exploreMode === 'quick') { gotoQuickStep(n); return; }
  if (n === 4) { makeMemoryCard(); return; }
  if (!(n >= 1 && n <= 3)) return;
  if (!document.querySelector('.page--detail.active')) { navigateTo('detail'); setRouteHash(currentEventId); }
  if (n === 1) {
    if (!getBefore() && isBeforeSkipped()) beforeEditing = true;
    exploreStep = 1;
    renderBeforeCard();
    applyExploreStep();
  } else if (n === 2) {
    switchTab(TAB_STEP[activeTab] === 2 ? activeTab : 'compare');
  } else {
    switchTab(TAB_STEP[activeTab] === 3 ? activeTab : 'shared');
  }
  setCardStatus('');
  scrollToStepTop();
  if (n === 1) setTimeout(() => document.getElementById('beforeInput')?.focus({ preventScroll: true }), 350);
}

function scrollToStepTop() {
  const target = document.getElementById('flowProgress');
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - 90;   // 상단 메뉴 높이만큼 여유
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
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
let beforeSkipConfirm = false;        // "건너뛰기"를 한 번 눌렀을 때 짧게 한 번 더 확인합니다 (강제하지 않음)

function beforeKey(kind) { return `sm_before_${kind || ''}${currentEventId}`; }
function getBefore() { return (Store && Store.storageGet(beforeKey())) || ''; }
function setBefore(value) { if (Store) Store.storageSet(beforeKey(), value); }
function isBeforeSkipped() { return !!(Store && Store.storageGet(beforeKey('skip_'))); }
/* 제출이 끝나면 탐구 전 문장은 이 기기에서 지우고 "제출됨" 표시만 남깁니다 (다음 사람에게 보이지 않도록). */
function isBeforeSubmitted() { return !!(Store && Store.storageGet(beforeKey('done_'))); }
function clearBeforeAfterSubmit(eventId) {
  if (!Store || !eventId) return;
  const key = kind => `sm_before_${kind || ''}${eventId}`;
  Store.storageRemove(key());
  Store.storageRemove(key('skip_'));
  Store.storageSet(key('done_'), '1');
}

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
    renderStepCta();
    return;
  }
  if (!saved && isBeforeSubmitted() && !beforeEditing) {
    box.className = 'before-card is-collapsed';
    box.innerHTML = `
      <span class="before-card__hint">탐구 전 문장은 제출과 함께 저장되었고, 이 기기에서는 지웠습니다.</span>
      <button type="button" class="before-card__link" data-new-participant>다른 학생이 이어서 참여한다면: 새 참여자로 시작</button>
      ${renderPriorQuestion()}`;
    renderStepCta();
    return;
  }
  if (isBeforeSkipped() && !beforeEditing) {
    box.className = 'before-card is-collapsed';
    box.innerHTML = `
      <span class="before-card__hint">서술을 읽기 전의 생각을 한 문장으로 남겨 두면, 나중에 내 한 문장과 비교해 생각의 변화를 볼 수 있어요.</span>
      <button type="button" class="before-card__link" data-before-action="edit">지금 적기</button>
      ${renderPriorQuestion()}`;
    renderStepCta();
    return;
  }
  box.className = 'before-card';
  const skipHtml = beforeSkipConfirm
    ? `<p class="before-card__confirm" role="status">이 한 문장은 활동 전과 후의 생각 변화를 보는 데 꼭 필요한 자료예요. 한 단어만 적어도 괜찮아요.
         <button type="button" class="before-card__link" data-before-action="focus">지금 적기</button>
         <button type="button" class="before-card__link before-card__link--quiet" data-before-action="skip">그래도 건너뛰기</button></p>`
    : '';
  // 저장 버튼은 화면 아래 고정 버튼(STEP 1의 주요 행동)입니다. 입력창에서 Enter를 눌러도 저장됩니다.
  box.innerHTML = `
    <div class="before-card__head">
      <span class="before-card__label">STEP 1 · 내가 알고 있는 역사 <small>(1분)</small></span>
      <label class="before-card__q" for="beforeInput">이 사건에 대해 <span class="hl-ink">지금 알고 있는 것</span>을 한 문장으로 적어 보세요.</label>
      <p class="before-card__desc" id="beforeDesc">검색하거나 정답을 찾지 않아도 됩니다. 잘 모르면 떠오르는 단어만 적어도 괜찮아요.</p>
    </div>
    <div class="before-card__row">
      <input type="text" id="beforeInput" class="shared-form__input shared-form__input--lg" maxlength="500" value="${escapeAttr(saved)}" placeholder="예: 잘 모르지만, 일본과 조선이 싸운 전쟁" aria-describedby="beforeDesc" enterkeyhint="done" autocomplete="off" />
    </div>
    ${skipHtml}
    ${beforeSkipConfirm ? '' : '<p class="before-card__skip">적기 어렵다면 <button type="button" class="before-card__link before-card__link--quiet" data-before-action="skip">건너뛰기</button></p>'}
    <p class="before-card__note">이 브라우저에만 임시로 저장되며, 나중에 쓰는 탐구 후 문장과 비교해 My Memory Card에 담깁니다. 공개 등록을 할 때만 함께 저장됩니다.</p>
    ${renderPriorQuestion()}`;
  renderStepCta();
}

function handleBeforeAction(action) {
  if (action === 'edit') {
    beforeEditing = true;
    renderBeforeCard();
    document.getElementById('beforeInput')?.focus();
    return;
  }
  if (action === 'focus') {
    beforeSkipConfirm = false;
    renderBeforeCard();
    document.getElementById('beforeInput')?.focus();
    return;
  }
  if (action === 'save') {
    const value = (document.getElementById('beforeInput')?.value || '').trim();
    if (!value && !beforeSkipConfirm) {
      // 빈 칸으로 저장하면 건너뛰기와 같으므로, 한 번만 부드럽게 다시 권합니다.
      beforeSkipConfirm = true;
      renderBeforeCard();
      return;
    }
    setBefore(value);
    beforeEditing = false;
    beforeSkipConfirm = false;
    if (!value && Store) Store.storageSet(beforeKey('skip_'), '1');
  }
  if (action === 'skip') {
    if (!beforeSkipConfirm) {
      beforeSkipConfirm = true;
      renderBeforeCard();
      return;
    }
    if (Store) Store.storageSet(beforeKey('skip_'), '1');
    beforeEditing = false;
    beforeSkipConfirm = false;
  }
  renderBeforeCard();
  renderFlowProgress();
  updateDraftPanel();
  // 저장(또는 확인 후 건너뛰기)이 끝나면 다음 단계로 자연스럽게 넘어갑니다.
  if ((action === 'save' || action === 'skip') && !beforeSkipConfirm) gotoStep(2);
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

/* ------------------------------------------------------------
   한눈에 비교 — 쉬운 결과를 먼저, 계산 방법은 "자세히 분석하기"에서
   · 모든 단어는 eventNlp(세 서술 텍스트의 실제 계산 결과)에서 가져옵니다. 예시 단어를 미리 적어 두지 않습니다.
   · 숫자·일반 명사는 "한눈에" 요약에서만 뺍니다 (자세한 분석에는 그대로 남아 있음).
   ------------------------------------------------------------ */

const GLANCE_GENERIC = ['과정', '시기', '수행', '문제', '사회', '경우', '이후', '당시', '생활', '구조', '처리', '사건', '기반', '형성', '원인', '결과', '측면', '관점', '시각', '경향'];

function glanceTermOk(term) {
  return !!term && term.indexOf(' ') < 0 && !/[0-9]/.test(term) && GLANCE_GENERIC.indexOf(term) < 0;
}

function computeGlance(a) {
  if (!a) return null;
  const common = (a.common || []).filter(e => !e.isPhrase && glanceTermOk(e.term)).slice(0, 4).map(e => e.term);
  const distinct = {};
  NLP_COUNTRIES.forEach(c => {
    distinct[c.key] = (a.distinctive[c.key] || []).filter(d => glanceTermOk(d.term)).slice(0, 3).map(d => d.term);
  });
  return { common, distinct };
}

/** 사료 우선순위: 출처 확인 → 일부 확인 → 검토 전 */
function sourceRank(s) {
  return { verified: 0, partial: 1, unverified: 2 }[sourceVerification(s)];
}

function glanceSources(g) {
  if (!g) return [];
  const terms = g.common.concat(...NLP_COUNTRIES.map(c => g.distinct[c.key]));
  const found = [];
  terms.forEach(t => sourcesForTerm(currentEventId, t).forEach(s => { if (found.indexOf(s) < 0) found.push(s); }));
  const list = found.length ? found : sourcesForEvent(currentEventId);
  return list.slice().sort((x, y) => sourceRank(x) - sourceRank(y));
}

function renderGlance() {
  const box = document.getElementById('aiGlance');
  if (!box) return;
  const g = computeGlance(eventNlp);
  if (!g) {
    box.innerHTML = '<div class="shared-empty">분석 모듈을 불러오지 못했습니다.</div>';
    return;
  }
  const chips = (list, country) => list.length
    ? list.map(t => `<button type="button" class="nlp-chip${country ? ` nlp-chip--${country}` : ''}" data-glance-term="${escapeAttr(t)}" title="세 서술에서 쓰인 위치 보기">${escapeHtml(t)}</button>`).join('')
    : '<span class="nlp-meta">뚜렷한 표현 없음</span>';
  const sources = glanceSources(g);
  const best = sources[0];
  box.innerHTML = `
    <div class="glance__head">
      <span class="glance__eyebrow">한눈에 비교</span>
      <p class="glance__scope">이 비교는 프로젝트에서 선정·요약한 세 서술을 대상으로 하며, 각 국가의 모든 교과서나 역사 인식을 대표하지 않습니다.</p>
    </div>
    <div class="glance__q">
      <div class="glance__label"><span class="glance__num">①</span> 세 서술이 공통으로 쓰는 말</div>
      <div class="nlp-chips">${chips(g.common, null)}</div>
    </div>
    <div class="glance__q">
      <div class="glance__label"><span class="glance__num">②</span> 서술마다 두드러지게 쓰는 말</div>
      <div class="glance__cols">
        ${NLP_COUNTRIES.map(c => `
          <div class="glance__col glance__col--${c.key}">
            <div class="glance__col-head">${c.flag} ${c.name} 측 서술</div>
            <div class="nlp-chips">${chips(g.distinct[c.key], c.key)}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="glance__q">
      <div class="glance__label"><span class="glance__num">③</span> 그 판단은 어디서 확인할 수 있나요?</div>
      <p class="nlp-desc">위의 단어를 누르면 세 서술에서 그 단어가 실제로 쓰인 위치와, 연결된 사료가 함께 나타납니다.</p>
      ${best ? `
        <div class="glance__cta">
          <p>왜 이렇게 다르게 표현될까요? 실제 자료에서 직접 확인해 보세요.</p>
          <button type="button" class="btn btn--small" data-goto-source="${escapeAttr(best.id)}">관련 사료 1개 확인하기 → <small>${escapeHtml(best.title)}</small></button>
        </div>` : ''}
    </div>
    <p class="nlp-meta glance__note">※ 위 단어는 실제 세 서술 텍스트에서 계산한 결과입니다. ①은 세 서술에 모두 나온 단어, ②는 한 서술에서 다른 두 서술보다 상대적으로 많이 쓰인 단어(특징적 표현)입니다. 숫자와 ‘과정·시기’ 같은 일반 명사는 이 요약에서만 뺐습니다.</p>`;
}

/* ------------------------------------------------------------
   STEP 2 형광펜 · 공통점/차이점 카드
   · 형광펜은 computeGlance(eventNlp) — 세 서술 텍스트에서 실제로 계산된 공통 표현·특징적 표현 — 에만 칠합니다.
     위치도 NLP 모듈이 찾은 원문 위치(occurrences)만 씁니다. 미리 정해 둔 단어나 편집자 해석을 강조하지 않습니다.
   ------------------------------------------------------------ */

function narrativeTextHtml(countryKey, n) {
  const g = computeGlance(eventNlp);
  if (!g || !eventNlp || !eventNlp.occurrences || !eventNlp.texts) return n.text;   // 분석 모듈이 없으면 원래대로
  const full = eventNlp.texts[countryKey] || '';
  const offset = n.title && full.indexOf(n.text) > 0 ? full.indexOf(n.text) : 0;
  if (full.slice(offset, offset + n.text.length) !== n.text) return n.text;           // 위치를 맞출 수 없으면 강조하지 않음
  // 선택적 강조: 서술별 특징적 표현 상위 2개 · 공통 표현 상위 2개, 각각 본문의 첫 등장 위치에만 칠합니다.
  const spans = [];
  const add = (term, kind) => {
    const first = (eventNlp.occurrences(term)[countryKey] || []).find(([a, b]) => a >= offset && b <= offset + n.text.length);
    if (first) spans.push([first[0] - offset, first[1] - offset, kind, term]);
  };
  g.distinct[countryKey].slice(0, 2).forEach(t => add(t, 'distinct'));
  g.common.slice(0, 2).forEach(t => add(t, 'common'));
  spans.sort((x, y) => x[0] - y[0]);
  let html = '';
  let pos = 0;
  spans.forEach(([a, b, kind, term]) => {
    if (a < pos) return;
    const what = kind === 'common' ? '세 서술 공통 표현' : `${nlpCountryName(countryKey)} 측 서술의 두드러진 표현`;
    html += escapeHtml(n.text.slice(pos, a)) +
      `<mark class="hl hl--${kind}" title="${escapeAttr(`${what}: ${term} (NLP 계산)`)}">${escapeHtml(n.text.slice(a, b))}<span class="sr-only"> (${what})</span></mark>`;
    pos = b;
  });
  return html + escapeHtml(n.text.slice(pos));
}

function renderCompareSummary(event) {
  const box = document.getElementById('compareSummary');
  const legend = document.getElementById('hlLegend');
  if (!box) return;
  const g = computeGlance(eventNlp);
  const marked = !!document.querySelector('#narrativesGrid mark.hl');
  if (legend) {
    legend.hidden = !marked;
    legend.innerHTML = marked ? `
      <span class="hl-legend__item"><mark class="hl hl--common">공통 표현</mark> 세 서술에 모두 나온 단어</span>
      <span class="hl-legend__item"><mark class="hl hl--distinct">두드러진 표현</mark> 이 서술에서 상대적으로 많이 쓰인 단어</span>
      <span class="hl-legend__note">형광펜은 세 서술 텍스트에서 자동 계산(NLP)된 단어에만 표시되며, 중요도나 옳고 그름을 뜻하지 않습니다.</span>` : '';
  }
  const names = [
    { key: 'korea', flag: '韓', name: '한국', title: event.title, lang: 'ko' },
    { key: 'japan', flag: '日', name: '일본', title: event.titleJP, lang: 'ja' },
    { key: 'china', flag: '中', name: '중국', title: event.titleCN, lang: 'zh-Hans' }
  ].filter(x => x.title);
  const chips = (list, country) => list.length
    ? list.map(t => `<button type="button" class="nlp-chip${country ? ` nlp-chip--${country}` : ''}" data-glance-term="${escapeAttr(t)}" title="세 서술에서 쓰인 위치 보기">${escapeHtml(t)}</button>`).join('')
    : '<span class="nlp-meta">뚜렷한 표현 없음</span>';
  const namesCard = new Set(names.map(x => x.title)).size >= 2 ? `
    <article class="sum-card sum-card--names">
      <h4 class="sum-card__title"><span class="sum-card__kicker">사건 이름</span>같은 사건, 서로 다른 이름</h4>
      <ul class="sum-card__names">${names.map(x => `<li><span class="sum-card__flag sum-card__flag--${x.key}" aria-hidden="true">${x.flag}</span><span class="sr-only">${x.name}: </span><strong lang="${x.lang}">${escapeHtml(x.title)}</strong></li>`).join('')}</ul>
    </article>` : '';
  if (!g) {
    box.innerHTML = namesCard ? `<div class="compare-sum__grid">${namesCard}</div>` : '';
    return;
  }
  box.innerHTML = `
    <div class="compare-sum__head">
      <h3 class="compare-sum__title">한눈에 보는 공통점과 차이점</h3>
      <p class="compare-sum__note">아래 단어는 세 서술 텍스트에서 NLP로 계산한 결과입니다 (편집자 해석 아님). 단어를 누르면 원문 위치와 근거를 보여줘요.</p>
    </div>
    <div class="compare-sum__grid">
      ${namesCard}
      <article class="sum-card sum-card--common">
        <h4 class="sum-card__title"><span class="sum-card__kicker">공통점</span>세 서술이 함께 쓰는 말</h4>
        <div class="nlp-chips">${chips(g.common, null)}</div>
      </article>
      ${NLP_COUNTRIES.map(c => `
        <article class="sum-card sum-card--${c.key}">
          <h4 class="sum-card__title"><span class="sum-card__kicker">차이점 · ${c.flag} ${c.name} 측</span>이 서술이 두드러지게 쓰는 말</h4>
          <div class="nlp-chips">${chips(g.distinct[c.key], c.key)}</div>
        </article>`).join('')}
    </div>`;
}

/* 내 한 문장 쓰기 탭: 사료를 아직 보지 않았다면 짧게 권합니다 (필수 아님) */
function renderSourceNudge() {
  const box = document.getElementById('sharedSourceNudge');
  if (!box) return;
  const best = glanceSources(computeGlance(eventNlp))[0];
  if (!best || (flow && flow.viewedSources)) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `
    <span>한 문장을 쓰기 전에 근거 자료 하나를 확인해 볼까요?</span>
    <button type="button" class="before-card__link" data-goto-source="${escapeAttr(best.id)}">${escapeHtml(best.title)} 보기 →</button>
    <span class="nlp-meta">(건너뛰어도 됩니다)</span>`;
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
      <div class="ai-result__heading"><span>⌬</span><span>자세히 분석하기 — 분석 개요</span></div>
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
      <p class="nlp-meta">프로젝트가 선정·요약한 세 서술에 대한 해설이며, 각 국가 전체의 역사 인식을 대표하지 않습니다.</p>
      <p class="nlp-desc nlp-desc--sub">공통점</p>
      <ul class="ai-result__list">${list(data.common)}</ul>
      <p class="nlp-desc nlp-desc--sub">핵심 차이점</p>
      <ul class="ai-result__list">${list(data.diff)}</ul>
      <p class="nlp-desc nlp-desc--sub">표현 특징</p>
      <ul class="ai-result__list">${list(data.feature)}</ul>
    </details>`;
}

// 편집자 해설: 사람이 작성한 사건별 해석입니다. (자동 분석 결과와 구분해 표시)
// "한국은 ~한다"처럼 국가 전체를 일반화하지 않고, "이 프로젝트가 비교한 ○○ 측 서술"을 주어로 씁니다.
const editorNotes = {
  'imjin': {
    common: [
      '세 서술 모두 1592–1598년의 사건이며, 일본의 군사 행동으로 전쟁이 시작되었다는 사실 자체는 부정하지 않는다.',
      '명나라의 참전이 전쟁의 흐름에 중요한 변수였다는 점도 세 서술에 공통으로 나타난다.'
    ],
    diff: [
      '한국 측 서술: "침략"이라는 평가가 담긴 용어를 사용한다.',
      '일본 측 서술: "침략" 대신 "출병"·"진출"이라는 표현을 사용해 행위의 성격 규정을 드러내지 않는다. (일본에서도 "朝鮮侵略"이라는 명칭이 함께 쓰이므로, 이는 이 프로젝트가 고른 서술 유형의 특징이다)',
      '중국 측 서술: "왜에 맞서 조선을 도왔다"는 구원자의 위치를 강조한다.'
    ],
    feature: [
      '한국 측 서술은 저항과 피해의 서사를 중심에 둔다.',
      '일본 측 서술은 군사 행동과 문화적 영향을 함께 다룬다. 이 서술의 "도자기 기술"은 전쟁 중 일본으로 끌려간 조선 도공(피로인)과 이어진다는 점을 함께 생각해 볼 수 있다.',
      '중국 측 서술은 동아시아 질서와 명나라의 역할을 중심에 둔다.'
    ]
  },
  'zainichi': {
    common: [
      '세 서술 모두 재일조선인이 일본의 식민지 지배 시기와 전후 일본 사회의 변화 속에서 형성되었다는 점을 다룬다.',
      '세 서술 모두 재일조선인의 법적 지위나 사회적 처우를 다루지만, "국적"·"차별"이라는 단어를 직접 쓰는지는 서술마다 다르다. (일본 측 요약 서술에는 "차별"이라는 단어가 없다)'
    ],
    diff: [
      '한국 측 서술: 식민지 지배와 강제 동원의 결과로 보고 피해와 권리의 관점에서 설명한다.',
      '일본 측 서술: 전후 일본 사회의 외국인 주민·특별영주자 제도와 통합의 관점에서 설명한다.',
      '중국 측 서술: 일본 제국주의가 남긴 동아시아 역사 문제의 하나로 설명한다.'
    ],
    feature: [
      '한국 측 서술은 식민지 지배와 차별이라는 역사적 책임의 언어를 사용한다.',
      '일본 측 서술은 특별영주자·지역사회처럼 행정·제도의 언어를 사용한다.',
      '중국 측 서술은 재일조선인 문제를 동아시아 역사 인식 갈등의 사례로 연결한다. (출처를 확인한 중국 측 자료가 아직 없어, 이 서술은 참고용 관점 요약입니다)'
    ]
  },
  'culture': {
    common: [
      '세 서술 모두 한자·불교·유교 등이 동아시아 여러 사회를 오갔다는 점을 다룬다.',
      '각 사회가 들어온 문화를 받아들여 바꾸어 갔다는 점이 공통으로 나타난다.'
    ],
    diff: [
      '한국 측 서술: 문화 전파의 교량 역할을 강조한다.',
      '일본 측 서술: 주체적 수용과 변용을 강조한다.',
      '중국 측 서술: 문명의 중심이자 발신자 역할을 강조한다.'
    ],
    feature: [
      '같은 문화 교류를 두고 세 서술은 자기 사회를 서로 다른 위치에 놓는다.',
      '한국 측은 중계자, 일본 측은 수용자이자 변용자, 중국 측은 발신자로 서술한다.'
    ]
  },
  'tribute': {
    common: [
      '세 서술 모두 동아시아에 중국 왕조 중심의 국제 질서가 존재했다는 사실 자체는 부정하지 않는다.',
      '조공 관계가 19세기 말 크게 무너졌다는 점도 함께 나타난다.'
    ],
    diff: [
      '한국 측 서술: 조공을 실리 외교로 재해석한다.',
      '일본 측 서술: 조공 체제에서 벗어난 독자적 위치를 강조한다.',
      '중국 측 서술: 조공을 조화로운 천하 질서로 설명한다.'
    ],
    feature: [
      '같은 제도를 두고 실리, 이탈, 조화라는 서로 다른 평가 어휘가 나타난다.',
      '평가 어휘의 차이가 국제 질서를 보는 관점의 차이를 드러낸다.'
    ]
  },
  'modern': {
    common: [
      '세 서술 모두 19세기 서구 열강의 충격을 근대화의 출발점으로 본다.',
      '세 서술 모두 자강을 위한 개혁 시도를 언급한다.'
    ],
    diff: [
      '한국 측 서술: 자주적 근대화의 좌절을 강조한다.',
      '일본 측 서술: 메이지 유신의 성공을 강조한다.',
      '중국 측 서술: “백 년의 치욕”이라는 감정 어휘로 서술한다.'
    ],
    feature: [
      '비교한 세 서술에서 같은 시대는 좌절·성공·치욕이라는 서로 다른 언어로 그려진다.',
      '일본 측 서술에는 이웃 국가 침략에 대한 언급이 거의 없다는 점을 다른 두 서술과 비교해 볼 수 있다.'
    ]
  },
  'hiroshima': {
    common: [
      '세 서술 모두 히로시마 원폭이 대규모 민간인 피해를 낳은 사건이라는 점을 다룬다.',
      '조선인 피해자의 존재는 전쟁 피해와 식민지 동원을 함께 보게 만드는 지점이다.'
    ],
    diff: [
      '한국 측 서술: 조선인 피해자를 강제 동원과 식민지 지배의 맥락에서 설명한다.',
      '일본 측 서술: 핵무기의 참혹성과 평화의 중요성을 중심으로 설명한다.',
      '중국 측 서술: 일본 군국주의와 전쟁 책임의 결과로 설명한다.'
    ],
    feature: [
      '한국 측 서술은 해방과 피해가 동시에 존재한 복합적 기억을 다룬다.',
      '일본 측 서술에는 식민지 출신 피해자에 대한 언급이 없다.',
      '중국 측 서술은 원폭 피해를 일본의 전쟁 책임과 분리하지 않고 설명한다.'
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
  const langRows = EXPRESSION_LANGS_WITH_UNKNOWN.filter(l => a.byLanguage[l] > 0).map(lang => {
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
      <p class="nlp-desc">다국어 개념 사전으로 한국어·중국어·일본어·영어 표현을 같은 개념으로 묶어 셉니다. (예: ${langExample([['ko', '침략'], ['zh', '侵略'], ['ja', '侵略'], ['en', 'invasion']])})</p>
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
      message: '아직 등록된 공동 표현 제안이 없습니다. "공동 표현 작성" 탭에서 한국어·중국어·일본어·영어 어떤 언어로든 표현을 등록해 주세요.'
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

  const rows = (event.keywordGroups && Analyzer)
    ? Analyzer.keywordGroupCounts(event).map(g => ({
      label: g.label,
      counts: g.counts,
      sub: `묶음: ${g.forms.join(' · ')}`
    }))
    : [];

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
          <div class="keyword-bar__value">${value}회</div>
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
const SOURCE_COUNTRY_LABEL = { korea: '한국', japan: '일본', china: '중국', other: '공동·기타' };

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

  const summary = document.getElementById('sourcesSummary');
  if (summary) {
    const n = v => all.filter(x => sourceVerification(x) === v).length;
    summary.textContent = all.length
      ? `이 사건의 자료 ${all.length}건 — 출처 확인 ${n('verified')} · 일부 확인 ${n('partial')} · 검토 전 ${n('unverified')}`
      : '';
  }

  // 출처를 확인한 자료부터 보여줍니다.
  grid.innerHTML = list.slice().sort((x, y) => sourceRank(x) - sourceRank(y)).map(s => {
    const url = safeUrl(s.url);
    const v = sourceVerification(s);
    const related = (s.relatedTerms || []).map(t => {
      const normalized = window.SharedMemoryNLP && t.indexOf(' ') < 0 ? SharedMemoryNLP.normalizeToken(t) : t;
      const counts = eventNlp ? eventNlp.countsFor(normalized) : null;
      const inText = counts && NLP_COUNTRIES.some(c => counts[c.key] > 0);
      return inText
        ? `<button type="button" class="nlp-chip" data-evidence-term="${escapeAttr(normalized)}" title="세 서술에서 이 표현이 쓰인 위치 보기">${escapeHtml(t)}</button>`
        : `<span class="source-card__term">${escapeHtml(t)}</span>`;
    }).join('');

    // 1차 화면: 학생이 먼저 알아야 할 것 (누가·언제·왜 볼까·주의할 관점)
    const primary = [
      ['언제', s.year],
      ['누가 남겼나', s.creator]
    ].filter(([, val]) => val).map(([k, val]) => `<div class="source-card__meta-row"><dt>${k}</dt><dd>${escapeHtml(val)}</dd></div>`).join('');
    // 자세히 보기: 기관·원문명·자료 종류·확인 근거
    const detail = [
      ['원문명', s.originalTitle],
      ['자료 종류', [sourceTypeLabel(s.sourceType), s.typeNote].filter(Boolean).join(' · ')],
      ['소장·제공', [s.institution, s.archive].filter(Boolean).join(' · ')],
      ['자료 설명', s.description],
      ['확인 상태', `${VERIFICATION_LABEL[v]}${s.checkedAt ? ` (${s.checkedAt})` : ''}${s.verificationNote ? ` — ${s.verificationNote}` : ''}`]
    ].filter(([, val]) => val).map(([k, val]) => `<div class="source-card__meta-row"><dt>${k}</dt><dd>${escapeHtml(val)}</dd></div>`).join('');

    const linkHtml = url
      ? (v === 'verified'
        ? `<a class="source-card__open" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">원문/기관에서 확인하기 ↗</a>`
        : `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">제공 기관 대표 페이지 열기 ↗</a>`)
      : '<span class="nlp-meta">확인된 원문 링크 없음</span>';

    return `
      <article class="source-card source-card--${escapeAttr(s.country)}" id="source-${escapeAttr(s.id)}" data-source-id="${escapeAttr(s.id)}">
        <div class="source-card__badges">
          <span class="source-card__type source-card__type--${escapeAttr(s.sourceType)}">${escapeHtml(sourceTypeLabel(s.sourceType))}</span>
          <span class="source-card__note">${escapeHtml(SOURCE_COUNTRY_LABEL[s.country] || '')}</span>
          ${verificationBadge(s)}
        </div>
        <h4 class="source-card__title">${escapeHtml(s.title)}</h4>
        <dl class="source-card__meta">${primary}</dl>
        ${s.whyRead ? `<p class="source-card__why"><span class="narrative-card__label">왜 볼까?</span>${escapeHtml(s.whyRead)}</p>` : ''}
        ${s.perspective ? `<p class="source-card__caution"><span class="narrative-card__label">관점 주의</span>${escapeHtml(s.perspective)}</p>` : ''}
        ${related ? `<div class="source-card__related"><span class="narrative-card__label">이 자료와 연결된 표현 <small>(누르면 위치 표시)</small></span><div class="nlp-chips">${related}</div></div>` : ''}
        <details class="source-card__more">
          <summary>자세히 보기</summary>
          <dl class="source-card__meta">${detail}</dl>
        </details>
        <div class="source-card__link">
          ${linkHtml}
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
let templateUsed = false;             // 문장 틀을 넣은 적이 있는지 (빈칸 검사 기준에 사용)
let termCheckConfirmedFor = null;     // 역사 용어 안내를 보고도 그대로 등록하려는 문장

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
  templateUsed = true;
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

/* 역사 용어 확인 (작성 중 안내) — 판정이 아니라 확인을 권하는 문구만 보여줍니다. */
function renderTermCheck(text) {
  const el = document.getElementById('termCheck');
  if (!el) return;
  const notes = Guide.checkHistoricalTerms ? Guide.checkHistoricalTerms(text, currentEventId) : [];
  el.hidden = !notes.length;
  el.innerHTML = notes.length
    ? `<strong>역사 용어 확인</strong> ${notes.map(n => escapeHtml(n.message)).join(' ')} <span class="nlp-meta">(관점이나 해석을 평가하는 기능이 아니며, 그대로 등록할 수도 있습니다)</span>`
    : '';
}

function updateDraftPanel() {
  renderWritingLangHint();
  renderTermCheck(document.getElementById('userNarrative')?.value || '');
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
    a = draftContext.analyze(text, { selected: [...guideState.selected.values()], before: getBefore(), lang: writingLangChoice });
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
    ? '<p class="draft-panel__muted">국가별 서술은 한국어로 작성되어 있어, 다른 언어의 문장은 개념 사전(침략·侵略·入侵·invasion 등)을 통해서만 비교됩니다.</p>'
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
    ${section('문장 길이', `<p class="draft-panel__stat">${a.chars}자 · 내용어 ${a.tokens}개 · ${getLangBadge(a.lang).label}${a.langSource === 'selected' ? ' (직접 선택)' : ' (자동 감지)'}</p>`)}
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
    setSubmitStatus('‘② 나의 최종 표현’ 칸에 공개할 문장을 입력해 주세요.', 'error');
    narrativeInput?.focus();
    return;
  }
  // 문장 틀의 빈칸이 남아 있으면(일부만 지운 밑줄, 비워 둔 빈칸 포함) 어느 부분인지 알려주고 막습니다.
  if (Guide.findPlaceholderIssues) {
    const ph = Guide.findPlaceholderIssues(text, { templateUsed });
    if (ph.blocked) {
      setSubmitStatus(Guide.placeholderMessage(ph), 'error');
      if (narrativeInput) {
        narrativeInput.focus();
        const first = ph.issues[0];
        const offset = narrativeInput.value.indexOf(text);
        narrativeInput.setSelectionRange(offset + first.index, offset + first.index + first.length);
      }
      return;
    }
  } else if (text.indexOf('______') >= 0) {
    setSubmitStatus('문장 틀의 빈칸(______)을 자신의 말로 채운 뒤 등록해 주세요.', 'error');
    narrativeInput?.focus();
    return;
  }
  // 공개되는 닉네임에 연락처·학교·학년/반 정보가 있으면 막습니다.
  if (Guide.checkNickname && nameInput && !Guide.checkNickname(nameInput.value).ok) {
    setSubmitStatus(Guide.NICKNAME_MESSAGE, 'error');
    nameInput.focus();
    return;
  }
  // 공개 문장·이유에 링크·이메일·전화번호가 있으면 막습니다 (부적절 게시물 예방).
  if (Guide.checkPublicText) {
    const bad = [[text, narrativeInput], [reason, reasonInput]].find(([v]) => !Guide.checkPublicText(v).ok);
    if (bad) {
      setSubmitStatus(Guide.PUBLIC_TEXT_MESSAGE, 'error');
      bad[1]?.focus();
      return;
    }
  }
  // 역사 용어 확인: 막지 않고 한 번 안내합니다. 같은 문장으로 다시 누르면 그대로 등록됩니다.
  const termNotes = Guide.checkHistoricalTerms ? Guide.checkHistoricalTerms(text, currentEventId) : [];
  if (termNotes.length && termCheckConfirmedFor !== text) {
    termCheckConfirmedFor = text;
    setSubmitStatus(`역사 용어 확인 — ${termNotes.map(n => n.message).join(' ')} 표현을 고치지 않고 그대로 등록하려면 ‘제안 등록하기’를 한 번 더 눌러 주세요.`, 'info');
    return;
  }
  if (!currentEventId) {
    setSubmitStatus('먼저 역사 사건을 선택해주세요.', 'error');
    return;
  }
  // 공개는 카드와 별개인 선택 사항입니다. 동의 표시가 있을 때만 서버로 보냅니다.
  const consent = document.getElementById('publishConsent');
  if (consent && !consent.checked) {
    setSubmitStatus('공개 등록은 선택 사항입니다. 공개하려면 위의 동의 상자에 체크해 주세요. 공개하지 않아도 My Memory Card는 만들 수 있어요.', 'info');
    consent.focus();
    return;
  }
  if (!Store) {
    setSubmitStatus('저장 모듈(shared-store.js)을 불러오지 못했습니다.', 'error');
    return;
  }

  // 안전장치: 누가 참여하는지 고르지 않은 채로 이전 참여자의 정보가 새 제출에 섞이지 않게 합니다.
  // (등록 버튼을 잠그기 전에 확인해야, 선택 창을 닫아도 버튼이 "등록 중..."에 멈추지 않습니다)
  if (!ensureParticipantChoice(() => submitSharedNarrative(), 'submit')) return;

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
    lang: resolveWritingLang(text),
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
  templateUsed = false;
  termCheckConfirmedFor = null;
  document.querySelectorAll('[data-guide-reason]').forEach(cb => { cb.checked = false; });
  guideState.reasons = new Set();
  // 카드는 제출 뒤에도 만들 수 있도록, 지우기 전에 이 창의 메모리에만 남겨 둡니다(저장소에는 남기지 않음).
  cardMemo[eventIdAtSubmit] = { before: getBefore(), after: text, published: true };
  const consentBox = document.getElementById('publishConsent');
  if (consentBox) consentBox.checked = false;
  // 제출에 성공했을 때만 탐구 전 문장을 이 기기에서 지웁니다 (실패하면 그대로 남아 다시 등록할 수 있음).
  clearBeforeAfterSubmit(eventIdAtSubmit);
  // 다음 사람이 같은 창에서 "참여하기"를 눌러도 이어받지 않도록, 다음 참여 시작 때 다시 묻습니다.
  setParticipantChoice(null);
  if (eventIdAtSubmit === currentEventId) { beforeEditing = false; renderBeforeCard(); }
  renderNewcomerNotes();

  setSubmitStatus(result.legacy
    ? '공동 표현이 등록되었습니다. (일부 항목은 데이터베이스 확장 후 함께 저장됩니다) 화면 아래 ‘My Memory Card 만들기’로 카드도 받을 수 있어요.'
    : '공동 표현이 등록되었습니다. 이제 다른 참여자들의 표현과 함께 볼 수 있어요. 화면 아래 ‘My Memory Card 만들기’로 카드도 받을 수 있어요.', 'ok');

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

let sharedLoadingEventId = null;

/** 마지막으로 불러온 시각 (발표 중 '최신 참여 불러오기'를 눌렀을 때 실제로 갱신됐는지 보여줌) */
function setLoadedAt(id, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.textContent = ok ? `${time} 기준` : '';
}

const RETRY_SHARED_HTML = '<div><button type="button" class="btn btn--small" data-shared-refresh>다시 시도</button></div>';

async function loadSharedNarratives() {
  if (!currentEventId) {
    sharedNarratives = [];
    renderSharedList();
    return;
  }

  if (sharedLoadState === 'loading' && sharedLoadingEventId === currentEventId) return;   // 같은 사건을 이미 불러오는 중
  const eventId = currentEventId;
  sharedLoadingEventId = eventId;
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
  sharedLoadingEventId = null;
  setLoadedAt('memoryLoadedAt', !res.error);

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
    list.innerHTML = `<div class="shared-empty">데이터를 불러오지 못했습니다. ${escapeHtml(sharedLoadError)}${RETRY_SHARED_HTML}</div>`;
    return;
  }

  const eventItems = sharedNarratives.filter(item => item.eventId === currentEventId);
  const items = Analyzer
    ? Analyzer.filterByLanguage(eventItems, sharedLanguageFilter)
    : eventItems.filter(item => sharedLanguageFilter === 'all' || item.lang?.toLowerCase() === sharedLanguageFilter);

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

        <div class="shared-item__text"${textLangAttr(item.lang)}>"${escapeHtml(item.text)}"</div>
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

/* ------------------------------------------------------------
   Shared Archive — 공개에 동의한 공동 표현을 사건별 카드로 모아 봅니다.
   · 기존 public_expressions RPC와 공감 기능을 그대로 씁니다 (DB 변경 없음, 댓글 없음).
   · 동의 분리 이전 시범 제안과 숨김 처리한 제안은 넣지 않습니다 (Store.isArchivable).
   ------------------------------------------------------------ */

const ARCHIVE_PAGE_SIZE = 12;
let archiveEventId = null;
let archiveLoadedAt = '';
let archiveItems = [];
let archiveCounts = {};
let archiveEmpathyAvailable = false;
let archiveVisible = ARCHIVE_PAGE_SIZE;
let archiveState = 'idle';
let archiveError = '';

function openArchive(eventId) {
  navigateTo('archive');
  loadArchive(eventId || archiveEventId || eventsData[0].id);
}

function renderArchiveTabs() {
  const tabs = document.getElementById('archiveEventTabs');
  if (!tabs) return;
  tabs.innerHTML = eventsData.map(e => {
    const on = e.id === archiveEventId;
    return `<button type="button" class="shared-language-tabs__tab${on ? ' is-active' : ''}" data-archive-event="${escapeAttr(e.id)}" role="tab" aria-selected="${on}">${escapeHtml(e.title)}</button>`;
  }).join('');
}

async function loadArchive(eventId) {
  archiveEventId = eventId;
  archiveVisible = ARCHIVE_PAGE_SIZE;
  archiveState = 'loading';
  renderArchiveTabs();
  renderArchive();
  if (!Store) {
    archiveState = 'error';
    archiveError = '저장 모듈(shared-store.js)을 불러오지 못했습니다.';
    renderArchive();
    return;
  }
  const [res, emp] = await Promise.all([Store.loadExpressions(eventId), Store.fetchEmpathyCounts(eventId)]);
  if (eventId !== archiveEventId) return;   // 불러오는 사이 다른 사건을 고른 경우
  archiveLoadedAt = res.error ? '' : new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (res.error) {
    archiveState = 'error';
    archiveError = res.error;
    archiveItems = [];
  } else {
    archiveState = 'ready';
    archiveItems = res.data.filter(Store.isArchivable);
  }
  archiveEmpathyAvailable = emp.available;
  archiveCounts = emp.counts || {};
  renderArchive();
}

function renderArchive() {
  const head = document.getElementById('archiveEventHead');
  const list = document.getElementById('archiveList');
  const event = eventsData.find(e => e.id === archiveEventId);
  if (!list || !event) return;

  if (head) {
    head.innerHTML = `
      <div class="detail__era">${escapeHtml(event.era)}</div>
      <h3 class="archive__title">${escapeHtml(event.title)}</h3>
      ${event.question ? `<p class="detail__question"><span class="detail__question-label">역사적 질문</span>${escapeHtml(event.question)}</p>` : ''}
      <div class="data-refresh">
        <button type="button" class="btn btn--small" data-archive-explore="${escapeAttr(event.id)}">이 사건 직접 탐구하기 →</button>
        <button type="button" class="btn btn--small btn--ghost" data-archive-refresh>↻ 최신 표현 불러오기</button>
        <span class="nlp-meta">${archiveLoadedAt ? escapeHtml(archiveLoadedAt) + ' 기준' : ''}</span>
      </div>
    `;
  }

  if (archiveState === 'loading') {
    list.innerHTML = '<div class="shared-empty">공동 표현을 불러오는 중입니다...</div>';
    return;
  }
  if (archiveState === 'error') {
    list.innerHTML = `<div class="shared-empty">공동 표현을 불러오지 못했습니다. ${escapeHtml(archiveError)}<div><button type="button" class="btn btn--small" data-archive-refresh>다시 시도</button></div></div>`;
    return;
  }
  if (!archiveItems.length) {
    list.innerHTML = '<div class="shared-empty">아직 이 사건에 공개된 공동 표현이 없습니다. 직접 탐구하고 첫 번째 표현을 남겨 보세요.</div>';
    return;
  }

  const empathized = Store.empathizedSet();
  const visible = archiveItems.slice(0, archiveVisible);
  list.innerHTML = `<p class="nlp-meta">공개 동의를 받은 표현 ${archiveItems.length}건 · 최신순</p>
    <div class="archive-grid">${visible.map(item => {
      const id = escapeAttr(String(item.id));
      const badge = getLangBadge(item.lang || 'unknown');
      const count = archiveCounts[String(item.id)] || 0;
      const mine = empathized.has(String(item.id));
      const empathy = archiveEmpathyAvailable ? `
        <button type="button" class="shared-item__action${mine ? ' is-done' : ''}" data-archive-empathy="${id}" ${mine ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'}>
          ${mine ? '공감했어요' : '공감해요'} · <strong>${count}</strong>
        </button>` : '';
      return `
        <article class="shared-item archive-card" data-expression-id="${id}">
          <div class="shared-item__text"${textLangAttr(item.lang)}>"${escapeHtml(item.text)}"</div>
          <div class="shared-item__header">
            <div class="shared-item__user">
              ${escapeHtml(item.user)}
              <span class="narrative-card__keyword">${badge.flag} ${badge.label}</span>
            </div>
            <div class="shared-item__date">${escapeHtml(formatSharedDate(item.createdAt))}</div>
          </div>
          <div class="shared-item__actions">${empathy}</div>
        </article>`;
    }).join('')}</div>` + (archiveItems.length > visible.length
    ? `<button type="button" class="btn btn--small shared-more" data-archive-more>더 보기 (${archiveItems.length - visible.length}건 남음)</button>`
    : '');
}

async function handleArchiveEmpathy(id, button) {
  if (!Store) return;
  button.disabled = true;
  const res = await Store.addEmpathy(id);
  if (res.ok) {
    archiveCounts[String(id)] = (archiveCounts[String(id)] || 0) + 1;
    // 사건 화면이 같은 사건의 공감 수를 들고 있으면 함께 맞춥니다.
    if (archiveEventId === currentEventId) empathyCounts[String(id)] = (empathyCounts[String(id)] || 0) + 1;
  } else if (res.unavailable) {
    archiveEmpathyAvailable = false;
  } else if (!res.duplicate) {
    button.disabled = false;
    const list = document.getElementById('archiveList');
    if (list) list.insertAdjacentHTML('afterbegin', `<div class="shared-empty">공감을 저장하지 못했습니다. ${escapeHtml(res.error || '')}</div>`);
    return;
  }
  renderArchive();
}

document.getElementById('archiveEventTabs')?.addEventListener('click', e => {
  const tab = e.target.closest('[data-archive-event]');
  if (tab && tab.dataset.archiveEvent !== archiveEventId) loadArchive(tab.dataset.archiveEvent);
});

document.querySelector('.page--archive')?.addEventListener('click', e => {
  const empathy = e.target.closest('[data-archive-empathy]');
  if (empathy) { handleArchiveEmpathy(empathy.dataset.archiveEmpathy, empathy); return; }
  if (e.target.closest('[data-archive-more]')) {
    archiveVisible += ARCHIVE_PAGE_SIZE;
    renderArchive();
    return;
  }
  if (e.target.closest('[data-archive-refresh]')) {
    if (archiveState !== 'loading') loadArchive(archiveEventId);
    return;
  }
  const explore = e.target.closest('[data-archive-explore]');
  if (explore) {
    eventsMode = 'participate';
    openEventDetail(explore.dataset.archiveExplore);
  }
});

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
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[A-Za-z]/.test(text)) return 'en';
  return 'unknown';
}

/** 저장할 작성 언어: 참여자가 직접 고른 언어 → 자동 감지 결과 순서 */
function resolveWritingLang(text) {
  if (Analyzer) return Analyzer.resolveLanguage(writingLangChoice, text);
  return EXPRESSION_LANGS.indexOf(writingLangChoice) >= 0 ? writingLangChoice : detectLanguage(text);
}

// 언어 표시: 국가가 아니라 '작성 언어'이므로 국기 대신 글자 표시를 씁니다.
// (중국어·일본어는 한자 표기가 같을 수 있어, 예시에는 항상 이 표시를 함께 붙입니다)
const LANG_BADGES = {
  ko: { flag: '한', label: '한국어' },
  zh: { flag: '中', label: '中文' },
  ja: { flag: '日', label: '日本語' },
  en: { flag: 'EN', label: 'English' },
  unknown: { flag: '?', label: '미식별' }
};

/** 참여자 문장의 언어를 HTML lang 속성으로 (일본어·중국어 서체가 적용되도록). 한국어·알 수 없음은 페이지 기본(ko) */
function textLangAttr(code) {
  const map = { ja: 'ja', zh: 'zh-Hans', en: 'en' };
  const c = String(code || '').toLowerCase();
  return map[c] ? ` lang="${map[c]}"` : '';
}

function getLangBadge(code) {
  const key = typeof code === 'string' ? code.toLowerCase() : 'unknown';
  return LANG_BADGES[key] || LANG_BADGES.unknown;
}

/** [[언어, 표현], ...] → "한 침략 · 中 侵略 · 日 侵略 · EN invasion" (언어 표시 포함) */
function langExample(pairs) {
  return pairs.map(([lang, word]) => `<span class="nlp-meta">${getLangBadge(lang).flag}</span> ${escapeHtml(word)}`).join(' · ');
}

/* ---------- 공동 표현 작성 언어 선택 ---------- */

function renderWritingLangOptions() {
  const box = document.getElementById('writingLangOptions');
  if (!box) return;
  box.innerHTML = EXPRESSION_LANGS.map(lang => {
    const on = writingLangChoice === lang;
    return `<button type="button" class="age-chip${on ? ' is-selected' : ''}" aria-pressed="${on}" data-writing-lang="${lang}">${escapeHtml(getLangBadge(lang).label)}</button>`;
  }).join('');
  renderWritingLangHint();
}

function renderWritingLangHint() {
  const hint = document.getElementById('writingLangHint');
  if (!hint) return;
  if (writingLangChoice) {
    hint.textContent = `${getLangBadge(writingLangChoice).label}로 저장됩니다. 같은 버튼을 한 번 더 누르면 자동 감지로 돌아갑니다.`;
    return;
  }
  const text = document.getElementById('userNarrative')?.value || '';
  if (!text.trim()) { hint.textContent = ''; return; }
  const detail = Analyzer ? Analyzer.detectLanguageDetail(text) : { lang: detectLanguage(text), confident: true };
  if (detail.lang === 'unknown') { hint.textContent = '언어를 자동으로 판별하지 못했습니다. 작성 언어를 골라 주세요.'; return; }
  hint.textContent = detail.confident
    ? `자동 감지: ${getLangBadge(detail.lang).label}`
    : `자동 감지: ${getLangBadge(detail.lang).label} (확인 필요) — 한자만 있는 문장은 중국어와 일본어를 구분하기 어려워요. 작성 언어를 직접 골라 주세요.`;
}

function handleWritingLangChoice(lang) {
  writingLangChoice = writingLangChoice === lang ? null : lang;
  renderWritingLangOptions();
  updateDraftPanel();
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
      ko: '이 프로젝트가 비교한 서술에서 근대화 과정은 좌절·성공·치욕이라는 서로 다른 언어로 그려진다.',
      ja: 'このプロジェクトが比較した叙述では、近代化の過程が挫折・成功・屈辱という異なる言葉で描かれている。'
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
  // 참고 예시문은 한국어·일본어·영어로만 준비되어 있습니다. 그 밖의 언어(중국어 등)는 한국어 예시 기준으로 보여줍니다.
  const srcKey = samples[src] ? src : 'ko';
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
    box.innerHTML = `<div class="shared-empty">공동 표현을 불러오지 못해 분석할 수 없습니다. ${escapeHtml(sharedLoadError)}${RETRY_SHARED_HTML}</div>`;
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
          ${escapeHtml(Gen.ageLabel(memoryAgeFilter))} 참여 ${Gen.MIN_GROUP_SIZE}명 미만 — 표본이 적어 세부 분석을 표시하지 않습니다.<br />
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
  // 5명 미만인 연령대는 정확한 수 대신 "5명 미만"으로만 표시합니다 (소표본 보호).
  const shown = n => (n > 0 && n < Gen.MIN_GROUP_SIZE) ? `<${Gen.MIN_GROUP_SIZE}` : n;
  const tabs = [['all', '전체', sharedNarratives.length]]
    .concat(Gen.AGE_GROUPS.map(g => [g.id, g.label, shown(counts[g.id])]));
  const withAge = Gen.AGE_GROUPS.reduce((sum, g) => sum + counts[g.id], 0);
  return `
    <div class="age-filter">
      <div class="age-filter__label" id="ageFilterLabel">연령대별 보기</div>
      <div class="shared-language-tabs age-filter__tabs" role="tablist" aria-labelledby="ageFilterLabel">
        ${tabs.map(([id, label, n]) => `<button type="button" class="shared-language-tabs__tab${memoryAgeFilter === id ? ' is-active' : ''}" role="tab" aria-selected="${memoryAgeFilter === id}" data-age-filter="${id}">${label} <small>${n}</small></button>`).join('')}
      </div>
      <p class="nlp-meta">${withAge ? '' : '아직 연령대별로 공개할 수 있는 제안이 없습니다. '}연령대 정보가 없는 기존 제안, ‘응답하지 않음’을 고른 제안, 참여자가 5명 미만이라 서버에서 연령대를 가린 제안은 ‘전체’에만 포함됩니다. 숫자는 제안 수입니다.</p>
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
          <div class="gen-row__age">${g.label}<small>${Gen.MIN_GROUP_SIZE}명 미만</small></div>
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
  const langs = EXPRESSION_LANGS_WITH_UNKNOWN.filter(l => a.byLanguage[l] > 0)
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
      <span class="cluster-member__text"${textLangAttr(item.lang)}>“${escapeHtml(item.text)}”</span>
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
          <span class="cluster-card__quote-text"${textLangAttr(rep.lang)}>“${escapeHtml(rep.text)}”</span>
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
        <li><strong>언어 판별·토큰화</strong>: 참여자가 고른 작성 언어를 우선하고, 고르지 않았으면 한글·가나·한자·라틴 문자 비율로 판별합니다(가나 없는 한자 문장은 중국어 후보). 한국어는 규칙 기반 조사·어미 제거, 중국어는 한자 구간을 개념 사전·상용어 최장 일치와 기능어 경계로 나누는 경량 분할(형태소 분석기 아님), 일본어는 한자·가타카나 연속 구간, 영어는 불용어 제거와 간단한 어미 정리를 사용합니다.</li>
        <li><strong>특징 벡터</strong>: 단어 + 문자 2-gram(예: “국제전쟁”과 “국제적인 전쟁”이 겹치도록) + 다국어 개념 사전(예: 침략·侵略·入侵·invasion을 같은 개념으로)을 TF-IDF로 가중합니다. IDF는 이 사건의 공동 표현과 국가별 서술 전체에서 계산합니다.</li>
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
   기본 체험 — 관점 고르기(객관식) · 한 줄 소감 · 카드
   · 객관식은 퀴즈가 아닙니다. 고른 관점은 정답 판정 없이 카드에 "내가 고른 관점"으로만 담깁니다.
   · 한 줄 소감은 "직접 쓴 문장"으로 따로 담고, 공개하지 않습니다(공개는 심화 탐구의 공동 표현에서 별도 동의).
   · 고른 관점은 '익명 통계에 보태기'에 체크했을 때만 서버(별도 테이블)로 보냅니다.
   ------------------------------------------------------------ */

function quickQuestions() { return Choices ? Choices.questionsFor(currentEventId) : []; }

function gotoQuickStep(n) {
  if (n === 4) { makeQuickCard(false); return; }
  if (!(n >= 1 && n <= 3)) return;
  if (!document.querySelector('.page--detail.active')) { navigateTo('detail'); setRouteHash(currentEventId); }
  if (n === 1 && activeTab !== 'compare') switchTab('compare');
  if (n === 3) choiceState.index = Math.max(0, quickQuestions().length - 1);
  exploreStep = n;
  setCardStatus('');
  applyExploreStep();
  scrollToQuickPanel();
}

/** 기본 체험: 질문(또는 소감 칸)이 화면 위쪽에 오도록 스크롤합니다 (단계 표시보다 '지금 할 일'이 먼저 보이게). */
function scrollToQuickPanel() {
  const target = exploreStep === 2 ? document.getElementById('choiceStep')
    : exploreStep === 3 ? document.getElementById('reflectStep') : null;
  if (!target) { scrollToStepTop(); return; }
  const top = target.getBoundingClientRect().top + window.scrollY - 84;   // 상단 메뉴 높이만큼 여유
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/** 화면 아래 '다음' 버튼 (기본 체험) */
function renderQuickCta(bar) {
  const key = 'q' + exploreStep;
  bar.querySelectorAll('[data-step-main]').forEach(b => { b.hidden = b.dataset.stepMain !== key; });
  const qs = quickQuestions();
  const q = qs[choiceState.index];
  const label = document.getElementById('choiceNextLabel');
  if (label && q) {
    // 선택지를 누르면 바로 다음으로 넘어가므로, 이 버튼은 주로 '건너뛰기'입니다(이전으로 돌아온 질문에서는 '다음').
    const last = choiceState.index >= qs.length - 1;
    const unanswered = !choiceState.answers[q.id] || choiceState.answers[q.id] === Choices.SKIP;
    label.textContent = unanswered
      ? (last ? '이 질문 건너뛰고 소감 쓰기' : '이 질문 건너뛰기')
      : (last ? '한 줄 소감 쓰러 가기' : '다음 질문');
    label.closest('[data-step-main]').classList.toggle('step-cta__main--quiet', unanswered);
  }
  updateQuickCardLabel();
  const back = bar.querySelector('[data-step-back]');
  if (back) back.hidden = exploreStep === 1;
  const stepLabel = document.getElementById('stepCtaStep');
  if (stepLabel) {
    const extra = exploreStep === 2 && qs.length ? ` · 질문 ${choiceState.index + 1}/${qs.length}` : '';
    stepLabel.textContent = `STEP ${exploreStep}/4 · ${QUICK_STEPS[exploreStep - 1].short}${extra}`;
  }
  const hint = document.getElementById('stepCtaHint');
  if (hint) { hint.textContent = ''; hint.hidden = true; }
  const cardStatus = document.getElementById('cardStatus');
  if (cardStatus) cardStatus.hidden = exploreStep !== 3 || !cardStatus.textContent;
}

/** 기본 체험의 '다음' — 고르지 않았으면 그 질문은 건너뛴 것으로 남깁니다(막지 않음). */
function quickAdvance() {
  clearTimeout(choiceState.advanceTimer);
  if (exploreStep === 1) { gotoQuickStep(2); return; }
  if (exploreStep === 2) {
    const qs = quickQuestions();
    const q = qs[choiceState.index];
    if (q && !choiceState.answers[q.id]) choiceState.answers[q.id] = Choices.SKIP;
    if (choiceState.index < qs.length - 1) {
      choiceState.index += 1;
      choiceState.shownAt = Date.now();
      renderChoiceStep();
      renderFlowProgress();
      scrollToQuickPanel();
      setTimeout(() => document.querySelector('#choiceStep [data-choice-option]')?.focus({ preventScroll: true }), 300);
    } else {
      gotoQuickStep(3);
    }
  }
}

function quickBack() {
  clearTimeout(choiceState.advanceTimer);
  if (exploreStep === 2 && choiceState.index > 0) {
    choiceState.index -= 1;
    renderChoiceStep();
    renderFlowProgress();
    scrollToQuickPanel();
    return;
  }
  gotoQuickStep(exploreStep - 1);
}

/** 선택지 순서를 참여자마다 돌립니다(앞 선택지를 더 고르는 경향을 줄이기 위해). 이 창에서는 같은 순서를 유지합니다. */
function choiceOffset(qid, n) {
  if (choiceState.offsets[qid] == null) choiceState.offsets[qid] = Math.floor(Math.random() * Math.max(1, n));
  return choiceState.offsets[qid];
}

function renderChoiceStep() {
  const box = document.getElementById('choiceStep');
  if (!box || !Choices) return;
  const qs = quickQuestions();
  const q = qs[choiceState.index];
  if (!q) { box.innerHTML = ''; return; }
  const picked = choiceState.answers[q.id];
  const options = Choices.rotate(q.options, choiceOffset(q.id, q.options.length));
  const dots = qs.map((x, i) => `<i class="${i === choiceState.index ? 'is-current' : ''}${choiceState.answers[x.id] && choiceState.answers[x.id] !== Choices.SKIP ? ' is-done' : ''}"></i>`).join('');
  box.innerHTML = `
    <div class="step-head">
      <p class="step-head__kicker">관점 고르기 <span class="choice-step__count">질문 ${choiceState.index + 1}/${qs.length}</span></p>
      <div class="choice-step__dots" aria-hidden="true">${dots}</div>
      <h3 class="step-head__q" id="choicePrompt">${escapeHtml(q.prompt)}</h3>
      <p class="step-head__desc">정답은 없어요. 내가 가장 중요하다고 생각하는 것 <strong>하나</strong>를 누르면 바로 다음 질문으로 넘어가요.</p>
    </div>
    <div class="choice-options" role="radiogroup" aria-labelledby="choicePrompt">
      ${options.map(o => {
        const on = picked === o.id;
        return `<button type="button" class="choice-option${on ? ' is-selected' : ''}" role="radio" aria-checked="${on}" tabindex="${on || (!picked || picked === Choices.SKIP) && o === options[0] ? '0' : '-1'}" data-choice-option="${escapeAttr(o.id)}">
          <span class="choice-option__mark" aria-hidden="true">${on ? '✓' : ''}</span><span class="choice-option__label">${escapeHtml(o.label)}</span></button>`;
      }).join('')}
    </div>
    <p class="choice-step__note">선택지는 이 사건의 세 나라 기록과 연표에 나온 내용으로 만들었어요. 순서는 사람마다 다르게 보여요.</p>`;
  renderStepCta();
}

/**
 * @param {string} optionId
 * @param {boolean} [advance]  누르기(탭·클릭)로 골랐다면 고른 표시를 잠깐 보여 준 뒤 다음 질문으로 넘어갑니다.
 *   화살표 키로 옮겨 다닐 때는 넘어가지 않습니다(키보드 사용자가 선택지를 둘러볼 수 있게).
 */
function pickChoice(optionId, advance) {
  const q = quickQuestions()[choiceState.index];
  if (!q || !Choices.isValidAnswer(currentEventId, q.id, optionId)) return;
  choiceState.answers[q.id] = optionId;
  choiceState.sent = false;           // 다시 고르면 새 응답으로 봅니다
  renderChoiceStep();
  renderFlowProgress();
  document.querySelector(`#choiceStep [data-choice-option="${CSS.escape ? CSS.escape(optionId) : optionId}"]`)?.focus({ preventScroll: true });
  clearTimeout(choiceState.advanceTimer);
  if (!advance) return;
  const at = choiceState.index;
  choiceState.advanceTimer = setTimeout(() => {
    if (exploreMode === 'quick' && exploreStep === 2 && choiceState.index === at) quickAdvance();
  }, QUICK_ADVANCE_MS);
}

/** 선택지 사이 화살표 키 이동 (라디오 묶음) */
function handleChoiceKey(e) {
  const btn = e.target.closest('[data-choice-option]');
  if (!btn || !/^Arrow(Up|Down|Left|Right)$/.test(e.key)) return;
  e.preventDefault();
  const all = [...document.querySelectorAll('#choiceStep [data-choice-option]')];
  const i = all.indexOf(btn);
  const next = all[(i + (/Up|Left/.test(e.key) ? all.length - 1 : 1)) % all.length];
  pickChoice(next.dataset.choiceOption);
}

function chosenSummary() {
  return Choices ? Choices.summarize(currentEventId, choiceState.answers) : [];
}

function renderReflectStep() {
  const recap = document.getElementById('reflectRecap');
  if (recap) {
    const rows = chosenSummary();
    const picked = rows.filter(r => !r.skipped);
    recap.innerHTML = `
      <p class="reflect-recap__label">내가 고른 관점 <button type="button" class="before-card__link" data-step-goto="2">바꾸기</button></p>
      ${picked.length
        ? `<ul class="reflect-recap__list">${picked.map(r => `<li><small>${escapeHtml(r.question)}</small>${escapeHtml(r.answer)}</li>`).join('')}</ul>`
        : '<p class="nlp-meta">아직 고른 관점이 없어요. 고르지 않아도 카드는 만들어져요.</p>'}`;
  }
  const input = document.getElementById('reflectInput');
  if (input && input.value !== choiceState.reflection) input.value = choiceState.reflection;
  const count = document.getElementById('reflectCount');
  if (count && input) count.textContent = String(input.value.length);
  const consent = document.getElementById('choiceShareConsent');
  if (consent) consent.disabled = !chosenSummary().some(r => !r.skipped);
}

/** 소감 칸이 비어 있으면 아래 버튼이 '소감 없이 카드 만들기'가 됩니다 (따로 '건너뛰기' 버튼을 두지 않음). */
function updateQuickCardLabel() {
  const label = document.getElementById('quickCardLabel');
  if (!label) return;
  const typed = (document.getElementById('reflectInput')?.value || '').trim();
  label.textContent = typed ? 'My Memory Card 만들기' : '소감 없이 카드 만들기';
}

function makeQuickCard(skipReflection) {
  const event = currentEvent();
  if (!event || !Card || !Choices) { setCardStatus('카드 모듈을 불러오지 못했습니다.', 'error'); return; }
  const input = document.getElementById('reflectInput');
  const typed = (input ? input.value : choiceState.reflection || '').trim();
  choiceState.reflection = skipReflection ? '' : typed;
  choiceState.reflectionSkipped = !!skipReflection || !typed;
  const summary = chosenSummary();
  if (!choiceState.reflection && !summary.some(r => !r.skipped)) {
    // 아무것도 고르지 않고 쓰지도 않았다면, 막지 않고 무엇을 하면 되는지만 알려줍니다.
    setCardStatus('고른 관점도, 한 줄 소감도 없어 카드에 담을 내용이 없어요. 관점을 하나 고르거나 한 문장만 적어 주세요.', 'error');
    if (exploreStep !== 3) gotoQuickStep(3);
    input?.focus({ preventScroll: true });
    return;
  }
  setCardStatus('');
  if (cardState.eventId !== currentEventId) resetCardState();
  cardState.mode = 'quick';
  cardState.choices = summary;
  cardState.before = '';
  cardState.after = choiceState.reflection;
  cardState.published = !!(flow && flow.submitted);
  cardState.options = Card.discoveryOptions(event, eventNlp);
  cardState.picked = cardState.picked.filter(id => cardState.options.some(o => o.id === id));
  markFlow({ cardMade: true });
  const consent = document.getElementById('choiceShareConsent');
  const share = !!(consent && consent.checked && !consent.disabled);
  openCardPage();
  if (share && !choiceState.sent) sendChoices(); else renderChoiceOthers(null);
}

async function sendChoices() {
  const eventId = currentEventId;
  const rows = Choices.rowsForStorage(eventId, choiceState.answers);
  const res = Store ? await Store.insertChoices(rows) : { ok: false, unavailable: true };
  if (eventId !== currentEventId) return;
  choiceState.sent = !!res.ok;
  const msg = res.ok
    ? '고른 관점을 익명 통계에 보탰어요. (선택지 이름만 보냈어요)'
    : res.unavailable
      ? '지금은 통계 저장을 준비 중이라 보내지 않았어요. 카드는 그대로예요.'
      : `통계에 보내지 못했어요. 카드는 그대로예요. ${res.error || ''}`;
  renderChoiceOthers(msg);
}

/** 카드 화면: 다른 참여자들이 고른 관점 (객관식 집계 · 질문별 응답 5명 미만이면 숨김) */
async function renderChoiceOthers(statusMsg) {
  const box = document.getElementById('choiceOthers');
  if (!box) return;
  if (cardState.mode !== 'quick' || !Choices) { box.hidden = true; box.innerHTML = ''; return; }
  const eventId = currentEventId;
  const status = statusMsg ? `<p class="choice-others__status" role="status">${escapeHtml(statusMsg)}</p>` : '';
  box.hidden = false;
  box.innerHTML = `${status}<p class="nlp-meta">다른 참여자들의 선택을 불러오는 중…</p>`;
  const res = Store ? await Store.fetchChoiceCounts(eventId) : { available: false, rows: [] };
  if (eventId !== currentEventId || !document.getElementById('choiceOthers')) return;
  if (!res.available) {
    box.innerHTML = status;
    box.hidden = !status;
    return;
  }
  const mine = choiceState.answers;
  const qs = Choices.questionsFor(eventId);
  const shares = Choices.shareOf(eventId, res.rows);
  const body = shares.map((sh, i) => {
    const q = qs[i];
    if (sh.hidden) return `<div class="choice-others__q"><p class="choice-others__prompt">${escapeHtml(q.short)}</p><p class="nlp-meta">아직 응답이 적어(5명 미만) 결과를 보여주지 않아요.</p></div>`;
    return `<div class="choice-others__q"><p class="choice-others__prompt">${escapeHtml(q.short)} <small>(${sh.total}명)</small></p>
      <ul class="choice-others__list">${sh.options.map(o => `
        <li class="${mine[q.id] === o.id ? 'is-mine' : ''}">
          <span class="choice-others__label">${escapeHtml(o.card)}${mine[q.id] === o.id ? ' <strong>· 내 선택</strong>' : ''}</span>
          <span class="nlp-bar"><span class="nlp-bar__fill" style="width:${Math.round(o.share * 100)}%"></span></span>
          <span class="nlp-meta">${Math.round(o.share * 100)}%</span>
        </li>`).join('')}</ul></div>`;
  }).join('');
  box.innerHTML = `${status}
    <h3 class="choice-others__title">다른 참여자들은 어떤 관점을 골랐을까?</h3>
    <p class="nlp-meta">‘익명 통계에 보태기’에 동의한 참여자의 객관식 선택만 모은 것입니다(공동 표현과 따로 집계). 많이 고른 관점이 옳다는 뜻은 아니에요.</p>
    ${body}`;
}

/** 기본 체험 → 심화 탐구 (기존 4단계). 3이면 공동 표현 쓰기로 바로 갑니다. */
function switchToDeep(step) {
  setExploreMode('deep');
  if (Number(step) === 3) {
    const area = document.getElementById('userNarrative');
    const reflect = (document.getElementById('reflectInput')?.value || '').trim();
    if (area && !area.value.trim() && reflect) { area.value = reflect; updateDraftPanel(); }
    gotoStep(3);
  } else {
    gotoStep(2);
  }
}

function switchToQuick() {
  if (!Choices || !Choices.hasChoices(currentEventId)) return;
  setExploreMode('quick');
  switchTab('compare');
  gotoQuickStep(choiceState.maxStep >= 2 ? 2 : 1);
}

/* ------------------------------------------------------------
   My Memory Card — 개인 결과 카드
   · 참여자가 직접 쓴 탐구 전·후 문장, 직접 고른 발견·질문, 실제로 열어 본 탐구 단계만 담습니다.
   · 카드 내용은 서버로 보내지 않고 이 창의 메모리에만 둡니다(새로고침·새 참여자로 시작하면 사라짐).
   ------------------------------------------------------------ */

const cardMemo = {};                   // 사건 id → 제출 직전의 { before, after, published } (제출 후에도 카드를 만들 수 있게)
const DEFAULT_CARD_THEME = Themes ? Themes.DEFAULT_THEME : 'classic';
// theme·format은 '어떤 모양으로 저장할지'만 뜻합니다 (문장 내용 아님). 사건을 바꿔도 유지하고, 새 참여자로 시작하면 기본값으로 돌아갑니다.
const cardState = { eventId: null, mode: 'classic', choices: [], options: [], picked: [], custom: '', question: '', model: null, before: '', after: '', theme: DEFAULT_CARD_THEME, format: 'feed' };
let cardDraftTimer = null;

function resetCardState() {
  cardState.eventId = currentEventId;
  cardState.mode = 'classic';
  cardState.choices = [];
  cardState.options = [];
  cardState.picked = [];
  cardState.custom = '';
  cardState.question = '';
  cardState.model = null;
  cardState.before = '';
  cardState.after = '';
  ['customDiscovery', 'myQuestion'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // STEP 3에서 바로 고를 수 있도록 발견 후보는 사건을 열 때 만들어 둡니다 (모두 사건 데이터·NLP 결과에서 옴).
  const event = currentEvent();
  if (Card && event) cardState.options = Card.discoveryOptions(event, eventNlp);
  renderStepDiscoveries();
  const card = document.getElementById('memoryCard');
  if (card) card.innerHTML = '';
  setCardStatus('');
  setCardActionStatus('');
  if (document.querySelector('.page--card.active')) navigateTo(currentEventId ? 'detail' : 'home');
}

function setCardStatus(message, tone) {
  const el = document.getElementById('cardStatus');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'shared-form__status step-cta__hint' + (tone ? ` is-${tone}` : '');
  el.hidden = !message;
}

function setCardActionStatus(message) {
  const el = document.getElementById('cardActionStatus');
  if (el) el.textContent = message || '';
}

/** 카드에 쓸 탐구 전·후 문장: 지금 화면의 입력이 먼저, 공개 등록 뒤라면 이 창에 남겨 둔 값 */
function cardSentences() {
  const memo = cardMemo[currentEventId] || {};
  const typed = (document.getElementById('userNarrative')?.value || '').trim();
  return {
    before: getBefore() || (memo.before || ''),
    after: typed || (memo.after || ''),
    published: !!(memo.published || (flow && flow.submitted))
  };
}

function makeMemoryCard() {
  const event = currentEvent();
  if (!event || !Card) { setCardStatus('카드 모듈을 불러오지 못했습니다.', 'error'); return; }
  const sent = cardSentences();
  if (!sent.after) {
    // STEP 3 화면이 아니면 먼저 그 단계로 옮긴 뒤, 무엇이 비었는지 버튼 바로 위에서 알려줍니다.
    if (document.querySelector('.page--detail.active') && exploreStep !== 3) gotoStep(3);
    setCardStatus('먼저 ‘② 나의 최종 표현’ 칸에 탐구 후 나의 한 문장을 적어 주세요. 한 문장이면 충분해요.', 'error');
    const area = document.getElementById('userNarrative');
    area?.focus({ preventScroll: true });
    area?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (Guide.findPlaceholderIssues) {
    const ph = Guide.findPlaceholderIssues(sent.after, { templateUsed });
    if (ph.blocked) { setCardStatus(Guide.placeholderMessage(ph), 'error'); document.getElementById('userNarrative')?.focus(); return; }
  }
  setCardStatus('');
  if (cardState.eventId !== currentEventId) resetCardState();
  cardState.mode = 'classic';
  cardState.choices = [];
  cardState.before = sent.before;
  cardState.after = sent.after;
  cardState.published = sent.published;
  cardState.options = Card.discoveryOptions(event, eventNlp);
  cardState.picked = cardState.picked.filter(id => cardState.options.some(o => o.id === id));
  markFlow({ cardMade: true });
  openCardPage();
}

function openCardPage() {
  // 기본 체험 카드: 카드 → 저장 → 디자인 순서로, 진행 표시·'카드 다듬기'(심화 탐구용 항목)는 숨깁니다 (style.css 21-7)
  const quick = cardState.mode === 'quick';
  const cardPage = document.querySelector('.page--card');
  if (cardPage) cardPage.dataset.mode = quick ? 'quick' : 'deep';
  const backLabel = document.getElementById('cardBackLabel');
  if (backLabel) backLabel.textContent = quick ? '한 줄 소감 고치기' : 'STEP 3 · 내 표현 고치기';
  renderDiscoveryOptions();
  renderCardDesign();
  renderCardPreview();
  renderFlowProgress();
  navigateTo('card');
  setRouteHash(currentEventId);
  setTimeout(() => document.getElementById('memoryCard')?.focus({ preventScroll: true }), 300);
}

function currentCardModel() {
  const event = currentEvent();
  let change = null;
  if (Analyzer && cardState.before && cardState.after) {
    try { change = Analyzer.compareBeforeAfter(cardState.before, cardState.after, { narratives: eventNarratives(event) }); }
    catch (e) { change = null; }
  }
  return Card.buildCardModel({
    event,
    mode: cardState.mode,
    choices: cardState.choices,
    before: cardState.before,
    after: cardState.after,
    discoveries: cardState.picked.map(id => cardState.options.find(o => o.id === id)).filter(Boolean),
    customDiscovery: cardState.custom,
    question: cardState.question,
    change,
    fifth: fifthNarratorInput(event, cardState.after),
    flow,
    published: cardState.published,
    date: new Date()
  });
}

/** 다섯 번째 서술자: 탐구 후 문장을 빈자리 표에 넣어 본 결과 (카드용, 서술자 이름 붙임) */
function fifthNarratorInput(event, sentence) {
  if (!Narrator || !FOURTH_DATA || !event || !sentence) return null;
  try {
    const a = Narrator.analyzeEvent(event, AI_RECORDS, FOURTH_DATA);
    const p = Narrator.placeSentence(a, sentence);
    return {
      filled: p.filled.map(f => ({ label: f.label, where: f.missingIn.map(k => (NARRATOR_SHORT[k] || k) + ' 서술') })),
      fresh: p.fresh.map(f => ({ label: f.label }))
    };
  } catch (e) {
    console.error('다섯 번째 서술자 계산 오류:', e);
    return null;
  }
}

function renderDiscoveryOptions() {
  const box = document.getElementById('discoveryOptions');
  if (!box) return;
  if (!cardState.options.length) {
    box.innerHTML = '<p class="card-builder__desc">이 사건에서 고를 수 있는 항목이 없습니다. 아래에 직접 적어 주세요.</p>';
    return;
  }
  const full = cardState.picked.length + (cardState.custom ? 1 : 0) >= Card.MAX_DISCOVERIES;
  box.innerHTML = cardState.options.map(o => {
    const on = cardState.picked.indexOf(o.id) >= 0;
    return `<button type="button" class="guide-chip${on ? ' is-selected' : ''}" aria-pressed="${on}" data-discovery="${escapeAttr(o.id)}" title="${escapeAttr(o.text)}"${!on && full ? ' disabled' : ''}>${escapeHtml(o.chip)}</button>`;
  }).join('');
}

function toggleDiscovery(id) {
  const k = cardState.picked.indexOf(id);
  if (k >= 0) cardState.picked.splice(k, 1);
  else if (cardState.picked.length + (cardState.custom ? 1 : 0) < Card.MAX_DISCOVERIES) cardState.picked.push(id);
  renderDiscoveryOptions();
  renderStepDiscoveries();
  if (document.querySelector('.page--card.active')) renderCardPreview();
}

/* STEP 3: 새롭게 발견한 관점 고르기 — 카드 화면의 '카드 다듬기'와 같은 선택(cardState.picked)을 씁니다. */
function renderStepDiscoveries() {
  const box = document.getElementById('discoveryStep');
  if (!box || !Card) return;
  if (!cardState.options.length) {
    box.innerHTML = '<p class="card-builder__desc">이 사건에서 고를 수 있는 항목이 없습니다. 카드 화면에서 직접 적을 수 있어요.</p>';
    return;
  }
  const full = cardState.picked.length + (cardState.custom ? 1 : 0) >= Card.MAX_DISCOVERIES;
  box.innerHTML = cardState.options.map(o => {
    const on = cardState.picked.indexOf(o.id) >= 0;
    return `<button type="button" class="guide-chip guide-chip--lg${on ? ' is-selected' : ''}" aria-pressed="${on}" data-discovery-step="${escapeAttr(o.id)}" title="${escapeAttr(o.text)}"${!on && full ? ' disabled' : ''}>${on ? '<span aria-hidden="true">✓ </span>' : ''}${escapeHtml(o.chip)}</button>`;
  }).join('');
}

/* STEP 3: 탐구 전 나의 생각 다시 보기 (이 창·이 기기 안의 값만) */
function renderAfterRecall() {
  const box = document.getElementById('afterRecall');
  if (!box) return;
  const before = getBefore() || ((cardMemo[currentEventId] || {}).before || '');
  box.hidden = !before;
  box.innerHTML = before
    ? `<span class="after-recall__label">STEP 1 · 탐구 전 나의 생각</span><span class="after-recall__text">“${escapeHtml(before)}”</span>`
    : '';
}

/** 카드(화면) — 기본 체험: 고른 관점(객관식)과 직접 쓴 소감을 다른 칸·다른 이름으로 */
function quickCardSections(m, section) {
  const choices = m.choices.length
    ? `<ul class="memory-card__choices">${m.choices.map(c => `<li><small>${escapeHtml(c.question)}</small><span>${escapeHtml(c.answer)}</span></li>`).join('')}</ul>`
    : '<p class="memory-card__muted">고른 관점이 없어요. (질문을 모두 건너뜀)</p>';
  const reflection = m.after
    ? `<blockquote class="memory-card__quote memory-card__quote--after tier-${m.tiers.after}">“${escapeHtml(m.after)}”</blockquote>`
    : '<p class="memory-card__muted">소감은 남기지 않았어요.</p>';
  return `${section('memory-card__picked', '내가 고른 관점 · 객관식', choices)}
    ${section('memory-card__after memory-card__reflect', '나의 한 줄 소감 · 직접 쓴 문장', reflection)}`;
}

function renderCardPreview() {
  const box = document.getElementById('memoryCard');
  if (!box || !Card) return;
  const m = currentCardModel();
  cardState.model = m;
  const section = (cls, label, body) => `<section class="memory-card__section ${cls}"><h4 class="memory-card__label">${label}</h4>${body}</section>`;
  const change = m.change && (m.change.added.length || m.change.kept.length) ? `
    <dl class="memory-card__change">
      ${m.change.added.length ? `<div><dt>새로 쓴 말</dt><dd>${m.change.added.map(escapeHtml).join(' · ')}</dd></div>` : ''}
      ${m.change.kept.length ? `<div><dt>계속 쓴 말</dt><dd>${m.change.kept.map(escapeHtml).join(' · ')}</dd></div>` : ''}
    </dl>` : (m.change ? '<p class="memory-card__muted">탐구 전과 같은 단어로 다시 썼어요.</p>' : '');
  box.setAttribute('tabindex', '-1');
  applyCardTheme(box);
  box.innerHTML = `
    <canvas class="memory-card__art" aria-hidden="true"></canvas>
    <div class="memory-card__panel">
    ${Themes ? '' : '<div class="memory-card__band" aria-hidden="true"><i class="is-korea"></i><i class="is-japan"></i><i class="is-china"></i></div>'}
    <header class="memory-card__head">
      <span class="memory-card__brand">SHARED MEMORY</span>
      <span class="memory-card__no">MY MEMORY CARD · ${escapeHtml(m.date)}</span>
    </header>
    <div class="memory-card__event">
      <div>
        <div class="memory-card__era">${escapeHtml(m.era)}</div>
        <h3 class="memory-card__title">${escapeHtml(m.title)}</h3>
      </div>
      <span class="memory-card__seal" aria-hidden="true">${escapeHtml(m.mark)}</span>
    </div>
    ${m.question ? `<p class="memory-card__question">${escapeHtml(m.question)}</p>` : ''}
    ${m.mode === 'quick' ? quickCardSections(m, section) : `${section('memory-card__before', '탐구 전 · 나의 첫 생각', m.before
      ? `<blockquote class="memory-card__quote memory-card__quote--before tier-${m.tiers.before}">“${escapeHtml(m.before)}”</blockquote>`
      : '<p class="memory-card__muted">탐구 전 문장을 남기지 않았어요.</p>')}
    <div class="memory-card__arrow" aria-hidden="true">↓</div>
    ${section('memory-card__after', '탐구 후 · 나의 한 문장', `<blockquote class="memory-card__quote memory-card__quote--after tier-${m.tiers.after}">“${escapeHtml(m.after)}”</blockquote>${change}`)}`}
    ${m.fifth ? section('memory-card__fifth', '다섯 번째 서술자 · 내 문장이 담은 것', `
      <ul class="memory-card__fifth-list">
        ${m.fifth.filled.map(f => `<li><strong>${escapeHtml(f.label)}</strong> — ${f.where.map(escapeHtml).join('·')}에는 없던 요소</li>`).join('')}
        ${m.fifth.fresh.map(f => `<li><strong>${escapeHtml(f)}</strong> — 비교한 서술 어디에도 없던 요소</li>`).join('')}
      </ul>
      <p class="memory-card__muted">세 나라 요약 서술${AI_RECORDS.length ? '·AI 답변' : ''}과 내 문장을 개념 사전으로 비교한 관찰이에요.</p>`) : ''}
    ${m.discoveries.length ? section('memory-card__found', '탐구하며 새롭게 발견한 관점', `<ul class="memory-card__list">${m.discoveries.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`) : ''}
    ${m.myQuestion ? section('memory-card__ask', '아직 남은 나의 질문', `<p class="memory-card__ask-text">${escapeHtml(m.myQuestion)}</p>`) : ''}
    <ul class="memory-card__stamps" aria-label="탐구 기록">
      ${m.stamps.map(st => `<li class="${st.done ? 'is-done' : ''}"><span class="memory-card__stamp" aria-hidden="true">${st.mark}</span><span>${st.label}</span><span class="sr-only">${st.done ? ' — 완료' : ' — 하지 않음'}</span></li>`).join('')}
    </ul>
    <footer class="memory-card__foot">
      <p>${m.mode === 'quick' ? '고른 관점과 직접 쓴 문장으로 만든 카드예요. 정답이나 점수가 아닙니다.' : '참여자가 직접 쓴 문장으로 만든 카드입니다. 정답이나 점수를 뜻하지 않습니다.'}</p>
      <p class="memory-card__sign"><span class="memory-card__logo" aria-hidden="true">共</span> Shared Memory · 동북아 역사 공동 기억 프로젝트</p>
    </footer>
    </div>
    <canvas class="memory-card__art memory-card__art--over" aria-hidden="true"></canvas>`;
  const share = document.querySelector('[data-card-action="share"]');
  if (share) share.hidden = !(navigator.share && navigator.canShare);
  scheduleCardArt();
  ensureCardFonts(m, cardState.theme, 'feed').then(scheduleCardArt);
  if (cardState.format === 'story') renderStoryPreview();
}

/* ------------------------------------------------------------
   카드 디자인 (아트 컬렉션 테마 · 4:5 카드 / 9:16 인스타 스토리)
   · 그림은 card-themes.js가 그립니다. 화면 카드는 HTML 글자 뒤·앞에 같은 그림을 캔버스로 깔고,
     저장 이미지는 drawCard가 같은 함수로 그려 모양이 어긋나지 않습니다.
   ------------------------------------------------------------ */

function currentTheme() { return Themes ? Themes.getTheme(cardState.theme) : null; }

/** 화면 카드에 테마 색(글자·선·강조)과 그림 띠 크기를 CSS 변수로 넣습니다. */
function applyCardTheme(box) {
  const t = currentTheme();
  if (!t) return;
  const C = t.colors;
  box.dataset.theme = t.id;
  const vars = {
    '--ink': C.ink, '--ink-soft': C.soft, '--ink-mute': C.mute, '--line': C.line, '--accent': C.accent,
    '--mc-bg': C.bg, '--mc-paper': C.paper, '--mc-seal': C.seal || C.accent, '--mc-on-accent': C.onAccent,
    '--mc-font-title': t.fonts.title.family, '--mc-title-weight': String(t.fonts.title.weight),
    '--mc-font-quote': t.fonts.quote.family, '--mc-quote-weight': String(t.fonts.quote.weight),
    '--mc-top': (t.feed.top / 1080).toFixed(4), '--mc-side': (t.feed.side / 1080).toFixed(4), '--mc-bottom': (t.feed.bottom / 1080).toFixed(4)
  };
  Object.keys(vars).forEach(k => box.style.setProperty(k, vars[k]));
}

let cardArtFrame = 0;
function scheduleCardArt() {
  if (cardArtFrame) cancelAnimationFrame(cardArtFrame);
  cardArtFrame = requestAnimationFrame(() => { cardArtFrame = 0; paintCardArt(); });
}

/** 화면 카드의 배경 그림(종이 패널 포함)과 패널 위로 넘어오는 장식을 그립니다. */
function paintCardArt() {
  const box = document.getElementById('memoryCard');
  const t = currentTheme();
  if (!box || !t) return;
  const under = box.querySelector('.memory-card__art:not(.memory-card__art--over)');
  const over = box.querySelector('.memory-card__art--over');
  const panel = box.querySelector('.memory-card__panel');
  const cw = box.clientWidth, ch = box.clientHeight;
  if (!under || !over || !panel || !cw || !ch) return;
  const scale = cw / 1080;
  const W = 1080, H = ch / scale;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const br = box.getBoundingClientRect(), pr = panel.getBoundingClientRect();
  const P = { x: (pr.left - br.left) / scale, y: (pr.top - br.top) / scale, w: pr.width / scale, h: pr.height / scale };
  const cs = getComputedStyle(panel);
  const pad = Math.min(parseFloat(cs.paddingLeft) || 16, parseFloat(cs.paddingTop) || 16);
  const ins = Math.max(6, pad - 4) / scale;
  const m = cardState.model || {};
  const opts = { format: 'feed', seed: m.eventId || 'card', panel: P, mark: m.mark, inner: { x: P.x + ins, y: P.y + ins, w: P.w - ins * 2, h: P.h - ins * 2 } };
  try {
    [under, over].forEach(cv => { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); });
    const cu = under.getContext('2d');
    cu.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    Themes.paintUnder(cu, t.id, W, H, opts);
    const co = over.getContext('2d');
    co.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    Themes.paintOver(co, t.id, W, H, opts);
    box.dataset.art = 'ready';
  } catch (e) {
    console.error('카드 그림 오류:', e);
    delete box.dataset.art;
  }
}

/** 디자인 고르기(썸네일)와 형식 버튼·저장 버튼 문구를 지금 선택에 맞춥니다. */
function renderCardDesign() {
  const wrap = document.getElementById('cardThemes');
  if (wrap && Themes) {
    if (!wrap.children.length) {
      wrap.innerHTML = Themes.list().map(t => `
        <button type="button" class="card-theme" role="radio" data-card-theme="${escapeAttr(t.id)}" aria-checked="false" tabindex="-1">
          <canvas class="card-theme__thumb" aria-hidden="true"></canvas>
          <span class="card-theme__name">${escapeHtml(t.name)}</span>
          <span class="card-theme__sub">${escapeHtml(t.sub)}</span>
        </button>`).join('');
      // 썸네일은 한 번만, 화면이 그려진 뒤 차례로 그립니다.
      const thumbs = Array.from(wrap.querySelectorAll('.card-theme__thumb'));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      thumbs.forEach((cv, k) => setTimeout(() => {
        try { Themes.renderThumb(cv, Themes.ORDER[k], cv.clientWidth || 80, cv.clientHeight || 100, dpr); } catch (e) { /* 썸네일 없이도 이름으로 고를 수 있음 */ }
      }, 60 + k * 40));
    }
    wrap.querySelectorAll('[data-card-theme]').forEach(b => {
      const on = b.dataset.cardTheme === cardState.theme;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-selected', on);
    });
  }
  const t = currentTheme();
  const note = document.getElementById('cardThemeNote');
  if (note) {
    note.textContent = t && t.inspiration ? `${t.name} — ${t.inspiration}에서 영감을 받아 직접 그린 창작 장식입니다.` : '';
    note.hidden = !note.textContent;
  }
  const story = cardState.format === 'story';
  document.querySelectorAll('[data-card-format]').forEach(b => {
    const on = b.dataset.cardFormat === cardState.format;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    b.classList.toggle('is-selected', on);
  });
  const saveLabel = document.querySelector('[data-card-save-label]');
  if (saveLabel) saveLabel.textContent = story ? '스토리 이미지 저장' : '이미지로 저장';
  const share = document.querySelector('[data-card-action="share"]');
  if (share) share.textContent = story ? '인스타 스토리로 공유' : '공유하기';
  const hint = document.getElementById('cardStoryHint');
  if (hint) hint.hidden = !story;
  const card = document.getElementById('memoryCard');
  const preview = document.getElementById('storyPreview');
  if (card) card.hidden = story;
  if (preview) preview.hidden = !story;
}

function setCardTheme(id) {
  if (!Themes || !Themes.THEMES[id] || id === cardState.theme) return;
  cardState.theme = id;
  setCardActionStatus('');
  renderCardDesign();
  renderCardPreview();
}

function setCardFormat(format) {
  const f = format === 'story' ? 'story' : 'feed';
  if (f === cardState.format) return;
  cardState.format = f;
  setCardActionStatus('');
  renderCardDesign();
  if (f === 'story') renderStoryPreview(); else scheduleCardArt();
}

/** 라디오 묶음(디자인·형식)에서 화살표 키로 고르기 */
function handleCardRadioKey(e) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(e.key in keys)) return;
  const btn = e.target.closest('[data-card-theme], [data-card-format]');
  if (!btn) return;
  const group = Array.from(btn.parentElement.querySelectorAll(btn.dataset.cardTheme ? '[data-card-theme]' : '[data-card-format]'));
  const next = group[(group.indexOf(btn) + keys[e.key] + group.length) % group.length];
  e.preventDefault();
  if (next.dataset.cardTheme) setCardTheme(next.dataset.cardTheme); else setCardFormat(next.dataset.cardFormat);
  next.focus();
}

let storyPreviewToken = 0;
/** 인스타 스토리 미리보기: 저장될 이미지와 똑같이 그립니다. (글꼴을 불러온 뒤 다시 그림) */
function renderStoryPreview() {
  const cv = document.getElementById('storyCanvas');
  if (!cv || !Card) return;
  const token = ++storyPreviewToken;
  const draw = () => {
    if (token !== storyPreviewToken) return;
    const m = cardState.model || currentCardModel();
    try {
      const info = Card.drawCard(cv, m, { theme: cardState.theme, format: 'story' });
      cv.setAttribute('aria-label', `인스타 스토리용 My Memory Card 이미지 (${currentTheme() ? currentTheme().name : ''} 디자인). ${m.title} — 탐구 후 나의 한 문장: “${m.after}”${info.truncated ? ' (이미지에서는 일부 생략)' : ''}`);
    } catch (e) { console.error('스토리 미리보기 오류:', e); }
  };
  draw();
  ensureCardFonts(cardState.model, cardState.theme, 'story').then(draw);
}

/**
 * 카드 그림에 쓸 서체를 실제로 그릴 글자와 함께 불러옵니다. (테마별 서체 조합 · Memory Card fontLoads)
 * 글자 범위별로 나뉜 웹폰트(Google Fonts·Pretendard)는 글자를 넘겨야 한글·한자 조각까지 받습니다.
 * 불러오지 못하면(학교망 차단 등) 3초 뒤 기기 기본 서체로 그립니다.
 */
async function ensureCardFonts(model, themeId, format) {
  try {
    if (!document.fonts || !document.fonts.load || !Card || !Card.fontLoads) return;
    const reqs = Card.fontLoads(model || cardState.model || currentCardModel(), { theme: themeId || cardState.theme, format: format || cardState.format });
    await Promise.race([
      Promise.all(reqs.map(r => document.fonts.load(r.font, r.text).catch(() => []))),
      new Promise(r => setTimeout(r, 3000))
    ]);
  } catch (e) { /* 기본 서체 */ }
}

async function cardCanvas() {
  const canvas = document.createElement('canvas');
  const model = cardState.model || currentCardModel();
  await ensureCardFonts(model, cardState.theme, cardState.format);
  const info = Card.drawCard(canvas, model, { theme: cardState.theme, format: cardState.format });
  return { canvas, info };
}

/** 저장 파일 이름: 사건 · 날짜 · 디자인 (스토리는 -story) */
function cardFileName() {
  const m = cardState.model || {};
  const story = cardState.format === 'story' ? '-story' : '';
  return `shared-memory-card-${m.eventId || 'event'}-${(m.date || '').replace(/\./g, '')}-${cardState.theme}${story}.png`;
}

async function saveCardImage() {
  if (!Card) return;
  setCardActionStatus('이미지를 만드는 중입니다…');
  try {
    const { canvas, info } = await cardCanvas();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('이미지를 만들지 못했습니다.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cardFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setCardActionStatus(`이미지(${info.width}×${info.height})를 저장했습니다.${info.truncated ? ' 긴 문장은 이미지에서 일부 생략되었습니다(화면 카드에는 전체가 보입니다).' : ''} 휴대폰에서 저장이 안 되면 카드를 길게 눌러 저장하거나 ‘인쇄 · PDF로 저장’을 써 주세요.`);
  } catch (e) {
    console.error('카드 이미지 오류:', e);
    setCardActionStatus('이미지를 만들지 못했습니다. ‘인쇄 · PDF로 저장’을 이용해 주세요.');
  }
}

async function shareCardImage() {
  try {
    const { canvas } = await cardCanvas();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], cardFileName(), { type: 'image/png' });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) { await saveCardImage(); return; }
    await navigator.share({ files: [file], title: cardState.format === 'story' ? 'My Memory Card — Shared Memory (스토리)' : 'My Memory Card — Shared Memory' });
    setCardActionStatus('');
  } catch (e) {
    if (e && e.name === 'AbortError') return;      // 사용자가 공유 창을 닫음
    setCardActionStatus('공유하지 못했습니다. ‘이미지로 저장’을 이용해 주세요.');
  }
}

function handleCardAction(action) {
  if (action === 'back') { navigateTo('detail'); setRouteHash(currentEventId); return; }
  if (action === 'png') { saveCardImage(); return; }
  if (action === 'share') { shareCardImage(); return; }
  if (action === 'print') { window.print(); return; }
  if (action === 'memory') { navigateTo('detail'); setRouteHash(currentEventId); gotoTab('memory'); return; }
  if (action === 'publish') {
    navigateTo('detail');
    setRouteHash(currentEventId);
    gotoTab('shared');
    setTimeout(() => {
      const box = document.querySelector('.finish-box__publish');
      box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('publishConsent')?.focus({ preventScroll: true });
    }, 250);
  }
}

/* ------------------------------------------------------------
   수업·전시용 QR 시트 — 사건별 바로가기 링크
   · QR은 vendor/qrcode-generator로 이 기기에서 만듭니다(외부 QR 서비스 사용 안 함).
   ------------------------------------------------------------ */

function qrSvg(text) {
  if (typeof qrcode !== 'function') return '';
  try {
    const qr = qrcode(0, 'M');         // 0 = 내용 길이에 맞는 크기 자동 선택, M = 오류 복원 15%
    qr.addData(text, 'Byte');
    qr.make();
    // 여백(quiet zone)은 4칸 이상이어야 휴대폰 카메라가 잘 읽습니다. 설명은 바깥 요소의 aria-label로 붙입니다(id 중복 방지).
    return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  } catch (e) {
    console.error('QR 생성 오류:', e);
    return '';
  }
}

function renderQrSheet() {
  const grid = document.getElementById('qrGrid');
  if (!grid || !Card) return;
  const base = siteBaseUrl();
  grid.innerHTML = eventsData.map(e => {
    const link = Card.eventLink(base, e.id);
    const svg = qrSvg(link);
    return `
      <article class="qr-card">
        <div class="qr-card__code" role="img" aria-label="${escapeAttr(e.title)} 바로가기 QR 코드">${svg || '<span class="nlp-meta">QR을 만들지 못했습니다</span>'}</div>
        <div class="qr-card__body">
          <div class="qr-card__era">${escapeHtml(e.era)}</div>
          <h3 class="qr-card__title">${escapeHtml(e.title)}</h3>
          ${e.question ? `<p class="qr-card__question">${escapeHtml(e.question)}</p>` : ''}
          <p class="qr-card__cta">QR을 찍고 약 5분 동안 탐구해 보세요 · 로그인 없음</p>
          <code class="qr-card__link">${escapeHtml(link)}</code>
          <div class="qr-card__actions no-print">
            <button type="button" class="before-card__link" data-qr-copy="${escapeAttr(link)}">링크 복사</button>
            <a class="before-card__link" href="${escapeAttr(Card.eventHash(e.id))}">열어 보기</a>
          </div>
        </div>
      </article>`;
  }).join('');
}

async function copyQrLink(link, button) {
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); ok = true; }
  } catch (e) { ok = false; }
  if (!ok) { try { window.prompt('아래 링크를 복사해 주세요.', link); } catch (e) { /* 무시 */ } }
  if (button) {
    const text = button.textContent;
    button.textContent = ok ? '복사했습니다' : '링크 복사';
    if (ok) setTimeout(() => { button.textContent = text; }, 1800);
  }
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

/* 상단 "지금 참여하기": 첫 화면의 기본 체험 사건 카드로 가서 첫 카드에 초점을 둡니다(바로 누를 수 있게). */
function gotoQuickPicks() {
  const picks = document.getElementById('quickPicks');
  if (!picks) { startExploration(); return; }
  const fromOtherPage = !document.querySelector('.page--home.active');
  if (fromOtherPage) navigateTo('home');
  setTimeout(() => {
    picks.scrollIntoView({ behavior: 'smooth', block: 'center' });
    picks.querySelector('[data-quick-event]')?.focus({ preventScroll: true });
    picks.classList.remove('quick-picks--flash');
    void picks.offsetWidth;            // 같은 화면에서 다시 눌러도 깜빡임이 다시 보이게
    picks.classList.add('quick-picks--flash');
  }, fromOtherPage ? 300 : 0);
}

/* "다른 사건 · 전체 탐구": 연령대를 아직 고르지 않았다면 첫 화면의 참여 시작 영역을 먼저 엽니다. */
function startExploration() {
  if (!ensureParticipantChoice(() => startExploration(), 'start')) return;
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
    eyebrow: '탐구할 역사 고르기',
    title: '어떤 역사를 탐구해 볼까요?',
    desc: '하나를 고르면 STEP 1부터 바로 시작합니다.<br />처음이라면 ‘먼저 살펴보기’ 표시가 있는 사건을 권해요.'
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
   새 참여자로 시작 (공용 기기)
   · 같은 브라우저를 다음 학생이 쓸 때 이전 학생의 연령대·탐구 전 문장·학습 경험·진행 기록·
     참여자 키·공감 기록이 이어지지 않도록, 이 기기의 Shared Memory 상태('sm_' 키)만 지웁니다.
   · 데이터베이스에 이미 등록된 제안은 지우지 않습니다.
   · 같은 학생이 계속하는 경우(새로고침 포함)에는 아무것도 지우지 않습니다 — 이 버튼을 눌렀을 때만 초기화합니다.
   ------------------------------------------------------------ */

/** 지우기 전에 확인이 필요한 "작성 중인 내용" */
function draftInProgress() {
  const items = [];
  const val = id => (document.getElementById(id)?.value || '').trim();
  if (val('userNarrative')) items.push('작성 중인 문장');
  if (val('userReason')) items.push('작성 이유');
  if (val('reflectInput')) items.push('작성 중인 한 줄 소감');
  if (val('beforeInput') || (Store && Store.participantStorageKeys().some(k =>
    /^sm_before_(?!skip_|prior_|done_)/.test(k) && (Store.storageGet(k) || '').trim()))) {
    items.push('아직 제출하지 않은 탐구 전 문장');
  }
  return items;
}

function resetParticipantUiState(options) {
  const keepDraft = !!(options && options.keepDraft);   // 제출 직전 전환: 지금 사람이 쓰던 문장은 남김
  if (!keepDraft) {
    // 입력창·작성 가이드
    ['userName', 'userNarrative', 'userReason'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.querySelectorAll('[data-guide-reason]').forEach(cb => { cb.checked = false; });
    guideState.reasons = new Set();
    writingLangChoice = null;
    templateUsed = false;
  }
  const beforeInput = document.getElementById('beforeInput');
  if (beforeInput) beforeInput.value = '';
  // 기본 체험: 앞사람이 고른 관점·소감·통계 동의를 지우고, 열려 있던 사건은 처음 단계로 돌립니다.
  resetChoiceState(currentEventId);
  if (Choices && Choices.hasChoices(currentEventId)) { setExploreMode('quick'); exploreStep = 1; if (currentEvent()) applyExploreStep(); }
  // 카드: 이전 참여자의 문장이 남지 않도록 메모리·화면에서 모두 지웁니다 (제출 직전 전환이어도 카드 메모는 지움).
  Object.keys(cardMemo).forEach(k => { delete cardMemo[k]; });
  resetCardState();
  cardState.theme = DEFAULT_CARD_THEME;
  cardState.format = 'feed';
  renderCardDesign();
  // 공개 동의는 지금 쓰는 사람의 것이므로, 제출 직전 전환(keepDraft)에서는 그대로 둡니다.
  const consentBox = document.getElementById('publishConsent');
  if (consentBox && !keepDraft) consentBox.checked = false;
  termCheckConfirmedFor = null;
  beforeEditing = false;
  beforeSkipConfirm = false;
  priorEditing = false;
  memoryAgeFilter = 'all';
  memoryCache = {};
  setSubmitStatus('');
  const next = document.getElementById('submitNext');
  if (next) next.hidden = true;
  document.getElementById('agePickerNext')?.setAttribute('hidden', '');
  renderAgeOptions();
  renderWritingLangOptions();
  // 열려 있던 사건 화면도 지워진 상태로 다시 그립니다.
  const event = currentEvent();
  if (event) {
    if (!keepDraft) resetGuide(event);
    loadFlow();
    renderBeforeCard();
    renderFlowProgress();
    renderSharedList();
    updateDraftPanel();
  }
}

/**
 * @param {Function} [next]  초기화한 뒤 이어서 할 일. 없으면 기본 체험 중이었으면 첫 화면 사건 카드로,
 *   심화 탐구 중이었으면 연령대 선택(전체 탐구)부터 다시 시작합니다.
 */
function startAsNewParticipant(next) {
  const wasQuick = exploreMode === 'quick' || cardState.mode === 'quick';
  if (!Store) return false;
  const pending = draftInProgress();
  if (pending.length) {
    let ok = false;
    try {
      ok = window.confirm(`${pending.join(', ')}이(가) 있습니다.\n새 참여자로 시작하면 이 기기에서 지워지며 되돌릴 수 없습니다.\n(이미 등록된 제안은 그대로 남습니다)\n\n계속할까요?`);
    } catch (e) { ok = false; }
    if (!ok) return false;
  }
  Store.resetParticipant();
  setParticipantChoice('new');
  closeParticipantGate();
  resetParticipantUiState();
  renderNewcomerNotes();
  const status = document.getElementById('newParticipantStatus');
  if (status) {
    status.textContent = '새 참여자로 시작합니다. 이전 참여자의 연령대·탐구 전 문장·진행 기록을 이 기기에서 지웠습니다. (이미 등록된 제안은 그대로 남아 있습니다)';
    status.hidden = false;
  }
  navigateTo('home');
  if (typeof next === 'function') next();
  else if (wasQuick) gotoQuickPicks();
  else startExploration();   // 연령대가 지워졌으므로 연령대 선택부터 다시 시작합니다.
  return true;
}

/* ------------------------------------------------------------
   누가 참여하나요? — 이어서 참여 / 새 참여자 선택
   · 이 기기에 이전 참여 기록이 있으면, 참여를 시작하는 동작(참여하기·사건 열기·제출) 전에 한 번 묻습니다.
   · 선택은 이 창(탭)에만 기억합니다(sessionStorage). 새로고침해도 유지되고, 창을 새로 열면 다시 묻습니다.
   · 제출에 성공한 뒤, 또는 15분 동안 아무 조작이 없으면 다음 참여 시작 때 다시 묻습니다.
   ------------------------------------------------------------ */

const SESSION_CHOICE_KEY = 'sm_session_choice';
const PARTICIPANT_IDLE_MS = 15 * 60 * 1000;
let sessionChoiceMemory = null;          // sessionStorage를 쓸 수 없을 때
let gatePendingAction = null;
let gateContext = null;

function readParticipantSession() {
  try {
    const v = window.sessionStorage.getItem(SESSION_CHOICE_KEY);
    if (v) return JSON.parse(v);
  } catch (e) { /* 사용 불가: 메모리 값 */ }
  return sessionChoiceMemory;
}

function writeParticipantSession(value) {
  sessionChoiceMemory = value;
  try { window.sessionStorage.setItem(SESSION_CHOICE_KEY, JSON.stringify(value)); } catch (e) { /* 메모리에만 */ }
}

function setParticipantChoice(choice) {
  writeParticipantSession({ choice: choice || null, at: Date.now() });
}

let lastSessionTouch = 0;
function touchParticipantSession() {
  const now = Date.now();
  if (now - lastSessionTouch < 30000) return;
  lastSessionTouch = now;
  const s = readParticipantSession();
  if (s && s.choice && now - (s.at || 0) <= PARTICIPANT_IDLE_MS) writeParticipantSession({ choice: s.choice, at: now });
}

function needsParticipantChoice(context) {
  if (!Store || !Store.hasParticipantState()) return false;
  const s = readParticipantSession();
  if (!s || !s.choice) return true;
  // 제출 직전에는 시간 기준을 적용하지 않습니다 (글을 쓰는 동안 시간이 지났을 수 있으므로).
  if (context !== 'submit' && Date.now() - (s.at || 0) > PARTICIPANT_IDLE_MS) return true;
  return false;
}

/** 진행해도 되면 true. 먼저 물어야 하면 선택 창을 띄우고 false (선택 후 action을 이어서 실행). */
function ensureParticipantChoice(action, context) {
  if (!Store) return true;
  if (!Store.hasParticipantState()) {
    // 이 기기에 남은 기록이 없음 = 처음 참여하는 사람
    const s = readParticipantSession();
    if (!s || !s.choice) setParticipantChoice('new');
    return true;
  }
  if (!needsParticipantChoice(context)) return true;
  openParticipantGate(action, context);
  return false;
}

function openParticipantGate(action, context) {
  const gate = document.getElementById('participantGate');
  if (!gate) { setParticipantChoice('continue'); if (action) action(); return; }
  gatePendingAction = action || null;
  gateContext = context || null;
  const submitNote = gate.querySelector('[data-gate-submit-note]');
  if (submitNote) submitNote.hidden = context !== 'submit';
  gate.hidden = false;
  document.body.classList.add('has-participant-gate');
  setTimeout(() => gate.querySelector('[data-gate-choice="new"]')?.focus(), 30);
}

function closeParticipantGate() {
  const gate = document.getElementById('participantGate');
  if (gate) gate.hidden = true;
  document.body.classList.remove('has-participant-gate');
  gatePendingAction = null;
  gateContext = null;
}

function handleGateChoice(choice) {
  const action = gatePendingAction;
  const context = gateContext;
  if (choice === 'continue') {
    setParticipantChoice('continue');
    closeParticipantGate();
    if (action) action();
    return;
  }
  if (choice !== 'new') return;
  if (context === 'submit') {
    // 제출 직전 전환: 지금 쓰던 문장·이유는 남기고, 이 기기에 남아 있던 이전 참여자 정보만 지웁니다.
    Store.resetParticipant();
    setParticipantChoice('new');
    closeParticipantGate();
    resetParticipantUiState({ keepDraft: true });
    renderNewcomerNotes();
    setSubmitStatus('새 참여자로 바꿨습니다. 이전 참여자의 정보는 지웠고, 작성 중인 문장은 그대로 두었습니다. 연령대(선택)를 확인한 뒤 ‘제안 등록하기’를 다시 눌러 주세요.', 'info');
    document.getElementById('formAgeLabel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  // 기본 체험(사건 카드·QR)에서 물었다면, 초기화한 뒤 누르던 사건을 그대로 엽니다(연령대 묻지 않음).
  startAsNewParticipant(context === 'quick' && action ? action : undefined);    // 작성 중인 내용이 있으면 확인 창을 띄우고, 취소하면 선택 창이 그대로 남습니다.
}

/** 이 기기에 이전 참여 기록이 있을 때만 "새 참여자로 시작" 안내를 보여줍니다 (처음 온 사람에게는 숨김). */
function renderNewcomerNotes() {
  const show = !!(Store && Store.hasParticipantState());
  document.querySelectorAll('[data-newcomer-note]').forEach(el => { el.hidden = !show; });
}

/* ------------------------------------------------------------
   초기화 · 이벤트 연결
   ------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-event-count]').forEach(el => { el.textContent = String(eventsData.length); });
  // QR·링크로 들어온 경우(#/e/사건) 첫 화면을 거치지 않고 그 사건을 바로 엽니다.
  // (첫 화면으로 이동하면 사건 주소가 지워지므로 먼저 읽어 둡니다)
  // 새로고침은 예전처럼 첫 화면에서 다시 시작합니다 — 공용 기기에서 앞 사람이 보던 사건이 저절로 열리지 않도록.
  const initialRouteId = isReloadNavigation() ? null : routeEventId();
  renderEventCards();
  renderAgeOptions();
  navigateTo('home');
  loadParticipantCount();
  renderNewcomerNotes();
  if (initialRouteId) openRouteEvent(initialRouteId);
  window.addEventListener('hashchange', () => { if (!openRouteEvent() && /^#\/?e\//.test(window.location.hash || '')) navigateTo('home'); });

  // My Memory Card · QR 시트
  document.getElementById('makeCardButton')?.addEventListener('click', makeMemoryCard);
  document.getElementById('quickCardButton')?.addEventListener('click', () => makeQuickCard(false));
  document.getElementById('choiceStep')?.addEventListener('keydown', handleChoiceKey);
  document.getElementById('reflectInput')?.addEventListener('input', e => {
    choiceState.reflection = e.target.value;
    const count = document.getElementById('reflectCount');
    if (count) count.textContent = String(e.target.value.length);
    updateQuickCardLabel();
  });
  // 첫 화면 큰 사건 카드: 연령대·긴 설명 없이 바로 기본 체험 STEP 1
  document.querySelector('.quick-picks')?.addEventListener('click', e => {
    const pick = e.target.closest('[data-quick-event]');
    if (!pick) return;
    eventsMode = 'participate';
    openEventDetail(pick.dataset.quickEvent, { quick: true });
  });
  document.querySelector('.page--card')?.addEventListener('click', e => {
    const action = e.target.closest('[data-card-action]');
    if (action) { handleCardAction(action.dataset.cardAction); return; }
    const stepGoto = e.target.closest('[data-step-goto]');
    if (stepGoto) {
      if (stepGoto.dataset.stepGoto === '4') return;          // 지금 보고 있는 단계
      navigateTo('detail');
      setRouteHash(currentEventId);
      gotoStep(stepGoto.dataset.stepGoto);
      return;
    }
    const theme = e.target.closest('[data-card-theme]');
    if (theme) { setCardTheme(theme.dataset.cardTheme); return; }
    const format = e.target.closest('[data-card-format]');
    if (format) { setCardFormat(format.dataset.cardFormat); return; }
    const chip = e.target.closest('[data-discovery]');
    if (chip) toggleDiscovery(chip.dataset.discovery);
  });
  document.querySelector('.page--card')?.addEventListener('keydown', handleCardRadioKey);
  // 화면 카드 크기가 바뀌면(글자 입력·화면 회전) 그림을 다시 맞춥니다.
  const cardBox = document.getElementById('memoryCard');
  if (cardBox && window.ResizeObserver) new ResizeObserver(() => { if (cardBox.innerHTML) scheduleCardArt(); }).observe(cardBox);
  // 처음 열 때 서체가 늦게 도착하면(장식 속 한자·인장) 그림을 다시 그립니다.
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', () => { if (document.querySelector('.page--card.active') && cardState.model) scheduleCardArt(); });
  }
  document.getElementById('customDiscovery')?.addEventListener('input', e => {
    cardState.custom = e.target.value;
    clearTimeout(cardDraftTimer);
    cardDraftTimer = setTimeout(() => { renderDiscoveryOptions(); renderStepDiscoveries(); renderCardPreview(); }, 200);
  });
  document.getElementById('myQuestion')?.addEventListener('input', e => {
    cardState.question = e.target.value;
    clearTimeout(cardDraftTimer);
    cardDraftTimer = setTimeout(renderCardPreview, 200);
  });
  document.querySelector('.page--qr')?.addEventListener('click', e => {
    const copy = e.target.closest('[data-qr-copy]');
    if (copy) { copyQrLink(copy.dataset.qrCopy, copy); return; }
    if (e.target.closest('[data-qr-action="print"]')) window.print();
  });
  document.getElementById('userNarrative')?.addEventListener('input', () => {
    clearTimeout(cardDraftTimer);
    cardDraftTimer = setTimeout(renderFlowProgress, 400);
  });

  document.getElementById('startButton')?.addEventListener('click', startExploration);
  document.addEventListener('click', e => {
    if (e.target.closest('[data-new-participant]')) startAsNewParticipant();
    const gateChoice = e.target.closest('[data-gate-choice]');
    if (gateChoice) handleGateChoice(gateChoice.dataset.gateChoice);
  });
  // 조작이 있으면 "같은 사람이 계속 쓰는 중"으로 봅니다 (15분 동안 조작이 없으면 다음 참여 시작 때 다시 물음)
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(type =>
    document.addEventListener(type, touchParticipantSession, { passive: true, capture: true }));
  document.addEventListener('keydown', e => {
    const gate = document.getElementById('participantGate');
    if (!gate || gate.hidden) return;
    if (e.key === 'Escape') { closeParticipantGate(); return; }     // 닫기만 하고 아무것도 바꾸지 않음
    if (e.key !== 'Tab') return;
    const buttons = [...gate.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : (i + 1) % buttons.length;
    e.preventDefault();
    buttons[next].focus();
  });
  document.addEventListener('click', e => {
    const age = e.target.closest('[data-age-value]');
    if (!age) return;
    const box = age.closest('[data-age-options]');
    handleAgeChoice(age.dataset.ageValue, box ? box.dataset.ageOptions : 'form');
  });

  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      // 상단 메뉴: "지금 참여하기"는 첫 화면의 기본 체험 사건 카드로, "Shared Memory 보기"는 결과 보기용 사건 선택으로
      // (다른 사건·심화 탐구는 첫 화면의 '다른 사건 · 전체 탐구 둘러보기' → startExploration)
      if (el.dataset.view === 'participate') { gotoQuickPicks(); return; }
      if (el.dataset.view === 'memory') { gotoEvents('memory'); return; }
      if (el.dataset.page === 'archive') { openArchive(); return; }
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
    if (e.target.closest('[data-shared-refresh]')) { loadSharedNarratives(); return; }
    const source = e.target.closest('[data-goto-source]');
    if (source) { gotoSource(source.dataset.gotoSource); return; }
    const evidence = e.target.closest('[data-evidence-term]');
    if (evidence) { showEvidenceFor(evidence.dataset.evidenceTerm); return; }
    const glance = e.target.closest('[data-glance-term]');
    if (glance) { showEvidenceFor(glance.dataset.glanceTerm); return; }
    const filter = e.target.closest('[data-sources-filter]');
    if (filter) { sourcesFilter = filter.dataset.sourcesFilter; renderSourcesTab(); return; }
    const beforeAction = e.target.closest('[data-before-action]');
    if (beforeAction) { handleBeforeAction(beforeAction.dataset.beforeAction); return; }
    const prior = e.target.closest('[data-prior-value]');
    if (prior) { handlePriorAnswer(prior.dataset.priorValue); return; }
    if (e.target.closest('[data-prior-action="edit"]')) { priorEditing = true; renderBeforeCard(); return; }
    const aiRun = e.target.closest('[data-ai-run]');
    if (aiRun) { fourthRunChoice[aiRun.dataset.aiLang] = Number(aiRun.dataset.aiRun); renderFourthTab(currentEvent()); return; }
    const aiShow = e.target.closest('[data-ai-show]');
    if (aiShow) { fourthLangShown = aiShow.dataset.aiShow; renderFourthTab(currentEvent()); return; }
    if (e.target.closest('[data-quick-next]')) { quickAdvance(); return; }
    const choiceOpt = e.target.closest('[data-choice-option]');
    if (choiceOpt) { if (Date.now() - (choiceState.shownAt || 0) >= QUICK_TAP_GUARD_MS) pickChoice(choiceOpt.dataset.choiceOption, true); return; }
    const deep = e.target.closest('[data-deep-switch]');
    if (deep) { switchToDeep(deep.dataset.deepSwitch); return; }
    if (e.target.closest('[data-quick-return]')) { switchToQuick(); return; }
    const stepGoto = e.target.closest('[data-step-goto]');
    if (stepGoto) { gotoStep(stepGoto.dataset.stepGoto); return; }
    if (e.target.closest('[data-step-back]')) { if (exploreMode === 'quick') quickBack(); else gotoStep(exploreStep - 1); return; }
    const discovery = e.target.closest('[data-discovery-step]');
    if (discovery) { toggleDiscovery(discovery.dataset.discoveryStep); return; }
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
  document.getElementById('userNarrative')?.addEventListener('input', e => {
    if (!e.target.value.trim()) templateUsed = false;
    scheduleDraftPanel();
  });
  renderWritingLangOptions();
  document.getElementById('writingLangOptions')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-writing-lang]');
    if (chip) handleWritingLangChoice(chip.dataset.writingLang);
  });
  document.getElementById('submitNarrative')?.addEventListener('click', submitSharedNarrative);

  // 공동 표현 목록 (공감 / 참고 번역 예시 / 더 보기)
  document.getElementById('sharedList')?.addEventListener('click', e => {
    const empathy = e.target.closest('[data-empathy-id]');
    if (empathy) { handleEmpathy(empathy.dataset.empathyId, empathy); return; }
    const translate = e.target.closest('[data-translate-id]');
    if (translate) { toggleTranslation(translate.dataset.translateId); return; }
    if (e.target.closest('[data-shared-more]')) { sharedVisibleCount += 20; renderSharedList(); }
  });

  // 휴대폰 키보드가 열려도 화면 아래 주요 버튼이 가려지지 않도록, 보이는 화면(visualViewport) 바닥에 맞춥니다.
  // (Android Chrome은 viewport의 interactive-widget=resizes-content로, iOS Safari는 아래 계산으로 처리)
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const placeCta = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-offset', `${Math.round(covered)}px`);
    };
    vv.addEventListener('resize', placeCta);
    vv.addEventListener('scroll', placeCta);
    placeCta();
  }
  // 안내 문구가 붙어 버튼 영역이 높아져도 입력창·내용을 가리지 않도록 실제 높이를 스크롤 여백에 반영합니다.
  const ctaBar = document.getElementById('stepCta');
  if (ctaBar && 'ResizeObserver' in window) {
    new ResizeObserver(() => {
      const h = ctaBar.offsetHeight;
      if (h > 0) document.documentElement.style.setProperty('--cta-h', `${h}px`);
    }).observe(ctaBar);
  }

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
