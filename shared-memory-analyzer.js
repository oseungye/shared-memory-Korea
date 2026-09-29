/* ============================================================
   Shared Memory Project — shared-memory-analyzer.js
   참여자 공동 표현 분석 모듈 (공동 기억 지도 / Consensus 분석)
   ============================================================
   · 외부 API·모델 없이 브라우저(GitHub Pages)와 Node 양쪽에서 동작합니다.
   · 모든 결과는 입력된 공동 표현 텍스트(Supabase에서 불러온 값)로부터 매번 계산됩니다.
     군집 이름·비율·대표 제안을 미리 정해두지 않습니다.

   사용하는 방법
     1) 언어 판별   : 문자 체계(한글·가나·라틴 문자) 비율
     2) 토큰화      : 한국어 → nlp-analyzer.js의 규칙 기반 어간 처리
                      일본어 → 한자·가타카나 연속 구간 추출 (히라가나는 기능어로 보고 제외)
                      영어   → 소문자화 + 불용어 제거 + 간단한 접미사 정리
     3) 개념 매핑   : concept-lexicon.js (사람이 만든 다국어 개념 사전)
                      예) 침략·침공·侵略·invasion → 같은 개념
     4) 특징 벡터   : [단어] + [문자 2-gram] + [개념]을 TF-IDF로 가중한 벡터
                      → 표현이 조금 달라도(국제전쟁 / 국제적인 전쟁) 가깝게,
                        언어가 달라도 같은 개념을 쓰면 가깝게 계산됩니다.
     5) 유사도      : 코사인 유사도 (0~1)
     6) 군집화      : 평균 연결(average-linkage) 병합 군집화 + 유사도 임계값
     7) 군집 설명   : 군집 내 문서 빈도 × IDF 로 대표 키워드, 중심(medoid) 제안을 대표 제안으로
   · 문장 임베딩(딥러닝 모델)은 사용하지 않습니다. README의 "의미 유사도" 항목 참고.
   ============================================================ */

