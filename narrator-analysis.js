/* ============================================================
   Shared Memory Project — narrator-analysis.js
   '네 번째 서술자'와 '기억의 빈자리' 계산 (브라우저 · Node 공용, DOM 없음)
   ============================================================
   · 서술자 = 세 나라 요약 서술(korea · japan · china) + AI 답변(질문한 언어별: ai-ko · ai-ja · ai-zh)
     AI 답변은 기록(ai-narratives-data.js)이 있는 언어만 서술자로 들어갑니다. 기록이 없으면 세 나라만 비교합니다.
   · 요소 = 사건별 확인 요소(fourth-narrator-data.js의 focus) + 다국어 개념 사전(concept-lexicon.js)의 개념
     표현은 shared-memory-analyzer.js의 matchForms·findConcepts로 찾습니다 (공동 표현 분석과 같은 규칙).
   · AI는 같은 질문을 여러 번 묻습니다. 한 요소가 '있다'는 것은 묻은 횟수의 절반 이상에서 나왔다는 뜻이며,
     화면에는 "3회 중 2회"처럼 실제 횟수를 함께 보여줍니다.
   · 기억의 빈자리 = 다른 서술자 다수에게는 있는데 이 서술자에게는 없는 요소.
     기준: 이 서술자에게 없고, 다른 서술자 중 max(2, 절반 이상)에게 있음.
     "덜 언급했다 = 왜곡"이 아니며, 개념 사전에 없는 표현·부정문·문맥은 구분하지 못합니다.
   · 결과를 미리 정해 두지 않습니다. 같은 입력이면 항상 같은 결과가 나옵니다.
   ============================================================ */

