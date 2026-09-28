/* ============================================================
   Shared Memory Project — nlp-analyzer.js
   국가별 역사 서술 비교 분석 모듈 (AI/NLP)
   ============================================================
   · 외부 API 없이 브라우저(GitHub Pages)와 Node 양쪽에서 동작합니다.
   · 분석 결과는 하드코딩되지 않으며, 입력된 서술 텍스트에서 매번 계산됩니다.

   사용하는 방법
     1) 토큰화   : 규칙 기반 한국어 경량 어간 처리 (조사·어미 제거 + 불용어 제거)
     2) 핵심 키워드 : TF-IDF  (IDF는 사이트 전체 서술을 말뭉치로 사용)
     3) 공통 표현   : 세 국가 서술에 모두 등장하는 어휘 (+ 두 국가만 공유하는 어휘)
     4) 특징적 표현 : 평활화된 상대 빈도 비율 (log2 ratio, 가산 평활 α)
     5) 텍스트 유사도: TF-IDF 코사인 유사도 (주지표) + Jaccard 유사도 (보조지표)
     6) 설명 가능성 : 모든 결과에 등장 횟수·가중치·원문 위치(offset)를 함께 반환
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SharedMemoryNLP = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COUNTRIES = ['korea', 'japan', 'china'];
  const PAIRS = [['korea', 'japan'], ['korea', 'china'], ['japan', 'china']];

  /* ---------- 1. 한국어 경량 전처리 사전 ---------- */

  // 명사 뒤에 붙는 조사 (길이가 긴 것부터 검사)
  const JOSA = [
    '으로부터', '에서부터', '로부터', '에게서', '으로써', '으로서', '에서는', '에서도', '에서의',
    '에게는', '으로도', '에도', '이라는', '이라고', '으로는', '에서', '에게', '한테', '으로', '까지', '부터', '마저',
    '조차', '처럼', '보다', '라는', '라고', '이나', '과는', '와는', '과의', '와의', '에는', '로는',
    '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '로', '만'
  ];

  // 서술어 어미·접사 (예: 희생되었다 → 희생, 침공한 → 침공, 문화적인 → 문화)
  const ENDINGS = [
    '이었으나', '되었으며', '하였으며', '되었으나', '하였으나', '이었으며', '였으나', '었으나',
    '되었다', '하였다', '되었고',
    '하였고', '했으며', '했으나', '이었다', '적으로', '적이다', '되어', '하여', '했다', '했고',
    '된다', '한다', '되는', '하는', '하고', '되고', '였다', '이다', '이며', '으며', '적인',
    '로운', '지만', '되며', '하며', '하기', '하게', '시킨', '시켜', '받고', '받아',
    '한', '된', '할', '될', '적'
  ];

  const SUFFIXES = JOSA.concat(ENDINGS).sort((a, b) => b.length - a.length);
  const SECOND_PASS = ['하기', '하게', '들', '적'];   // 예) 수용하기도 → 수용하기 → 수용

  // 잘라낸 뒤 한 글자만 남아도 되는 접미사 (예: 길을 → 길, 응하여 → 응 → 이후 한 글자라 제외)
  // '가·도·과·로' 등은 국가·제도·결과·경로처럼 명사의 일부인 경우가 많아 제외합니다.
  const ONE_CHAR_STEM_OK = new Set(['을', '를', '은', '는', '의', '에', '에서', '에는', '하여', '하고', '했다', '하였다', '한다', '하는']);

  // 한 글자지만 의미가 분명한 역사 용어 (왜·명·청·당)
  const SINGLE_SYLLABLE_TERMS = new Set(['왜', '명', '청', '당']);

  // 끝 글자가 조사처럼 보여도 잘라내면 안 되는 단어
  const PROTECTED = new Set([
    '한반도', '울릉도', '제주도', '불교도', '전문가', '정치가', '사상가', '혁명가', '예술가',
    '히데요시', '도요토미', '히바쿠샤', '이순신', '감합무역', '바다', '마을', '가을'
  ]);

  // 어간 처리 후에도 남는 서술어(동사·형용사) 활용형을 걸러내는 끝말
  const PREDICATE_ENDINGS = ['다', '으나', '으며', '면서', '지만', '어서', '아서', '여서', '았', '었', '였'];

  // 의미 비교에 기여하지 않는 기능어
  const STOPWORDS = new Set([
    '그', '이', '저', '것', '수', '등', '및', '또는', '그리고', '하지만', '그러나', '또한', '위해',
    '위한', '통해', '대한', '대해', '의해', '있다', '있었다', '있으며', '있으나', '있는', '없다',
    '하다', '되다', '했다', '하였다', '되었다', '된다', '한다', '이다', '였다', '이었다', '하는',
    '되는', '같은', '모두', '매우', '더', '가장', '중', '때', '후', '동시', '결국', '단순',
    '수많은', '많은', '여러', '다양', '각각', '각자', '자체', '사실상', '특히', '함께', '다시',
    '보다', '에서', '경향', '가리킨다', '가리키', '나타난다', '보여준다', '보여주', '이해된다',
    '이해되', '연결되', '연결된다', '설명', '관점', '시각', '서술', '하나', '차례',
    // 자주 쓰이는 서술어 활용형
    '수많', '맞선', '삼아', '보내', '도와', '들여온', '이르', '따라', '따른', '통한', '관한',
    '아닌', '아니라', '남아', '남긴', '겹친', '벗어난', '받아들여', '받아들인', '빠르게'
  ]);

  const TOKEN_PATTERN = '[0-9A-Za-z\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uac00-\\ud7a3]+';
  const HANGUL = /[가-힣]/;

  function stripOnce(word, suffixes) {
    for (const suf of suffixes) {
      if (word.length > suf.length && word.endsWith(suf)) {
        const stem = word.slice(0, -suf.length);
        if (stem.length >= 2 || SINGLE_SYLLABLE_TERMS.has(stem) || ONE_CHAR_STEM_OK.has(suf)) return stem;
      }
    }
    return null;
  }

  /** 어절 하나를 비교 가능한 기본형으로 바꿉니다. 예) "일본군을" → "일본군" */
  function normalizeToken(raw) {
    let word = String(raw).toLowerCase();
    if (!HANGUL.test(word) || PROTECTED.has(word)) return word;

    const first = stripOnce(word, SUFFIXES);
    if (first) word = first;
    if (!PROTECTED.has(word)) {
      const second = stripOnce(word, SECOND_PASS);
      if (second) word = second;
    }
    return word;
  }

  function isContentTerm(term) {
    if (!term || STOPWORDS.has(term)) return false;
    if (/^[0-9]+$/.test(term)) return term.length >= 3;          // 연도(1592 등)만 유지
    if (term.length < 2) return SINGLE_SYLLABLE_TERMS.has(term);
    if (HANGUL.test(term) && !PROTECTED.has(term) &&
        PREDICATE_ENDINGS.some(e => term.length > e.length && term.endsWith(e))) return false;
    return true;
  }

  /**
   * 텍스트를 내용어 토큰 배열로 변환합니다.
   * 각 토큰은 원문 위치(start/end)를 기억하므로 결과의 근거를 원문에서 표시할 수 있습니다.
   * joinsPrev: 바로 앞 토큰과 같은 줄의 공백만으로 이어져 있으면 true (2어절 표현 추출에 사용)
   */
  function tokenize(text) {
    const src = String(text || '');
    const re = new RegExp(TOKEN_PATTERN, 'g');
    const tokens = [];
    let lastEnd = -1;
    let chainOpen = false;
    let m;

    while ((m = re.exec(src)) !== null) {
      const surface = m[0];
      const start = m.index;
      const end = start + surface.length;
      const gap = lastEnd < 0 ? '' : src.slice(lastEnd, start);
      const adjacent = chainOpen && /^[ \t\u00a0]+$/.test(gap);   // 줄바꿈(제목↔본문)은 잇지 않음
      lastEnd = end;

      const term = normalizeToken(surface);
      if (!isContentTerm(term)) {
        chainOpen = false;
        continue;
      }
      tokens.push({ term, surface, start, end, joinsPrev: adjacent });
      chainOpen = true;
    }
    return tokens;
  }

  /* ---------- 2. 문서 표현 ---------- */

  function composeText(narrative) {
    if (narrative == null) return '';
    if (typeof narrative === 'string') return narrative;
    return [narrative.title, narrative.text].filter(Boolean).join('\n');
  }

  function addOccurrence(map, term, span) {
    if (!map.has(term)) map.set(term, []);
    map.get(term).push(span);
  }

  /** 텍스트 → { 단어 빈도, 2어절 표현 빈도, 원문 위치 } */
  function buildDocument(text) {
    const tokens = tokenize(text);
    const unigrams = new Map();
    const bigrams = new Map();

    tokens.forEach((tok, i) => {
      addOccurrence(unigrams, tok.term, [tok.start, tok.end]);
      if (i > 0 && tok.joinsPrev) {
        const prev = tokens[i - 1];
        if (prev.term !== tok.term) {
          addOccurrence(bigrams, prev.term + ' ' + tok.term, [prev.start, tok.end]);
        }
      }
    });

    return { text: String(text || ''), tokens, unigrams, bigrams, length: tokens.length };
  }

  function countOf(doc, term) {
    const occ = doc.unigrams.get(term) || doc.bigrams.get(term);
    return occ ? occ.length : 0;
  }

  function firstPosition(doc, term) {
    const occ = doc.unigrams.get(term) || doc.bigrams.get(term);
    return occ ? occ[0][0] : Infinity;
  }

  /* ---------- 3. IDF (역문서 빈도) ---------- */

  /**
   * 말뭉치 전체에서 IDF를 계산합니다. (scikit-learn의 smooth_idf와 같은 공식)
   *   idf(t) = ln((1 + N) / (1 + df(t))) + 1
   * 여러 서술에 두루 나오는 단어일수록 값이 작아집니다.
   */
  function buildIdf(corpusTexts) {
    const docs = corpusTexts.map(t => buildDocument(t));
    const df = new Map();
    docs.forEach(doc => {
      const seen = new Set([...doc.unigrams.keys(), ...doc.bigrams.keys()]);
      seen.forEach(term => df.set(term, (df.get(term) || 0) + 1));
    });
    const N = docs.length;
    const idf = term => Math.log((1 + N) / (1 + (df.get(term) || 0))) + 1;
    return { idf, df: term => df.get(term) || 0, size: N };
  }

  /* ---------- 4. 유사도 ---------- */

  function tfidfVector(doc, idf) {
    const vec = new Map();
    doc.unigrams.forEach((occ, term) => vec.set(term, occ.length * idf(term)));
    return vec;
  }

  function norm(vec) {
    let sum = 0;
    vec.forEach(v => { sum += v * v; });
    return Math.sqrt(sum);
  }

  /**
   * 코사인 유사도와, 그 값을 만든 공유 단어별 기여도를 함께 반환합니다.
   * 기여도(term) = wA(term)·wB(term) / (|A|·|B|)  → 모든 기여도의 합 = 코사인 값
   */
  function cosineSimilarity(vecA, vecB) {
    const nA = norm(vecA);
    const nB = norm(vecB);
    if (nA === 0 || nB === 0) return { score: 0, contributions: [] };

    const contributions = [];
    vecA.forEach((wA, term) => {
      const wB = vecB.get(term);
      if (wB) contributions.push({ term, contribution: (wA * wB) / (nA * nB) });
    });
    contributions.sort((a, b) => b.contribution - a.contribution);
    const score = contributions.reduce((s, c) => s + c.contribution, 0);
    return { score: Math.min(1, score), contributions };
  }

  /** Jaccard 유사도 = |공통 어휘| / |전체 어휘| */
  function jaccardSimilarity(setA, setB) {
    const a = new Set(setA);
    const b = new Set(setB);
    const union = new Set([...a, ...b]);
    const intersection = [...a].filter(t => b.has(t));
    return {
      score: union.size === 0 ? 0 : intersection.length / union.size,
      intersection,
      unionSize: union.size
    };
  }

  /* ---------- 5. 사건 단위 비교 분석 ---------- */

  const DEFAULTS = { topKeywords: 8, topDistinctive: 6, topCommon: 10, topContributions: 5, alpha: 0.5 };

  /**
   * 한 사건에 대한 한국·일본·중국 서술을 비교 분석합니다.
   * @param {{korea, japan, china}} narratives  각 값은 문자열 또는 {title, text}
   * @param {{corpus?: string[]}} options       IDF 계산용 말뭉치 (없으면 세 서술만 사용)
   */
  function analyzeEvent(narratives, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});

    const texts = {};
    const docs = {};
    COUNTRIES.forEach(c => {
      texts[c] = composeText(narratives && narratives[c]);
      docs[c] = buildDocument(texts[c]);
    });

    // 분석 대상 서술이 말뭉치에 없으면 추가해 IDF가 항상 정의되도록 합니다.
    const corpus = Array.from(new Set([...(opts.corpus || []), ...COUNTRIES.map(c => texts[c])]))
      .filter(t => t && t.trim());
    const { idf, df, size: corpusSize } = buildIdf(corpus);

    const vocabulary = new Set();
    COUNTRIES.forEach(c => docs[c].unigrams.forEach((_, term) => vocabulary.add(term)));

    const countsFor = term => {
      const counts = {};
      COUNTRIES.forEach(c => { counts[c] = countOf(docs[c], term); });
      return counts;
    };
    const earliest = term => Math.min(...COUNTRIES.map(c => firstPosition(docs[c], term)));

    /* 5-1. 국가별 핵심 키워드 (TF-IDF) */
    const keywords = {};
    COUNTRIES.forEach(c => {
      const doc = docs[c];
      keywords[c] = [...doc.unigrams.keys()]
        .map(term => {
          const tf = countOf(doc, term);
          const w = idf(term);
          return { term, tf, idf: w, df: df(term), score: tf * w, first: firstPosition(doc, term) };
        })
        .sort((a, b) => b.score - a.score || a.first - b.first)
        .slice(0, opts.topKeywords);
    });

    /* 5-2. 공통 표현 (세 국가 모두 등장) + 두 국가만 공유하는 표현 */
    const allTerms = new Set();
    COUNTRIES.forEach(c => {
      docs[c].unigrams.forEach((_, t) => allTerms.add(t));
      docs[c].bigrams.forEach((_, t) => allTerms.add(t));
    });

    const common = [];
    const pairShared = {};
    PAIRS.forEach(p => { pairShared[p.join('-')] = []; });

    allTerms.forEach(term => {
      const counts = countsFor(term);
      const present = COUNTRIES.filter(c => counts[c] > 0);
      const entry = {
        term,
        isPhrase: term.includes(' '),
        counts,
        total: present.reduce((s, c) => s + counts[c], 0),
        idf: idf(term),
        first: earliest(term)
      };
      if (present.length === 3) {
        common.push(entry);
      } else if (present.length === 2) {
        const key = PAIRS.find(p => p.every(c => present.includes(c))).join('-');
        pairShared[key].push(entry);
      }
    });

    const byCommonness = (a, b) =>
      Math.min(...COUNTRIES.map(c => b.counts[c])) - Math.min(...COUNTRIES.map(c => a.counts[c])) ||
      b.total - a.total || b.idf - a.idf || a.first - b.first;
    const byShared = (a, b) => b.total - a.total || b.idf - a.idf || a.first - b.first;

    common.sort(byCommonness);
    Object.keys(pairShared).forEach(k => {
      pairShared[k] = pairShared[k].filter(e => !e.isPhrase).sort(byShared);
    });

    /* 5-3. 국가별 특징적 표현
       · ratio : 평활화된 상대 빈도 비율 = P(단어|해당 국가) / P(단어|나머지 두 국가)
       · z     : 로그 오즈비를 표준오차로 나눈 값 (Monroe et al. 2008, "Fightin' Words" 방식 간소화)
                 → 한 번 나온 단어보다 여러 번 반복된 단어에 더 큰 확신을 부여합니다. 정렬 기준. */
    const V = vocabulary.size || 1;
    const alpha = opts.alpha;
    const distinctive = {};
    COUNTRIES.forEach(c => {
      const others = COUNTRIES.filter(o => o !== c);
      const Nc = docs[c].length;
      const No = others.reduce((s, o) => s + docs[o].length, 0);

      distinctive[c] = [...docs[c].unigrams.keys()]
        .map(term => {
          const nc = countOf(docs[c], term);
          const otherCounts = {};
          others.forEach(o => { otherCounts[o] = countOf(docs[o], term); });
          const no = others.reduce((s, o) => s + otherCounts[o], 0);
          const pc = (nc + alpha) / (Nc + alpha * V);
          const po = (no + alpha) / (No + alpha * V);
          const ratio = pc / po;
          const logOdds = Math.log(pc / (1 - pc)) - Math.log(po / (1 - po));
          const z = logOdds / Math.sqrt(1 / (nc + alpha) + 1 / (no + alpha));
          return {
            term, count: nc, otherCounts, othersTotal: no,
            ratio, logRatio: Math.log2(ratio), z, exclusive: no === 0,
            idf: idf(term), first: firstPosition(docs[c], term)
          };
        })
        .filter(e => e.ratio > 1)
        .sort((a, b) => b.z - a.z || b.idf - a.idf || a.first - b.first)
        .slice(0, opts.topDistinctive);
    });

    /* 5-4. 국가 쌍별 텍스트 유사도 */
    const vectors = {};
    COUNTRIES.forEach(c => { vectors[c] = tfidfVector(docs[c], idf); });

    const similarity = PAIRS.map(([a, b]) => {
      const cos = cosineSimilarity(vectors[a], vectors[b]);
      const jac = jaccardSimilarity(docs[a].unigrams.keys(), docs[b].unigrams.keys());
      return {
        pair: [a, b],
        key: a + '-' + b,
        cosine: cos.score,
        jaccard: jac.score,
        sharedTerms: jac.intersection,
        unionSize: jac.unionSize,
        contributions: cos.contributions.slice(0, opts.topContributions)
      };
    });

    /* 5-5. 근거 확인용 원문 위치 */
    const occurrences = term => {
      const out = {};
      COUNTRIES.forEach(c => {
        out[c] = (docs[c].unigrams.get(term) || docs[c].bigrams.get(term) || []).map(s => s.slice());
      });
      return out;
    };

    return {
      countries: COUNTRIES.slice(),
      texts,
      stats: Object.fromEntries(COUNTRIES.map(c => [c, {
        tokens: docs[c].length,
        uniqueTerms: docs[c].unigrams.size,
        characters: texts[c].length
      }])),
      keywords,
      common: common.slice(0, opts.topCommon),
      pairShared,
      distinctive,
      similarity,
      occurrences,
      countsFor,
      meta: {
        method: 'TF-IDF + cosine / Jaccard / smoothed log-odds z-score',
        corpusSize,
        vocabularySize: vocabulary.size,
        alpha
      }
    };
  }

  /** eventsData 배열 → IDF 계산용 말뭉치(서술 텍스트 목록) */
  function buildCorpusFromEvents(events) {
    const corpus = [];
    (events || []).forEach(ev => {
      COUNTRIES.forEach(c => {
        const t = composeText(ev[c]);
        if (t) corpus.push(t);
      });
    });
    return corpus;
  }

  /** eventsData 중 한 사건을 바로 분석하는 편의 함수 */
  function analyzeEventData(event, allEvents) {
    return analyzeEvent(
      { korea: event.korea, japan: event.japan, china: event.china },
      { corpus: buildCorpusFromEvents(allEvents || [event]) }
    );
  }

  return {
    COUNTRIES,
    PAIRS,
    normalizeToken,
    tokenize,
    buildDocument,
    buildIdf,
    cosineSimilarity,
    jaccardSimilarity,
    analyzeEvent,
    analyzeEventData,
    buildCorpusFromEvents
  };
});
