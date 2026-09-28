/* ============================================================
   Shared Memory Project — script.js
   ============================================================ */

let currentEventId = null;
let sharedNarratives = [];
let sharedLanguageFilter = 'all';

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
    <div class="event-card" data-event-id="${event.id}">
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
          <div class="narrative-card__label">표현 특징</div>
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

  switchTab('compare');
  renderKeywordChart(event);
  loadSharedNarratives();
  navigateTo('detail');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.querySelector(`[data-tab-content="${tabName}"]`)?.classList.add('active');
}

/* ------------------------------------------------------------
   AI/NLP 비교 분석 (nlp-analyzer.js 사용)
   · 결과는 events-data.js의 서술 텍스트로부터 매번 계산됩니다.
   ------------------------------------------------------------ */

const NLP_COUNTRIES = [
  { key: 'korea', name: '한국', flag: '韓' },
  { key: 'japan', name: '일본', flag: '日' },
  { key: 'china', name: '중국', flag: '中' }
];

let nlpAnalysis = null;      // 마지막으로 계산된 분석 결과
let nlpSelectedTerm = null;  // 근거 확인 패널에서 강조할 표현

function nlpCountryName(key) {
  return (NLP_COUNTRIES.find(c => c.key === key) || {}).name || key;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function formatNum(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function runAIAnalysis() {
  const event = eventsData.find(e => e.id === currentEventId);
  if (!event) return;

  const resultBox = document.getElementById('aiResult');
  resultBox.classList.add('show');

  if (!window.SharedMemoryNLP) {
    resultBox.innerHTML = `<div class="shared-empty">분석 모듈(nlp-analyzer.js)을 불러오지 못했습니다.</div>`;
    return;
  }

  nlpAnalysis = SharedMemoryNLP.analyzeEventData(event, eventsData);
  nlpSelectedTerm = nlpAnalysis.common[0]?.term || nlpAnalysis.keywords.korea[0]?.term || null;

  resultBox.innerHTML = `
    ${renderNLPAnalysis(nlpAnalysis)}
    ${renderEditorNotes(editorNotes[event.id])}
    ${renderMultilingualSection()}
    <div class="nlp-next">
      <p>분석 결과를 참고해, 세 국가가 함께 받아들일 수 있는 표현을 직접 제안해 보세요.</p>
      <button type="button" class="btn btn--primary" data-goto-tab="shared">공동 표현 제안하러 가기 →</button>
    </div>
  `;
}

function nlpChip(term, country, extra = '') {
  const selected = term === nlpSelectedTerm ? ' is-selected' : '';
  const tone = country ? ` nlp-chip--${country}` : '';
  return `<button type="button" class="nlp-chip${tone}${selected}" data-nlp-term="${escapeAttr(term)}" title="원문에서 근거 보기">${escapeHtml(term)}${extra}</button>`;
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
        <li>아래의 모든 단어 칩을 누르면 <strong>5. 근거 확인</strong>에서 해당 표현이 원문 어디에 쓰였는지 강조됩니다.</li>
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

function renderNLPEvidence() {
  if (!nlpAnalysis) return '';

  const term = nlpSelectedTerm;
  const occ = term ? nlpAnalysis.occurrences(term) : { korea: [], japan: [], china: [] };
  const counts = term ? nlpAnalysis.countsFor(term) : { korea: 0, japan: 0, china: 0 };

  const head = term
    ? `<p class="nlp-desc">선택한 표현 <strong>“${escapeHtml(term)}”</strong> — ${nlpCountsLabel(counts)}회 등장 <small>(조사·어미를 떼어낸 기본형 기준, 원문은 어절 단위로 강조)</small></p>`
    : '<p class="nlp-desc">위의 단어를 선택하면 원문에서 위치를 보여줍니다.</p>';

  const cols = NLP_COUNTRIES.map(c => `
    <div class="nlp-col nlp-col--${c.key}">
      <div class="nlp-col__head">${c.flag} ${c.name} 서술 <span class="nlp-meta">(${counts[c.key]}회)</span></div>
      <p class="nlp-evidence__text">${highlightSpans(nlpAnalysis.texts[c.key], occ[c.key])}</p>
    </div>`).join('');

  return `${head}<div class="nlp-grid">${cols}</div>`;
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
        <li><strong>한계</strong>: 형태소 분석기가 아닌 규칙 기반 처리라 일부 활용형이 남거나 잘릴 수 있고, 같은 뜻의 다른 단어(예: 침략·침공)는 서로 다른 단어로 계산됩니다. 결과는 어휘 선택의 경향을 보여줄 뿐, 역사 해석의 옳고 그름을 판정하지 않습니다.</li>
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
      '일본: "출병"·"진출"이라는 비교적 중립적인 표현을 사용한다.',
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

function renderMultilingualSection() {
  const result = runMultilingualAnalysis();

  if (result.empty) {
    return `
      <div class="ai-result__section">
        <div class="ai-result__heading">
          <span>🌐</span>
          <span>다국어 공동 표현 분석</span>
        </div>
        <ul class="ai-result__list">
          <li>${result.message}</li>
        </ul>
      </div>
    `;
  }

  const langOrder = ['ko', 'ja', 'en'];
  const statRows = langOrder.map(lang => {
    const s = result.stats[lang];
    const badge = getLangBadge(lang);

    if (!s) return `<li>${badge.flag} ${badge.label} — 입력 없음</li>`;

    const e = s.emotion;
    const dominant = e.negative > e.positive && e.negative > e.neutral ? '부정·갈등 어휘 우세'
                   : e.positive > e.negative && e.positive > e.neutral ? '긍정·화해 어휘 우세'
                   : e.neutral > 0 ? '중립·사실 어휘 우세'
                   : '감정 어휘 미검출';

    return `
      <li>
        ${badge.flag} ${badge.label} —
        제안 ${s.count}건, 평균 ${s.avgLen}자,
        <strong style="color: var(--accent);">${dominant}</strong>
        (부정 ${e.negative} · 중립 ${e.neutral} · 긍정 ${e.positive})
      </li>
    `;
  }).join('');

  const commonKwHtml = result.commonHits.length > 0
    ? result.commonHits.map(k => `<li>"${k.keyword}" — ${k.count}건의 제안에서 등장</li>`).join('')
    : '<li>아직 사건 표준 키워드와 일치하는 표현이 충분히 등장하지 않았습니다.</li>';

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading">
        <span>🌐</span>
        <span>다국어 공동 표현 분석 (총 ${result.totalCount}건)</span>
      </div>
      <ul class="ai-result__list">
        ${statRows}
      </ul>
    </div>

    <div class="ai-result__section">
      <div class="ai-result__heading">
        <span>🔗</span>
        <span>언어를 가로지르는 공통 키워드</span>
      </div>
      <ul class="ai-result__list">
        ${commonKwHtml}
      </ul>
    </div>
  `;
}

function renderKeywordChart(event) {
  const chart = document.getElementById('keywordsChart');
  if (!chart) return;

  chart.innerHTML = Object.entries(event.keywordFreq).map(([keyword, freqs]) => `
    <div class="keyword-row">
      <div class="keyword-row__label">${keyword}</div>
      <div class="keyword-row__bars">
        <div class="keyword-bar">
          <div class="keyword-bar__country keyword-bar__country--korea">한국</div>
          <div class="keyword-bar__track">
            <div class="keyword-bar__fill keyword-bar__fill--korea" data-width="${freqs.korea * 10}"></div>
          </div>
          <div class="keyword-bar__value">${freqs.korea}</div>
        </div>
        <div class="keyword-bar">
          <div class="keyword-bar__country keyword-bar__country--japan">일본</div>
          <div class="keyword-bar__track">
            <div class="keyword-bar__fill keyword-bar__fill--japan" data-width="${freqs.japan * 10}"></div>
          </div>
          <div class="keyword-bar__value">${freqs.japan}</div>
        </div>
        <div class="keyword-bar">
          <div class="keyword-bar__country keyword-bar__country--china">중국</div>
          <div class="keyword-bar__track">
            <div class="keyword-bar__fill keyword-bar__fill--china" data-width="${freqs.china * 10}"></div>
          </div>
          <div class="keyword-bar__value">${freqs.china}</div>
        </div>
      </div>
    </div>
  `).join('');

  setTimeout(() => {
    chart.querySelectorAll('.keyword-bar__fill').forEach(bar => {
      bar.style.width = bar.dataset.width + '%';
    });
  }, 100);
}
async function submitSharedNarrative() {
  const nameInput = document.getElementById('userName');
  const narrativeInput = document.getElementById('userNarrative');
  const reasonInput = document.getElementById('userReason');

  const name = nameInput ? nameInput.value.trim() : '';
  const text = narrativeInput ? narrativeInput.value.trim() : '';
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (!name || !text) {
    alert('닉네임과 공동 표현은 필수 입력 항목입니다.');
    return;
  }

  if (!currentEventId) {
    alert('먼저 역사 사건을 선택해주세요.');
    return;
  }

  const detectedLang = detectLanguage(text);

  const submitButton = document.getElementById('submitNarrative');

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.textContent = '등록 중...';
  }

  const { error } = await db
    .from('shared_expressions')
    .insert([
      {
        event_key: currentEventId,
        author_name: name,
        country_code: detectedLang,
        content: text,
        reason: reason
      }
    ]);

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent =
      submitButton.dataset.originalText || '제안 등록하기';
  }

  if (error) {
    console.error('Supabase 저장 오류:', error);

    alert(
      '등록에 실패했습니다.\n\n오류 내용: ' +
      error.message
    );

    return;
  }

  if (nameInput) nameInput.value = '';
  if (narrativeInput) narrativeInput.value = '';
  if (reasonInput) reasonInput.value = '';

  await loadSharedNarratives();

  alert('공동 표현이 등록되었습니다.');
}
async function loadSharedNarratives() {
  if (!currentEventId) {
    sharedNarratives = [];
    renderSharedList();
    return;
  }

  const list = document.getElementById('sharedList');

  if (list) {
    list.innerHTML = `
      <div class="shared-empty">
        공동 표현을 불러오는 중입니다...
      </div>
    `;
  }

  const { data, error } = await db
    .from('shared_expressions')
    .select('*')
    .eq('event_key', currentEventId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase 불러오기 오류:', error);

    if (list) {
      list.innerHTML = `
        <div class="shared-empty">
          데이터를 불러오지 못했습니다.
        </div>
      `;
    }

    return;
  }

  sharedNarratives = (data || []).map(item => ({
    id: item.id,
    user: item.author_name || '익명',
    text: item.content || '',
    reason: item.reason || '',
    eventId: item.event_key,
    lang: item.country_code || 'unknown',
    date: formatSharedDate(item.created_at),
    translationOpen: false
  }));

  renderSharedList();
}

function formatSharedDate(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);

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
  document.querySelectorAll('[data-shared-language]').forEach(tab => {
    const active = tab === button;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  renderSharedList();
});

function renderSharedList() {
  const list = document.getElementById('sharedList');
  if (!list) return;

  const items = sharedNarratives
    .map((item, idx) => ({ item, idx }))
    .filter(pair => pair.item.eventId === currentEventId &&
      (sharedLanguageFilter === 'all' || pair.item.lang?.toLowerCase() === sharedLanguageFilter));

  if (items.length === 0) {
    list.innerHTML = `<div class="shared-empty">${sharedLanguageFilter === 'all' ? '아직 등록된 제안이 없습니다. 첫 번째 제안을 작성해 보세요!' : '이 언어로 등록된 제안이 없습니다.'}</div>`;
    return;
  }

  list.innerHTML = items.map(({ item, idx }) => {
    const badge = getLangBadge(item.lang || 'unknown');

    let translationHtml = '';
    if (item.translationOpen) {
      const trans = buildTranslation(item);
      if (trans) {
        const translatedRows = Object.entries(trans).map(([lang, txt]) => {
          const b = getLangBadge(lang);
          return `
            <div style="margin-top: 0.6rem;">
              <span class="narrative-card__keyword" style="font-size: 0.7rem;">${b.flag} ${b.label}</span>
              <div style="margin-top: 0.4rem; font-size: 0.88rem; color: var(--ink-soft); line-height: 1.7;">
                ${escapeHtml(txt)}
              </div>
            </div>
          `;
        }).join('');

        translationHtml = `
          <div class="shared-item__reason">
            <strong>참고 번역:</strong>
            ${translatedRows}
            <div style="margin-top: 0.6rem; font-size: 0.75rem; color: var(--ink-mute);">
              ※ 본 번역은 학습용 예시 매핑이며, 실제 자동 번역 API를 대체할 자리입니다.
            </div>
          </div>
        `;
      }
    }

    const toggleText = item.translationOpen ? '번역 닫기' : '번역 보기';

    return `
      <div class="shared-item">
        <div class="shared-item__header">
          <div class="shared-item__user">
            ${escapeHtml(item.user)}
            <span class="narrative-card__keyword" style="font-size: 0.72rem;">
              ${badge.flag} ${badge.label}
            </span>
          </div>
          <div class="shared-item__date">${item.date}</div>
        </div>

        <div class="shared-item__text">"${escapeHtml(item.text)}"</div>

        ${item.reason ? `
          <div class="shared-item__reason">
            <strong>작성 이유:</strong> ${escapeHtml(item.reason)}
          </div>
        ` : ''}

        <button
          class="narrative-card__keyword"
          style="margin-top: 0.9rem; cursor: pointer; border: 1px solid var(--line); background: white;"
          data-translate-index="${idx}">
          🌐 ${toggleText}
        </button>

        ${translationHtml}
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-translate-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleTranslation(parseInt(btn.dataset.translateIndex, 10));
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function detectLanguage(text) {
  if (!text || !text.trim()) return 'unknown';

  const hangulRegex = /[가-힣]/;
  const kanaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  const latinRegex = /[A-Za-z]/;

  if (hangulRegex.test(text)) return 'ko';
  if (kanaRegex.test(text)) return 'ja';
  if (latinRegex.test(text)) return 'en';

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

function toggleTranslation(index) {
  const item = sharedNarratives[index];
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

const emotionLex = {
  negative: {
    ko: ['침략', '치욕', '굴종', '비극', '좌절', '불법', '강제', '왜곡', '차별'],
    ja: ['侵略', '屈辱', '挫折', '不法', '強制', '悲劇', '差別'],
    en: ['invasion', 'humiliation', 'illegal', 'forced', 'tragedy', 'aggression', 'discrimination']
  },
  neutral: {
    ko: ['전쟁', '출병', '진출', '교류', '관계', '제도', '시기', '이주', '원폭'],
    ja: ['戦争', '出兵', '進出', '交流', '関係', '制度', '移住', '原爆'],
    en: ['war', 'campaign', 'exchange', 'relation', 'system', 'period', 'migration', 'atomic']
  },
  positive: {
    ko: ['공동', '평화', '협력', '화해', '대화', '이해', '공존', '상호'],
    ja: ['共同', '平和', '協力', '和解', '対話', '理解'],
    en: ['shared', 'peace', 'cooperation', 'reconciliation', 'dialogue', 'mutual']
  }
};

function analyzeEmotion(text, lang) {
  const counts = { negative: 0, neutral: 0, positive: 0 };
  if (lang === 'unknown') return counts;

  ['negative', 'neutral', 'positive'].forEach(category => {
    const words = emotionLex[category][lang] || [];
    words.forEach(word => {
      let count;
      if (lang === 'en') {
        const re = new RegExp('\\b' + word + '\\b', 'gi');
        count = (text.match(re) || []).length;
      } else {
        count = text.split(word).length - 1;
      }
      counts[category] += count;
    });
  });

  return counts;
}

function runMultilingualAnalysis() {
  const items = sharedNarratives.filter(s => s.eventId === currentEventId);

  if (items.length === 0) {
    return {
      empty: true,
      message: '아직 등록된 공동 표현 제안이 없습니다. "공동 표현 작성" 탭에서 먼저 한·일·영 어떤 언어로든 표현을 등록해 주세요.'
    };
  }

  const byLang = { ko: [], ja: [], en: [], unknown: [] };

  items.forEach(it => {
    const arr = byLang[it.lang] || byLang.unknown;
    arr.push(it);
  });

  const stats = {};

  ['ko', 'ja', 'en'].forEach(lang => {
    const arr = byLang[lang];

    if (arr.length === 0) {
      stats[lang] = null;
      return;
    }

    const avgLen = Math.round(
      arr.reduce((sum, x) => sum + x.text.length, 0) / arr.length
    );

    const emotion = { negative: 0, neutral: 0, positive: 0 };

    arr.forEach(x => {
      const e = analyzeEmotion(x.text, lang);
      emotion.negative += e.negative;
      emotion.neutral += e.neutral;
      emotion.positive += e.positive;
    });

    stats[lang] = { count: arr.length, avgLen, emotion };
  });

  const event = eventsData.find(e => e.id === currentEventId);
  const allKeywords = [
    ...event.korea.keywords,
    ...event.japan.keywords,
    ...event.china.keywords
  ];

  const commonHits = [];

  allKeywords.forEach(kw => {
    const hits = items.filter(it => it.text.includes(kw)).length;
    if (hits > 0) commonHits.push({ keyword: kw, count: hits });
  });

  commonHits.sort((a, b) => b.count - a.count);

  return {
    empty: false,
    totalCount: items.length,
    stats,
    commonHits: commonHits.slice(0, 6)
  };
}

document.addEventListener('DOMContentLoaded', () => {
  renderEventCards();
  navigateTo('home');

  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
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
    const goto = e.target.closest('[data-goto-tab]');
    if (goto) {
      switchTab(goto.dataset.gotoTab);
      document.querySelector('.tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  document.getElementById('submitNarrative')?.addEventListener('click', submitSharedNarrative);

  console.log('🎌 Shared Memory Project 로드 완료');
  console.log(`📚 등록된 사건: ${eventsData.length}개`);
});

  
