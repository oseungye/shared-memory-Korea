/* ============================================================
   Shared Memory Project — generation-analysis.js
   세대(연령대)별 공동 표현 분석 · 탐구 진행(milestone) 계산
   ============================================================
   · 분석 로직을 새로 만들지 않습니다. 연령대로 "입력 데이터만 걸러서"
     shared-memory-analyzer.js의 analyzeExpressions / aggregateBeforeAfter에 그대로 넘깁니다.
   · 연령대·학습 경험 코드(id)는 Supabase에 그대로 저장되므로, 한 번 쓴 id는 바꾸지 마세요.
   · 표본이 적은 집단은 세부 분석을 공개하지 않습니다 (MIN_GROUP_SIZE).
   ============================================================ */

(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const Analyzer = isNode ? require('./shared-memory-analyzer.js') : root.SharedMemoryAnalyzer;
  const api = factory(Analyzer);
  if (isNode) module.exports = api;
  else root.GenerationAnalysis = api;
})(typeof self !== 'undefined' ? self : this, function (Analyzer) {
  'use strict';

  /** 이 인원 미만인 연령대는 세부 분석을 표시하지 않습니다. (나중에 이 숫자만 바꾸면 됩니다) */
  const MIN_GROUP_SIZE = 5;

  /** 세대 간 "차이가 크지 않음"을 판단하는 기술적(descriptive) 기준. 통계적 유의성 검정이 아닙니다. */
  const DIFF_THRESHOLDS = {
    frameShare: 0.15,      // 표현 프레임 비율의 최대 차이 (15%p)
    similarity: 0.05       // 국가별 서술과의 평균 텍스트 유사도 차이
  };

  /** 연령대 (DB 값 → 화면 이름). no_answer = "응답하지 않음"을 명시적으로 고른 경우 */
  const AGE_GROUPS = [
    { id: '10s', label: '10대' },
    { id: '20s', label: '20대' },
    { id: '30s', label: '30대' },
    { id: '40s', label: '40대' },
    { id: '50s', label: '50대' },
    { id: '60plus', label: '60대 이상' }
  ];
  const AGE_NO_ANSWER = { id: 'no_answer', label: '응답하지 않음' };
  const AGE_IDS = AGE_GROUPS.map(g => g.id);

  /** 이 사건을 이전에 배우거나 접한 경험 */
  const PRIOR_LEARNING = [
    { id: 'yes', label: '있다' },
    { id: 'no', label: '없다' },
    { id: 'unsure', label: '잘 모르겠다' },
    { id: 'no_answer', label: '응답하지 않음' }
  ];

  /** 연령대 코드 정리: 알 수 없는 값·빈 값 → null (기존 행 호환) */
  function normalizeAgeGroup(value) {
    if (value === AGE_NO_ANSWER.id) return AGE_NO_ANSWER.id;
    return AGE_IDS.indexOf(value) >= 0 ? value : null;
  }

  function normalizePriorLearning(value) {
    return PRIOR_LEARNING.some(p => p.id === value) ? value : null;
  }

  function ageLabel(id) {
    if (id === AGE_NO_ANSWER.id) return AGE_NO_ANSWER.label;
    const g = AGE_GROUPS.find(x => x.id === id);
    return g ? g.label : '연령대 정보 없음';
  }

  function priorLabel(id) {
    const p = PRIOR_LEARNING.find(x => x.id === id);
    return p ? p.label : '';
  }

  /** 'all'이면 원래 배열을 그대로 돌려줍니다 (전체 결과 = 기존 분석 결과). */
  function filterByAgeGroup(items, ageGroup) {
    const list = Array.isArray(items) ? items : [];
    if (!ageGroup || ageGroup === 'all') return list;
    return list.filter(it => it && normalizeAgeGroup(it.ageGroup) === ageGroup);
  }

  /** 연령대별 제안 수. 연령대가 없는 기존 행은 unknown, "응답하지 않음"은 no_answer */
  function groupCounts(items) {
    const counts = { unknown: 0, no_answer: 0 };
    AGE_IDS.forEach(id => { counts[id] = 0; });
    (Array.isArray(items) ? items : []).forEach(it => {
      if (!it) return;
      const g = normalizeAgeGroup(it.ageGroup);
      counts[g || 'unknown'] += 1;
    });
    return counts;
  }

  /**
   * 표본 크기. 서버 집계(중복 제거된 참여자 수)가 있으면 그것을, 없으면 제안 수를 씁니다.
   * 한 사람이 여러 제안을 낼 수 있으므로 둘 중 작은 값을 기준으로 삼습니다.
   */
  function sampleSize(ageGroup, expressionCounts, participantCounts) {
    const e = Number(expressionCounts && expressionCounts[ageGroup]) || 0;
    if (participantCounts && participantCounts[ageGroup] != null) {
      return Math.min(e, Number(participantCounts[ageGroup]) || 0);
    }
    return e;
  }

  function isSampleSufficient(n, minSize) {
    return (Number(n) || 0) >= (minSize == null ? MIN_GROUP_SIZE : minSize);
  }

  /**
   * 완료 참여자 기준: 사건 선택 + 탐구 시작(탐구 전 문장 또는 시작 기록) + 국가별 서술 확인 + 공동 표현 제출.
   * NLP·사료 열람은 추가 분석 데이터일 뿐 완료 조건이 아닙니다.
   */
  function computeCompletedFlow(m) {
    const s = m || {};
    const started = !!(s.startedExploration || s.beforeWritten);
    return !!(s.eventSelected && started && s.viewedCompare && s.submitted);
  }

  function meanOf(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  /**
   * 연령대별로 기존 분석 함수를 다시 실행해 요약합니다.
   * @param {Array} items   mapRow 형태의 제안 (ageGroup 포함)
   * @param {{narratives, minSize?, participantCounts?}} options
   */
  function compareAgeGroups(items, options) {
    const opts = options || {};
    const minSize = opts.minSize == null ? MIN_GROUP_SIZE : opts.minSize;
    const counts = groupCounts(items);
    const groups = AGE_GROUPS.map(g => {
      const n = sampleSize(g.id, counts, opts.participantCounts);
      const base = { id: g.id, label: g.label, expressions: counts[g.id], sample: n, sufficient: isSampleSufficient(n, minSize) };
      if (!base.sufficient) return base;

      const subset = filterByAgeGroup(items, g.id);
      const a = Analyzer.analyzeExpressions(subset, { narratives: opts.narratives });
      const totalHits = a.framing.totalHits || 0;
      const frameShare = {};
      Analyzer.FRAMES.forEach(f => { frameShare[f.id] = totalHits ? a.framing.overall[f.id] / totalHits : 0; });
      const avg = a.narrativeLink ? a.narrativeLink.averageSimilarity : null;
      return Object.assign(base, {
        analysis: a,
        topConcepts: a.topConcepts.slice(0, 3),
        topTerms: a.topTerms.slice(0, 3),
        frameShare,
        frameHits: totalHits,
        narrativeSimilarity: avg,
        meanNarrativeSimilarity: avg ? meanOf(Object.keys(avg).map(k => avg[k])) : 0
      });
    });

    const eligible = groups.filter(g => g.sufficient);
    const result = { minSize, groups, eligible: eligible.map(g => g.id), comparable: eligible.length >= 2, differences: null, verdict: 'insufficient' };
    if (!result.comparable) return result;

    const withFrames = eligible.filter(g => g.frameHits > 0);
    let frameDiff = 0, frameDiffId = null;
    Analyzer.FRAMES.forEach(f => {
      if (withFrames.length < 2) return;
      const vals = withFrames.map(g => g.frameShare[f.id]);
      const d = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      if (d > frameDiff) { frameDiff = d; frameDiffId = f.id; }
    });
    const sims = eligible.map(g => g.meanNarrativeSimilarity);
    const simDiff = Math.max.apply(null, sims) - Math.min.apply(null, sims);
    const tops = eligible.map(g => (g.topConcepts[0] && g.topConcepts[0].id) || null);
    const sameTopConcept = tops.every(t => t === tops[0]);

    result.differences = { frameShare: frameDiff, frameId: frameDiffId, similarity: simDiff, sameTopConcept };
    result.verdict = (frameDiff < DIFF_THRESHOLDS.frameShare && simDiff < DIFF_THRESHOLDS.similarity) ? 'small' : 'some';
    return result;
  }

  return {
    MIN_GROUP_SIZE,
    DIFF_THRESHOLDS,
    AGE_GROUPS,
    AGE_NO_ANSWER,
    PRIOR_LEARNING,
    normalizeAgeGroup,
    normalizePriorLearning,
    ageLabel,
    priorLabel,
    filterByAgeGroup,
    groupCounts,
    sampleSize,
    isSampleSufficient,
    computeCompletedFlow,
    compareAgeGroups
  };
});