(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const NLP = isNode ? require('./nlp-analyzer.js') : root.SharedMemoryNLP;
  const Lex = isNode ? require('./concept-lexicon.js') : root.SharedMemoryConcepts;
  const api = factory(NLP, Lex);
  if (isNode) module.exports = api;
  else root.SharedMemoryAnalyzer = api;
})(typeof self !== 'undefined' ? self : this, function (NLP, Lex) {
  'use strict';

  const COUNTRIES = ['korea', 'japan', 'china'];
  const LANGS = ['ko', 'ja', 'en'];
  const FRAMES = Lex.FRAMES;
  const CONCEPTS = Lex.CONCEPTS;
  const CONCEPT_BY_ID = {};
  CONCEPTS.forEach(c => { CONCEPT_BY_ID[c.id] = c; });

  const DEFAULTS = {
    clusterThreshold: 0.24,   // 두 표현군을 합치는 최소 평균 유사도
    linkThreshold: 0.12,      // 지도에서 표현군 사이 연결선을 그리는 최소 유사도
    minClusterSize: 2,        // 이 크기 이상만 "표현군"으로 표시
    maxClusterItems: 400,     // 병합 군집화에 직접 넣는 최대 제안 수 (나머지는 가장 가까운 군집에 배정)
    topTerms: 12,
    topConcepts: 10,
    clusterKeywords: 5
  };

  // 특징 종류별 가중치: 단어 / 문자 2-gram / 개념
  const FEATURE_WEIGHT = { w: 1, g: 0.5, c: 1.5 };

  /* ---------- 0. 공통 유틸 ---------- */

  function asText(value) {
    return typeof value === 'string' ? value : (value == null ? '' : String(value));
  }

  function round(value, digits) {
    const f = Math.pow(10, digits == null ? 3 : digits);
    return Math.round(value * f) / f;
  }

  function composeNarrative(n) {
    if (n == null) return '';
    if (typeof n === 'string') return n;
    return [n.title, n.text].filter(Boolean).join('\n');
  }

  /* ---------- 1. 언어 판별 ---------- */

  /**
   * 문자 체계 비율로 언어를 판별합니다. 'ko' | 'ja' | 'en' | 'unknown'
   * 가나가 없고 한자만 있는 문장은 중국어와 구분할 수 없어 'unknown'으로 둡니다.
   */
  function detectLanguage(text) {
    const src = asText(text);
    if (!src.trim()) return 'unknown';
    const hangul = (src.match(/[가-힣]/g) || []).length;
    const kana = (src.match(/[぀-ヿ]/g) || []).length;
    const kanji = (src.match(/[一-鿿]/g) || []).length;
    const latin = (src.match(/[A-Za-z]/g) || []).length;

    const scores = {
      ko: hangul,
      ja: kana > 0 ? kana + kanji : 0,
      en: latin * 0.5            // 라틴 문자는 한 단어에 글자 수가 많아 절반으로 계산
    };
    let best = 'unknown';
    let bestScore = 0;
    LANGS.forEach(lang => {
      if (scores[lang] > bestScore) { best = lang; bestScore = scores[lang]; }
    });
    return best;
  }

  /* ---------- 2. 언어별 토큰화 ---------- */

  const EN_STOPWORDS = new Set((
    'a an the of and or to in on at by for with from as is are was were be been being this that these those it its ' +
    'which who whom whose their they them we our us i my me you your he she his her not no but also both between into ' +
    'over under after before during while than then there here so such can could would should will may might must have ' +
    'has had do does did about through want like one all each other more most very many much some any own same just ' +
    'even still only if when where how what why because since until against among across toward towards within without ' +
    'upon per via way ways think believe'
  ).split(/\s+/));

  function stemEnglish(word) {
    let w = word;
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
    return w;
  }

  function tokenizeEnglish(text) {
    const out = [];
    const re = /[A-Za-z][A-Za-z'-]*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0].toLowerCase().replace(/'s$/, '').replace(/^[-']+|[-']+$/g, '');
      if (raw.length < 3 || EN_STOPWORDS.has(raw)) continue;
      out.push(stemEnglish(raw));
    }
    return out;
  }

  // 참여자 문장에 자주 나오지만 비교에 기여하지 않는 한국어 서술어·기능어 (nlp-analyzer.js 불용어에 추가)
  const KO_EXTRA_STOPWORDS = new Set([
    '속에서', '얽힌', '오간', '전해진', '싶다', '싶은', '생각', '표현', '표현하', '것이다', '해야', '않는', '잊지',
    '기억해야', '있었던', '되었던', '모든', '서로', '우리', '이러한', '이런', '그런', '당시', '이후', '이전', '대해서'
  ]);

  const JA_SINGLE_OK = new Set(['明', '清', '唐', '倭']);

  function tokenizeJapanese(text) {
    const out = [];
    // 한자(々 포함) 연속 구간, 가타카나 연속 구간을 내용어 후보로 봅니다.
    const re = /[一-鿿々]+|[゠-ヿー]+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      let term = m[0];
      if (term.length > 2 && term.endsWith('的')) term = term.slice(0, -1);
      if (term.length < 2 && !JA_SINGLE_OK.has(term)) continue;
      out.push(term);
    }
    return out.concat(tokenizeEnglish(text));
  }

  /** 언어에 맞게 내용어 목록을 반환합니다. (중복 포함, 등장 순서) */
  function tokenizeExpression(text, lang) {
    const src = asText(text);
    if (!src.trim()) return [];
    const l = lang || detectLanguage(src);
    if (l === 'ja') return tokenizeJapanese(src);
    if (l === 'en') return tokenizeEnglish(src);
    if (l === 'ko') return NLP.tokenize(src).map(t => t.term).filter(t => !KO_EXTRA_STOPWORDS.has(t));
    // 판별 불가: 한자 구간 + 라틴 단어
    return tokenizeJapanese(src);
  }

  /* ---------- 3. 개념 사전 매칭 ---------- */

  const WORD_CHAR = /[0-9A-Za-z぀-ヿ㐀-䶿一-鿿가-힣]/;
  const LATIN_CHAR = /[A-Za-z]/;

  function isLatinForm(form) { return /^[A-Za-z]/.test(form); }

  /** 한 표현(form)이 텍스트에 나타나는 위치 목록 [[start, end], ...] */
  function findFormSpans(text, lowerText, rawForm) {
    const spans = [];
    const exact = rawForm.charAt(0) === '=';
    const form = exact ? rawForm.slice(1) : rawForm;
    if (!form) return spans;
    const latin = isLatinForm(form);
    const hay = latin ? lowerText : text;
    const needle = latin ? form.toLowerCase() : form;

    let from = 0;
    while (from <= hay.length) {
      const idx = hay.indexOf(needle, from);
      if (idx < 0) break;
      let end = idx + needle.length;
      let ok = true;
      const before = idx > 0 ? hay.charAt(idx - 1) : '';

      if (latin) {
        if (before && LATIN_CHAR.test(before)) ok = false;
        if (ok && needle.length <= 4) {
          // 짧은 영어 표현은 온전한 단어(+s/es/ed/ing)만 인정합니다. (war ≠ warm)
          const rest = hay.slice(end).match(/^(s|es|ed|ing)?(?![A-Za-z])/);
          if (rest) end += rest[0].length; else ok = false;
        } else if (ok) {
          const tail = hay.slice(end).match(/^[A-Za-z]*/);
          end += tail ? tail[0].length : 0;       // 접두어 일치 → 단어 끝까지 강조
        }
      } else if (exact) {
        const after = end < hay.length ? hay.charAt(end) : '';
        if ((before && WORD_CHAR.test(before)) || (after && WORD_CHAR.test(after))) ok = false;
      }

      if (ok) spans.push([idx, end]);
      from = idx + Math.max(1, needle.length);
    }
    return spans;
  }

  function mergeSpans(spans) {
    const sorted = spans.slice().sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const out = [];
    sorted.forEach(s => {
      const last = out[out.length - 1];
      if (last && s[0] < last[1]) last[1] = Math.max(last[1], s[1]);
      else out.push([s[0], s[1]]);
    });
    return out;
  }

  /** 여러 표현(forms)의 등장 위치를 겹침 없이 합쳐 셉니다. */
  function matchForms(text, forms) {
    const src = asText(text);
    const lower = src.toLowerCase();
    const all = [];
    const byForm = {};
    (forms || []).forEach(form => {
      const spans = findFormSpans(src, lower, form);
      if (spans.length) byForm[form.replace(/^=/, '')] = spans.length;
      spans.forEach(s => all.push(s));
    });
    const spans = mergeSpans(all);
    return { count: spans.length, spans, byForm };
  }

  function allForms(concept) {
    const f = concept.forms || {};
    return [].concat(f.ko || [], f.ja || [], f.en || []);
  }

  /**
   * 텍스트에 등장하는 개념 목록.
   * 문자 체계가 서로 겹치지 않으므로 세 언어의 표현을 모두 검사합니다(혼합 문장 대응).
   */
  function findConcepts(text) {
    const src = asText(text);
    if (!src.trim()) return [];
    const found = [];
    CONCEPTS.forEach(concept => {
      const m = matchForms(src, allForms(concept));
      if (m.count > 0) {
        found.push({
          id: concept.id, label: concept.label, frame: concept.frame,
          count: m.count, spans: m.spans, forms: Object.keys(m.byForm)
        });
      }
    });
    return found;
  }

  function conceptSpans(text, conceptId) {
    const concept = CONCEPT_BY_ID[conceptId];
    return concept ? matchForms(text, allForms(concept)).spans : [];
  }

  /* ---------- 4. 표현 프레이밍 (구 "감정 분석"의 재설계) ---------- */

  /**
   * 개념 사전의 프레임별 어휘 등장 수.
   * 역사적 가치판단이 아니라 어떤 결의 어휘가 쓰였는지를 세는 보조 지표입니다.
   */
  function frameProfile(text) {
    const concepts = findConcepts(text);
    const counts = {};
    FRAMES.forEach(f => { counts[f.id] = 0; });
    concepts.forEach(c => { counts[c.frame] += c.count; });
    const total = FRAMES.reduce((s, f) => s + counts[f.id], 0);
    let dominant = null;
    if (total > 0) {
      const sorted = FRAMES.map(f => f.id).sort((a, b) => counts[b] - counts[a]);
      if (counts[sorted[0]] > counts[sorted[1]]) dominant = sorted[0];
      else dominant = 'mixed';
    }
    return { counts, total, dominant, concepts };
  }

  /* ---------- 5. 특징 벡터 ---------- */

  const CJK_CHAR = /[㐀-䶿一-鿿가-힣゠-ヿ]/;

  /** 텍스트 → 특징 빈도 Map. 키: 'w:단어', 'g:문자2gram', 'c:개념ID' */
  function featurize(text, lang) {
    const src = asText(text);
    const l = lang || detectLanguage(src);
    const terms = tokenizeExpression(src, l);
    const feats = new Map();
    const add = (key, n) => feats.set(key, (feats.get(key) || 0) + (n || 1));

    terms.forEach(term => {
      add('w:' + term);
      if (term.length >= 2 && CJK_CHAR.test(term)) {
        for (let i = 0; i + 2 <= term.length; i++) add('g:' + term.slice(i, i + 2));
      }
    });
    const concepts = findConcepts(src);
    concepts.forEach(c => add('c:' + c.id, Math.min(c.count, 2)));
    return { features: feats, terms, concepts, lang: l };
  }

  function buildDf(featureMaps) {
    const df = new Map();
    featureMaps.forEach(f => f.forEach((_, key) => df.set(key, (df.get(key) || 0) + 1)));
    const N = featureMaps.length;
    return {
      N,
      df: key => df.get(key) || 0,
      idf: key => Math.log((1 + N) / (1 + (df.get(key) || 0))) + 1
    };
  }

  function weightVector(features, idf) {
    const vec = new Map();
    features.forEach((tf, key) => {
      vec.set(key, tf * FEATURE_WEIGHT[key.charAt(0)] * idf(key));
    });
    return vec;
  }

  function cosine(a, b) {
    return NLP.cosineSimilarity(a, b).score;
  }

  /** 두 문장의 텍스트 유사도 (0~1). 말뭉치를 주면 IDF에 반영합니다. */
  function textSimilarity(textA, textB, corpus) {
    const fa = featurize(textA).features;
    const fb = featurize(textB).features;
    const extra = (corpus || []).map(t => featurize(t).features);
    const { idf } = buildDf([fa, fb].concat(extra));
    return cosine(weightVector(fa, idf), weightVector(fb, idf));
  }

  function normalizeVec(vec) {
    let sum = 0;
    vec.forEach(v => { sum += v * v; });
    const n = Math.sqrt(sum) || 1;
    const out = new Map();
    vec.forEach((v, k) => out.set(k, v / n));
    return out;
  }

  /* ---------- 6. 공동 표현 입력 정리 ---------- */

  function cleanItems(items) {
    return (Array.isArray(items) ? items : [])
      .filter(it => it && typeof it === 'object' && asText(it.text).trim())
      .map((it, i) => {
        const text = asText(it.text).trim();
        const lang = LANGS.indexOf(it.lang) >= 0 ? it.lang : detectLanguage(text);
        return Object.assign({}, it, { id: it.id != null ? it.id : 'item-' + i, text, lang });
      });
  }

  /* ---------- 7. 군집화 (평균 연결 병합) ---------- */

  function pairwise(vectors) {
    const n = vectors.length;
    const S = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      S[i * n + i] = 1;
      for (let j = i + 1; j < n; j++) {
        const s = cosine(vectors[i], vectors[j]);
        S[i * n + j] = s;
        S[j * n + i] = s;
      }
    }
    return S;
  }

  /**
   * 평균 연결 병합 군집화. 가장 가까운 두 군집의 평균 유사도가 threshold 이상이면 합칩니다.
   * 결과는 입력 순서에만 의존하며 무작위성이 없습니다(같은 데이터 → 같은 결과).
   */
  function agglomerate(S, n, threshold) {
    const members = [];
    const active = new Uint8Array(n);
    const C = new Float64Array(S);           // 군집 간 평균 유사도 (Lance–Williams 갱신)
    for (let i = 0; i < n; i++) { members.push([i]); active[i] = 1; }

    for (;;) {
      let best = -1, bi = -1, bj = -1;
      for (let i = 0; i < n; i++) {
        if (!active[i]) continue;
        for (let j = i + 1; j < n; j++) {
          if (!active[j]) continue;
          const s = C[i * n + j];
          if (s > best) { best = s; bi = i; bj = j; }
        }
      }
      if (bi < 0 || best < threshold) break;

      const si = members[bi].length;
      const sj = members[bj].length;
      for (let k = 0; k < n; k++) {
        if (!active[k] || k === bi || k === bj) continue;
        const v = (si * C[bi * n + k] + sj * C[bj * n + k]) / (si + sj);
        C[bi * n + k] = v;
        C[k * n + bi] = v;
      }
      members[bi] = members[bi].concat(members[bj]);
      members[bj] = [];
      active[bj] = 0;
    }
    return members.filter(m => m.length > 0);
  }

  function centroidOf(vectors, idxs) {
    const c = new Map();
    idxs.forEach(i => vectors[i].forEach((v, k) => c.set(k, (c.get(k) || 0) + v / idxs.length)));
    return c;
  }

  /* ---------- 8. 공동 표현 전체 분석 ---------- */

  /**
   * 참여자 공동 표현 목록을 분석합니다.
   * @param {Array<{id, text, lang?, user?, empathy?}>} items   Supabase에서 불러온 제안
   * @param {{narratives?: {korea, japan, china}}} options      국가별 서술(IDF 말뭉치 및 비교용)
   */
  function analyzeExpressions(items, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const list = cleanItems(items);
    const narrTexts = {};
    COUNTRIES.forEach(c => { narrTexts[c] = composeNarrative(opts.narratives && opts.narratives[c]); });
    const hasNarratives = COUNTRIES.some(c => narrTexts[c].trim());

    const byLanguage = { ko: 0, ja: 0, en: 0, unknown: 0 };
    list.forEach(it => { byLanguage[byLanguage[it.lang] != null ? it.lang : 'unknown'] += 1; });

    const empty = {
      total: list.length, byLanguage, items: list, topTerms: [], topConcepts: [], clusters: [],
      unclustered: list.map((_, i) => i), links: [], similarity: { mean: 0, pairs: [] },
      framing: frameSummary([], list), narrativeLink: null,
      meta: metaOf(opts, list.length, 0, false)
    };
    if (list.length === 0) return empty;

    /* 8-1. 특징 벡터 (IDF = 공동 표현 + 국가별 서술) */
    const feats = list.map(it => featurize(it.text, it.lang));
    const narrFeats = hasNarratives ? COUNTRIES.map(c => featurize(narrTexts[c], 'ko').features) : [];
    const { idf } = buildDf(feats.map(f => f.features).concat(narrFeats));
    const vectors = feats.map(f => normalizeVec(weightVector(f.features, idf)));

    /* 8-2. 자주 등장하는 어휘·개념 (문서 빈도: 몇 개의 제안에 등장했는가) */
    const termDocs = new Map();
    const conceptDocs = new Map();
    feats.forEach((f, i) => {
      new Set(f.terms).forEach(t => {
        if (!termDocs.has(t)) termDocs.set(t, []);
        termDocs.get(t).push(i);
      });
      f.concepts.forEach(c => {
        if (!conceptDocs.has(c.id)) conceptDocs.set(c.id, []);
        conceptDocs.get(c.id).push(i);
      });
    });
    const topTerms = [...termDocs.entries()]
      .map(([term, idxs]) => ({
        term, count: idxs.length, share: idxs.length / list.length,
        langs: [...new Set(idxs.map(i => list[i].lang))]
      }))
      .sort((a, b) => b.count - a.count || b.term.length - a.term.length || (a.term < b.term ? -1 : 1))
      .slice(0, opts.topTerms);
    const topConcepts = [...conceptDocs.entries()]
      .map(([id, idxs]) => ({
        id, label: CONCEPT_BY_ID[id].label, frame: CONCEPT_BY_ID[id].frame,
        count: idxs.length, share: idxs.length / list.length,
        langs: [...new Set(idxs.map(i => list[i].lang))]
      }))
      .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1))
      .slice(0, opts.topConcepts);

    /* 8-3. 유사도 행렬 + 군집화 (많을 때는 앞쪽 maxClusterItems개로 군집을 만든 뒤 나머지를 배정) */
    const capped = list.length > opts.maxClusterItems;
    const coreN = capped ? opts.maxClusterItems : list.length;
    const S = pairwise(vectors.slice(0, coreN));
    let groups = agglomerate(S, coreN, opts.clusterThreshold);

    if (capped) {
      const cents = groups.map(g => normalizeVec(centroidOf(vectors, g)));
      const extraSingles = [];
      for (let i = coreN; i < list.length; i++) {
        let best = -1, bestG = -1;
        cents.forEach((c, gi) => {
          const s = cosine(vectors[i], c);
          if (s > best) { best = s; bestG = gi; }
        });
        if (bestG >= 0 && best >= opts.clusterThreshold) groups[bestG].push(i);
        else extraSingles.push([i]);
      }
      groups = groups.concat(extraSingles);
    }

    const sim = (i, j) => (i < coreN && j < coreN) ? S[i * coreN + j] : cosine(vectors[i], vectors[j]);

    // 가장 비슷한 제안 쌍 (최대 5개) + 평균 유사도
    const pairs = [];
    let sumSim = 0, nPairs = 0;
    for (let i = 0; i < coreN; i++) {
      for (let j = i + 1; j < coreN; j++) {
        const s = S[i * coreN + j];
        sumSim += s; nPairs += 1;
        pairs.push({ a: i, b: j, score: s });
      }
    }
    pairs.sort((x, y) => y.score - x.score);

    /* 8-4. 표현군 설명 */
    const clustersRaw = groups.filter(g => g.length >= opts.minClusterSize);
    const unclustered = groups.filter(g => g.length < opts.minClusterSize).reduce((a, g) => a.concat(g), []).sort((a, b) => a - b);

    const clusters = clustersRaw.map(g => describeCluster(g, { list, feats, vectors, idf, sim, opts }))
      .sort((a, b) => b.size - a.size || b.cohesion - a.cohesion || a.members[0] - b.members[0]);
    clusters.forEach((c, i) => { c.id = 'cluster-' + (i + 1); c.rank = i + 1; });

    /* 8-5. 표현군 사이의 관계 (지도 연결선) */
    const links = [];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const s = cosine(clusters[i].centroid, clusters[j].centroid);
        if (s >= opts.linkThreshold) links.push({ source: clusters[i].id, target: clusters[j].id, score: s });
      }
    }
    links.sort((a, b) => b.score - a.score);

    /* 8-6. 국가별 서술과의 연결 */
    const narrativeLink = hasNarratives
      ? linkToNarratives({ list, feats, vectors, idf, narrTexts, topTerms, topConcepts })
      : null;

    return {
      total: list.length,
      byLanguage,
      items: list,
      topTerms,
      topConcepts,
      clusters,
      unclustered,
      links,
      similarity: { mean: nPairs ? sumSim / nPairs : 0, pairs: pairs.slice(0, 5) },
      framing: frameSummary(feats, list),
      narrativeLink,
      meta: metaOf(opts, list.length, clusters.reduce((s, c) => s + c.size, 0), capped),
      similarityOf: (i, j) => sim(i, j)
    };
  }

  function metaOf(opts, total, clustered, capped) {
    return {
      method: 'TF-IDF(단어 + 문자 2-gram + 다국어 개념 사전) · 코사인 유사도 · 평균 연결 병합 군집화',
      clusterThreshold: opts.clusterThreshold,
      linkThreshold: opts.linkThreshold,
      minClusterSize: opts.minClusterSize,
      maxClusterItems: opts.maxClusterItems,
      total, clustered, capped
    };
  }

  function describeCluster(idxs, ctx) {
    const { list, feats, vectors, idf, sim, opts } = ctx;
    const size = idxs.length;

    // 대표 키워드: 군집 안에서 몇 개 제안에 등장했는가 × IDF
    const termDocs = new Map();
    idxs.forEach(i => new Set(feats[i].terms).forEach(t => termDocs.set(t, (termDocs.get(t) || 0) + 1)));
    const keywords = [...termDocs.entries()]
      .filter(([, n]) => size < 3 || n >= 2)
      .map(([term, n]) => ({ term, count: n, score: n * idf('w:' + term) }))
      .sort((a, b) => b.score - a.score || b.count - a.count || (a.term < b.term ? -1 : 1))
      .slice(0, opts.clusterKeywords);

    const conceptDocs = new Map();
    idxs.forEach(i => feats[i].concepts.forEach(c => conceptDocs.set(c.id, (conceptDocs.get(c.id) || 0) + 1)));
    const concepts = [...conceptDocs.entries()]
      .map(([id, n]) => ({ id, label: CONCEPT_BY_ID[id].label, frame: CONCEPT_BY_ID[id].frame, count: n, share: n / size }))
      .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));

    // 대표 제안 = 군집 안 다른 제안들과의 평균 유사도가 가장 높은 제안 (medoid)
    let medoid = idxs[0], bestAvg = -1, sumAll = 0, nAll = 0;
    idxs.forEach(i => {
      let s = 0;
      idxs.forEach(j => { if (i !== j) s += sim(i, j); });
      const avg = size > 1 ? s / (size - 1) : 1;
      sumAll += s; nAll += size - 1;
      if (avg > bestAvg) { bestAvg = avg; medoid = i; }
    });

    // 이름: 절반 이상에 나타난 개념(최대 2개), 없으면 대표 키워드
    const mainConcepts = concepts.filter(c => c.share >= 0.5).slice(0, 2).map(c => c.label);
    const nameParts = mainConcepts.length ? mainConcepts : keywords.slice(0, 2).map(k => k.term);
    const label = nameParts.length ? `‘${nameParts.join(' · ')}’ 중심 표현군` : '공통 어휘가 적은 표현군';

    const langs = {};
    idxs.forEach(i => { langs[list[i].lang] = (langs[list[i].lang] || 0) + 1; });

    const frames = {};
    FRAMES.forEach(f => { frames[f.id] = 0; });
    idxs.forEach(i => feats[i].concepts.forEach(c => { frames[c.frame] += c.count; }));

    return {
      id: null, rank: null,
      label,
      labelParts: nameParts,
      size,
      share: size / list.length,
      members: idxs.slice().sort((a, b) => a - b),
      representative: medoid,
      keywords,
      concepts,
      languages: langs,
      frames,
      cohesion: nAll ? sumAll / nAll : 1,
      centroid: normalizeVec(centroidOf(vectors, idxs))
    };
  }

  function frameSummary(feats, list) {
    const overall = {};
    const expressions = {};
    const byLanguage = {};
    FRAMES.forEach(f => { overall[f.id] = 0; expressions[f.id] = 0; });
    feats.forEach((f, i) => {
      const lang = list[i].lang;
      if (!byLanguage[lang]) {
        byLanguage[lang] = { count: 0 };
        FRAMES.forEach(fr => { byLanguage[lang][fr.id] = 0; });
      }
      byLanguage[lang].count += 1;
      const seen = new Set();
      f.concepts.forEach(c => {
        overall[c.frame] += c.count;
        byLanguage[lang][c.frame] += c.count;
        seen.add(c.frame);
      });
      seen.forEach(fr => { expressions[fr] += 1; });
    });
    const totalHits = FRAMES.reduce((s, f) => s + overall[f.id], 0);
    const noHit = feats.filter(f => f.concepts.length === 0).length;
    return { overall, expressions, byLanguage, totalHits, noHit };
  }

  /* ---------- 9. 국가별 서술 ↔ 참여자 공동 표현 ---------- */

  function linkToNarratives(ctx) {
    const { list, feats, vectors, idf, narrTexts, topTerms, topConcepts } = ctx;
    const narrTermSets = {};
    const narrVecs = {};
    const narrConcepts = {};
    COUNTRIES.forEach(c => {
      const f = featurize(narrTexts[c], 'ko');
      narrTermSets[c] = new Set(f.terms);
      narrVecs[c] = normalizeVec(weightVector(f.features, idf));
      narrConcepts[c] = {};
      f.concepts.forEach(x => { narrConcepts[c][x.id] = x.count; });
    });

    const originOf = present => (present.length === 3 ? 'common' : present.length === 0 ? 'new' : 'partial');

    const terms = topTerms.map(t => {
      const present = COUNTRIES.filter(c => narrTermSets[c].has(t.term) ||
        (!/[가-힣]/.test(t.term) && narrTexts[c].indexOf(t.term) >= 0));
      return Object.assign({}, t, { presentIn: present, origin: originOf(present) });
    });
    const concepts = topConcepts.map(t => {
      const counts = {};
      COUNTRIES.forEach(c => { counts[c] = narrConcepts[c][t.id] || 0; });
      const present = COUNTRIES.filter(c => counts[c] > 0);
      return Object.assign({}, t, { narrativeCounts: counts, presentIn: present, origin: originOf(present) });
    });

    const summary = { common: 0, partial: 0, new: 0 };
    terms.forEach(t => { summary[t.origin] += 1; });

    const averageSimilarity = {};
    COUNTRIES.forEach(c => {
      const s = vectors.reduce((acc, v) => acc + cosine(v, narrVecs[c]), 0);
      averageSimilarity[c] = list.length ? s / list.length : 0;
    });

    return { terms, concepts, summary, averageSimilarity };
  }

  /* ---------- 10. 작성 중 실시간 분석 ---------- */

  /**
   * 작성 중인 표현을 분석할 문맥을 미리 만들어 둡니다. (입력할 때마다 기존 제안을 다시 처리하지 않도록)
   * @param {{narratives, existing, candidates, eventKeywords}} ctx
   */
  function createDraftContext(ctx) {
    const c = ctx || {};
    const narrTexts = {};
    COUNTRIES.forEach(k => { narrTexts[k] = composeNarrative(c.narratives && c.narratives[k]); });
    const narrFeats = {};
    COUNTRIES.forEach(k => { narrFeats[k] = featurize(narrTexts[k], 'ko').features; });
    const existing = cleanItems(c.existing);
    const existingFeats = existing.map(it => featurize(it.text, it.lang).features);
    const baseMaps = COUNTRIES.map(k => narrFeats[k]).concat(existingFeats);
    const baseDf = new Map();
    baseMaps.forEach(f => f.forEach((_, key) => baseDf.set(key, (baseDf.get(key) || 0) + 1)));
    const N = baseMaps.length + 1;

    function idfWith(draftFeatures) {
      return key => {
        const df = (baseDf.get(key) || 0) + (draftFeatures.has(key) ? 1 : 0);
        return Math.log((1 + N) / (1 + df)) + 1;
      };
    }

    function analyze(text, extra) {
      const opt = extra || {};
      const src = asText(text).trim();
      const lang = detectLanguage(src);
      const f = featurize(src, lang);
      const idf = idfWith(f.features);
      const vec = weightVector(f.features, idf);
      const conceptIds = new Set(f.concepts.map(x => x.id));
      const termSet = new Set(f.terms);

      const selected = (opt.selected || []).map(cand => ({
        label: cand.label,
        included: includesCandidate(cand, src, termSet, conceptIds)
      }));
      const keywords = (c.eventKeywords || []).map(term => ({
        term, included: termSet.has(term) || (src && src.indexOf(term) >= 0)
      }));

      const narrativeSimilarity = {};
      COUNTRIES.forEach(k => { narrativeSimilarity[k] = src ? cosine(vec, weightVector(narrFeats[k], idf)) : 0; });

      const similarExisting = src
        ? existing.map((it, i) => ({ item: it, score: cosine(vec, weightVector(existingFeats[i], idf)) }))
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
        : [];

      const before = asText(opt.before).trim();
      return {
        text: src,
        lang,
        chars: src.length,
        tokens: f.terms.length,
        terms: f.terms,
        concepts: f.concepts,
        frames: frameProfile(src),
        selected,
        keywords,
        narrativeSimilarity,
        similarExisting,
        existingCount: existing.length,
        beforeAfter: before && src ? compareBeforeAfter(before, src, { narratives: c.narratives }) : null
      };
    }

    return { analyze, existingCount: existing.length };
  }

  function includesCandidate(cand, text, termSet, conceptIds) {
    if (!cand) return false;
    if (cand.conceptId) return conceptIds.has(cand.conceptId);
    const term = cand.term || cand.label;
    return termSet.has(term) || (!!text && text.indexOf(term) >= 0);
  }

  /* ---------- 11. 탐구 전 / 탐구 후 비교 ---------- */

  /**
   * BEFORE(서술을 읽기 전) / AFTER(읽은 뒤) 표현을 비교합니다.
   * @returns {{added, removed, kept, addedConcepts, removedConcepts, keptConcepts, similarity, narrativeShift}|null}
   */
  function compareBeforeAfter(before, after, options) {
    const b = asText(before).trim();
    const a = asText(after).trim();
    if (!b || !a) return null;
    const fb = featurize(b);
    const fa = featurize(a);
    const narrTexts = {};
    COUNTRIES.forEach(c => { narrTexts[c] = composeNarrative(options && options.narratives && options.narratives[c]); });
    const narrFeats = COUNTRIES.filter(c => narrTexts[c].trim()).map(c => ({ c, f: featurize(narrTexts[c], 'ko').features }));
    const { idf } = buildDf([fb.features, fa.features].concat(narrFeats.map(x => x.f)));
    const vb = weightVector(fb.features, idf);
    const va = weightVector(fa.features, idf);

    const setB = new Set(fb.terms);
    const setA = new Set(fa.terms);
    const cB = new Set(fb.concepts.map(c => c.id));
    const cA = new Set(fa.concepts.map(c => c.id));
    const label = id => CONCEPT_BY_ID[id].label;

    const narrativeShift = {};
    narrFeats.forEach(({ c, f }) => {
      const vn = weightVector(f, idf);
      const s0 = cosine(vb, vn);
      const s1 = cosine(va, vn);
      narrativeShift[c] = { before: s0, after: s1, delta: s1 - s0 };
    });

    return {
      added: [...setA].filter(t => !setB.has(t)),
      removed: [...setB].filter(t => !setA.has(t)),
      kept: [...setA].filter(t => setB.has(t)),
      addedConcepts: [...cA].filter(id => !cB.has(id)).map(label),
      removedConcepts: [...cB].filter(id => !cA.has(id)).map(label),
      keptConcepts: [...cA].filter(id => cB.has(id)).map(label),
      similarity: cosine(vb, va),
      narrativeShift
    };
  }

  /** 탐구 전 표현이 함께 저장된 제안들의 변화를 모아서 요약합니다. */
  function aggregateBeforeAfter(items, options) {
    const pairs = (Array.isArray(items) ? items : [])
      .filter(it => it && asText(it.before).trim() && asText(it.text).trim());
    if (!pairs.length) return { count: 0 };
    const tally = (map, arr) => arr.forEach(x => map.set(x, (map.get(x) || 0) + 1));
    const added = new Map(), removed = new Map(), kept = new Map(), addedTerms = new Map();
    const shift = {};
    COUNTRIES.forEach(c => { shift[c] = { before: 0, after: 0 }; });
    let simSum = 0;
    pairs.forEach(it => {
      const r = compareBeforeAfter(it.before, it.text, options);
      simSum += r.similarity;
      tally(added, r.addedConcepts);
      tally(removed, r.removedConcepts);
      tally(kept, r.keptConcepts);
      tally(addedTerms, r.added);
      Object.keys(r.narrativeShift).forEach(c => {
        shift[c].before += r.narrativeShift[c].before;
        shift[c].after += r.narrativeShift[c].after;
      });
    });
    const top = m => [...m.entries()].map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1)).slice(0, 8);
    COUNTRIES.forEach(c => {
      shift[c].before /= pairs.length;
      shift[c].after /= pairs.length;
      shift[c].delta = shift[c].after - shift[c].before;
    });
    return {
      count: pairs.length,
      meanSimilarity: simSum / pairs.length,
      addedConcepts: top(added),
      removedConcepts: top(removed),
      keptConcepts: top(kept),
      addedTerms: top(addedTerms),
      narrativeShift: shift
    };
  }

  /* ---------- 12. 국가별 서술 강조점 비교 / 키워드 차트 ---------- */

  /**
   * 개념 사전 기준으로 국가별 서술이 어떤 요소를 얼마나 언급하는지 비교합니다.
   * level(0~3)은 서술 길이(어휘 토큰 수)로 나눈 밀도를 세 국가 중 최댓값 기준으로 환산한 값입니다.
   */
  function emphasisProfile(narratives) {
    const texts = {};
    const lengths = {};
    COUNTRIES.forEach(c => {
      texts[c] = composeNarrative(narratives && narratives[c]);
      lengths[c] = Math.max(1, NLP.tokenize(texts[c]).length);
    });
    const rows = [];
    CONCEPTS.forEach(concept => {
      const counts = {}, spans = {}, density = {};
      COUNTRIES.forEach(c => {
        const m = matchForms(texts[c], concept.forms.ko || []);
        counts[c] = m.count;
        spans[c] = m.spans;
        density[c] = m.count / lengths[c];
      });
      const total = COUNTRIES.reduce((s, c) => s + counts[c], 0);
      if (!total) return;
      const max = Math.max.apply(null, COUNTRIES.map(c => density[c]));
      const levels = {};
      COUNTRIES.forEach(c => {
        levels[c] = counts[c] === 0 ? 0 : Math.max(1, Math.round(3 * density[c] / max));
      });
      const present = COUNTRIES.filter(c => counts[c] > 0).length;
      rows.push({ id: concept.id, label: concept.label, frame: concept.frame, counts, density, levels, spans, total, present });
    });
    // 국가 간 차이가 큰 개념을 먼저 보여줍니다 (한 국가만 언급 → 여러 국가 언급 순).
    rows.sort((a, b) => a.present - b.present || b.total - a.total || (a.id < b.id ? -1 : 1));
    return { rows, lengths };
  }

  /**
   * events-data.js의 keywordGroups(사람이 정한 표현 묶음)를 서술 원문에서 실제로 세어 차트 값을 만듭니다.
   * @returns {Array<{label, forms, counts, byForm, spans}>}
   */
  function keywordGroupCounts(event) {
    const groups = (event && event.keywordGroups) || {};
    return Object.keys(groups).map(label => {
      const forms = groups[label];
      const counts = {}, byForm = {}, spans = {};
      COUNTRIES.forEach(c => {
        const m = matchForms(composeNarrative(event[c]), forms);
        counts[c] = m.count;
        byForm[c] = m.byForm;
        spans[c] = m.spans;
      });
      return { label, forms: forms.slice(), counts, byForm, spans };
    });
  }

  /* ---------- 13. 작성 가이드: 후보 핵심 요소 ---------- */

  const GENERAL_CONCEPTS = ['responsibility', 'damage', 'memory', 'dialogue', 'peace', 'shared'];

  /**
   * 선택한 사건의 서술 텍스트와 NLP 결과로부터 "표현에 담을 핵심 요소" 후보를 만듭니다.
   * @param {object} event          events-data.js의 사건
   * @param {object} nlpAnalysis    nlp-analyzer.js analyzeEventData 결과 (없으면 개념만 사용)
   */
  function candidateElements(event, nlpAnalysis, options) {
    const opt = Object.assign({ concepts: 7, terms: 6 }, options || {});
    const narr = {};
    COUNTRIES.forEach(c => { narr[c] = event && event[c]; });
    const profile = emphasisProfile(narr).rows.slice()
      .sort((a, b) => b.present - a.present || b.total - a.total || (a.id < b.id ? -1 : 1));

    const used = new Set();
    const concepts = profile.slice(0, opt.concepts).map(r => {
      used.add(r.label);
      return { kind: 'concept', conceptId: r.id, label: r.label, source: 'narratives', presentIn: COUNTRIES.filter(c => r.counts[c] > 0) };
    });

    const conceptForms = new Set();
    concepts.forEach(c => (CONCEPT_BY_ID[c.conceptId].forms.ko || []).forEach(f => conceptForms.add(f.replace(/^=/, ''))));
    const covered = term => used.has(term) || conceptForms.has(term);

    const terms = [];
    const pushTerm = (term, source) => {
      if (!term || term.indexOf(' ') >= 0 || /[0-9]/.test(term) || covered(term) || terms.some(t => t.label === term)) return;
      terms.push({ kind: 'term', term, label: term, source });
    };
    if (nlpAnalysis) {
      (nlpAnalysis.common || []).forEach(e => pushTerm(e.term, 'common'));
      COUNTRIES.forEach(c => ((nlpAnalysis.distinctive || {})[c] || []).slice(0, 2).forEach(d => pushTerm(d.term, c)));
    }

    const general = GENERAL_CONCEPTS
      .filter(id => !concepts.some(c => c.conceptId === id))
      .map(id => ({ kind: 'concept', conceptId: id, label: CONCEPT_BY_ID[id].label, source: 'general' }));

    return { concepts, terms: terms.slice(0, opt.terms), general };
  }

  /* ---------- 14. 공감 ↔ 표현군 비교 ---------- */

  /**
   * 가장 많이 공감받은 제안과 가장 큰 표현군을 비교합니다.
   * @param {object} analysis   analyzeExpressions 결과
   * @param {Object<string|number, number>} counts   제안 id → 공감 수
   */
  function compareEmpathy(analysis, counts) {
    if (!analysis || !analysis.items.length) return null;
    const c = counts || {};
    const clusterOf = {};
    analysis.clusters.forEach(cl => cl.members.forEach(i => { clusterOf[i] = cl.id; }));
    const ranked = analysis.items
      .map((it, i) => ({ index: i, item: it, count: Number(c[it.id]) || 0, clusterId: clusterOf[i] || null }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count || a.index - b.index);
    const largest = analysis.clusters[0] || null;
    const top = ranked.slice(0, 3);
    return {
      totalEmpathy: ranked.reduce((s, x) => s + x.count, 0),
      top,
      largestClusterId: largest ? largest.id : null,
      topInLargest: !!(largest && top.length && top[0].clusterId === largest.id)
    };
  }

  return {
    COUNTRIES,
    LANGS,
    FRAMES,
    CONCEPTS,
    DEFAULTS,
    detectLanguage,
    tokenizeExpression,
    findConcepts,
    conceptSpans,
    matchForms,
    frameProfile,
    featurize,
    textSimilarity,
    analyzeExpressions,
    createDraftContext,
    compareBeforeAfter,
    aggregateBeforeAfter,
    emphasisProfile,
    keywordGroupCounts,
    candidateElements,
    compareEmpathy
  };
});