(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const Analyzer = isNode ? require('./shared-memory-analyzer.js') : root.SharedMemoryAnalyzer;
  const api = factory(Analyzer);
  if (isNode) module.exports = api;
  else root.NarratorAnalysis = api;
})(typeof self !== 'undefined' ? self : this, function (Analyzer) {
  'use strict';

  const NATIONS = [
    { key: 'korea', label: '한국 측 요약' },
    { key: 'japan', label: '일본 측 요약' },
    { key: 'china', label: '중국 측 요약' }
  ];
  /** AI에게 물은 언어 (화면 순서) */
  const AI_LANGS = ['ko', 'ja', 'zh'];
  const AI_LANG_LABEL = { ko: '한국어', ja: '일본어', zh: '중국어' };

  function narrativeText(n) {
    if (!n) return '';
    return [n.title, n.text].filter(Boolean).join('\n');
  }

  /** 한 사건의 AI 기록을 언어별로 묶습니다 (run 오름차순). */
  function recordsByLang(records, eventId) {
    const out = {};
    AI_LANGS.forEach(l => { out[l] = []; });
    (records || []).forEach(r => {
      if (r && r.eventId === eventId && out[r.lang]) out[r.lang].push(r);
    });
    AI_LANGS.forEach(l => out[l].sort((a, b) => (a.run || 0) - (b.run || 0)));
    return out;
  }

  /**
   * 기록 한 건의 형식 검사. 문제가 없으면 빈 배열.
   * 답변을 고치지 않았는지는 알 수 없지만, 질문이 바뀌거나 필수 정보가 빠진 기록은 걸러냅니다.
   */
  function validateRecord(rec, questions) {
    const problems = [];
    if (!rec || typeof rec !== 'object') return ['기록이 객체가 아님'];
    if (!rec.eventId || !questions || !questions[rec.eventId]) problems.push('알 수 없는 사건 id');
    if (AI_LANGS.indexOf(rec.lang) < 0) problems.push('지원하지 않는 언어');
    if (!(Number.isInteger(rec.run) && rec.run >= 1)) problems.push('run은 1 이상의 정수');
    const q = questions && questions[rec.eventId] && questions[rec.eventId][rec.lang];
    if (q && rec.prompt !== q) problems.push('질문 원문이 fourth-narrator-data.js와 다름');
    if (typeof rec.answer !== 'string' || !rec.answer.trim()) problems.push('답변 없음');
    if (!rec.model) problems.push('모델 없음');
    if (!rec.collectedAt || isNaN(Date.parse(rec.collectedAt))) problems.push('수집 시각 없음');
    if (rec.lang !== 'ko' && rec.translationKo != null && typeof rec.translationKo !== 'string') problems.push('참고 번역 형식');
    return problems;
  }

  /**
   * 서술자 목록. 세 나라는 항상, AI는 기록이 있는 언어만.
   * texts: 서술자의 글 (세 나라 1개, AI는 물은 횟수만큼)
   */
  function buildNarrators(event, records) {
    const list = NATIONS.map(n => ({
      key: n.key, kind: 'nation', label: n.label,
      texts: [narrativeText(event && event[n.key])]
    }));
    if (!event) return list;
    const byLang = recordsByLang(records, event.id);
    AI_LANGS.forEach(lang => {
      const recs = byLang[lang];
      if (!recs.length) return;
      list.push({
        key: 'ai-' + lang, kind: 'ai', lang,
        label: `AI · ${AI_LANG_LABEL[lang]}로 물었을 때`,
        texts: recs.map(r => r.answer),
        records: recs
      });
    });
    return list;
  }

  /** forms 목록이 서술자의 글 몇 개에 나오는지 */
  function presenceOf(narrator, forms) {
    let hits = 0;
    const found = {};
    narrator.texts.forEach(t => {
      const m = Analyzer.matchForms(t, forms);
      if (m.count > 0) {
        hits++;
        Object.keys(m.byForm).forEach(f => { found[f] = true; });
      }
    });
    const runs = narrator.texts.length;
    return { hits, runs, present: runs > 0 && hits * 2 >= runs, forms: Object.keys(found) };
  }

  /** 개념의 표현 + 이 화면에서만 더 찾는 표기(data.conceptExtraForms) */
  function conceptForms(concept, data) {
    const f = concept.forms || {};
    const extra = (data && data.conceptExtraForms && data.conceptExtraForms[concept.id]) || [];
    return ['ko', 'zh', 'ja', 'en'].reduce((acc, l) => acc.concat(f[l] || []), []).concat(extra);
  }

  /** 글 하나에서 가장 먼저 나온 이름의 id (없으면 null) */
  function firstNameIn(text, names) {
    let best = null;
    let at = Infinity;
    names.forEach(name => {
      const m = Analyzer.matchForms(text, name.forms);
      m.spans.forEach(sp => { if (sp[0] < at) { at = sp[0]; best = name.id; } });
    });
    return best;
  }

  /**
   * 서술자별로 어떤 사건 이름이 나왔는지.
   * · hits  : 이름이 나온 글 수 (다른 나라의 이름을 소개한 경우도 포함)
   * · first : 그 이름이 글에서 가장 먼저 나온 이름이었던 횟수 — 답변이 스스로 앞세운 이름
   */
  function nameUsage(event, narrators, data) {
    const names = (data && data.names && event && data.names[event.id]) || [];
    const out = {};
    narrators.forEach(n => {
      const first = {};
      n.texts.forEach(t => {
        const id = firstNameIn(t, names);
        if (id) first[id] = (first[id] || 0) + 1;
      });
      out[n.key] = names
        .map(name => Object.assign({ id: name.id, label: name.label, first: first[name.id] || 0 }, presenceOf(n, name.forms)))
        .filter(x => x.hits > 0);
    });
    return { names, byNarrator: out };
  }

  /**
   * 요소 × 서술자 표.
   * 요소: 사건별 확인 요소(focus) 전부 + 서술자 중 한 명이라도 쓴 개념.
   * 정렬: focus(편집자 순서) → 개념(쓴 서술자 수가 많은 순, 같으면 사전 순서).
   */
  function elementRows(event, narrators, data) {
    const focus = (data && data.focus && event && data.focus[event.id]) || [];
    const rows = [];
    focus.forEach(el => {
      const cells = {};
      narrators.forEach(n => { cells[n.key] = presenceOf(n, el.forms); });
      rows.push({ id: 'focus:' + el.id, label: el.label, kind: 'focus', forms: el.forms, cells });
    });
    const conceptRows = [];
    Analyzer.CONCEPTS.forEach((concept, order) => {
      const forms = conceptForms(concept, data);
      const cells = {};
      let anyHit = false;
      narrators.forEach(n => {
        cells[n.key] = presenceOf(n, forms);
        if (cells[n.key].hits > 0) anyHit = true;
      });
      if (anyHit) conceptRows.push({ id: 'concept:' + concept.id, label: concept.label, kind: 'concept', frame: concept.frame, forms, cells, order });
    });
    const presentCount = r => Object.keys(r.cells).filter(k => r.cells[k].present).length;
    conceptRows.sort((a, b) => presentCount(b) - presentCount(a) || a.order - b.order);
    return rows.concat(conceptRows);
  }

  /** 빈자리 표시: 각 셀에 gap(boolean), 각 행에 gapKeys */
  function markGaps(rows, narrators) {
    const keys = narrators.map(n => n.key);
    rows.forEach(row => {
      row.gapKeys = [];
      row.presentKeys = keys.filter(k => row.cells[k].present);
      keys.forEach(k => {
        const others = keys.filter(o => o !== k);
        const presentOthers = others.filter(o => row.cells[o].present).length;
        const need = Math.max(2, Math.ceil(others.length / 2));
        const gap = !row.cells[k].present && others.length >= 2 && presentOthers >= need;
        row.cells[k].gap = gap;
        if (gap) row.gapKeys.push(k);
      });
    });
    return rows;
  }

  /**
   * 화면용 한 번에 계산.
   * keyGaps: 편집자가 고른 핵심 빈자리 (계산상 빈자리가 아니어도 그대로 보여주지 않고, 계산 결과와 맞을 때만 강조)
   */
  function analyzeEvent(event, records, data) {
    const narrators = buildNarrators(event, records);
    const rows = markGaps(elementRows(event, narrators, data), narrators);
    const names = nameUsage(event, narrators, data);
    const label = {};
    narrators.forEach(n => { label[n.key] = n.label; });
    const gaps = [];
    rows.forEach(row => {
      row.gapKeys.forEach(k => gaps.push({ rowId: row.id, element: row.label, kind: row.kind, narrator: k, narratorLabel: label[k], presentIn: row.presentKeys.length }));
    });
    // 사건별 확인 요소의 빈자리를 먼저, 그다음 많은 서술자가 쓴 요소의 빈자리
    gaps.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'focus' ? -1 : 1) || b.presentIn - a.presentIn);
    const editorial = ((data && data.keyGaps && event && data.keyGaps[event.id]) || [])
      .filter(g => gaps.some(x => x.rowId === g.element && x.narrator === g.narrator));
    return {
      narrators,
      rows,
      names,
      gaps,
      keyGaps: editorial,
      hasAi: narrators.some(n => n.kind === 'ai')
    };
  }

  /**
   * 다섯 번째 서술자: 참여자의 문장을 빈자리 표에 한 줄로 넣어 봅니다.
   * · filled: 어떤 서술자에게는 빈자리였던 요소를 참여자 문장이 담은 경우 (missingIn = 그 서술자 key 목록)
   * · fresh : 비교한 서술자 누구에게도 없던 요소를 참여자 문장이 쓴 경우
   * 평가가 아니라 관찰입니다. 개념 사전·사건별 확인 요소에 있는 표현만 찾습니다.
   * @param {object} result  analyzeEvent의 결과
   * @param {string} text    참여자의 탐구 후 문장
   */
  function placeSentence(result, text) {
    const empty = { filled: [], fresh: [] };
    if (!result || typeof text !== 'string' || !text.trim()) return empty;
    const me = { key: 'me', texts: [text] };
    const filled = [];
    const fresh = [];
    const seen = {};
    result.rows.forEach(row => {
      seen[row.id] = true;
      const p = presenceOf(me, row.forms || []);
      if (!p.hits) return;
      if (row.gapKeys.length) filled.push({ id: row.id, label: row.label, kind: row.kind, missingIn: row.gapKeys.slice(), forms: p.forms });
      else if (!row.presentKeys.length) fresh.push({ id: row.id, label: row.label, kind: row.kind, forms: p.forms });
    });
    Analyzer.findConcepts(text).forEach(c => {
      const id = 'concept:' + c.id;
      if (!seen[id]) fresh.push({ id, label: c.label, kind: 'concept', forms: c.forms });
    });
    return { filled, fresh };
  }

  return {
    NATIONS,
    AI_LANGS,
    AI_LANG_LABEL,
    narrativeText,
    recordsByLang,
    validateRecord,
    buildNarrators,
    presenceOf,
    firstNameIn,
    nameUsage,
    elementRows,
    markGaps,
    analyzeEvent,
    placeSentence
  };
});
