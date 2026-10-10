/* ============================================================
   Shared Memory Project — contribution-guide.js
   공동 표현 작성 가이드(Guided Contribution) 문구 데이터
   ============================================================
   · 선택지 코드(id)는 Supabase에 그대로 저장되므로, 한 번 쓴 id는 바꾸지 마세요.
     화면에 보이는 label·desc는 자유롭게 고쳐도 됩니다.
   · 어떤 방식도 "정답"이 아닙니다. 사실을 지우거나 약화시키지 않으면서
     관점의 차이를 함께 이해하도록 돕는 것이 목적입니다.
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ContributionGuide = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** STEP 2. 표현 방식 */
  const STYLES = [
    {
      id: 'fact',
      label: '사실 중심',
      desc: '평가보다 사건의 원인·주체·과정·결과를 중심으로 표현합니다.',
      hint: '누가, 언제, 무엇을 했고, 어떤 결과가 있었는지를 빠뜨리지 않고 적어 보세요. 침략·강제처럼 사실을 나타내는 말은 그대로 써도 됩니다.'
    },
    {
      id: 'perspective',
      label: '관점 차이 인정',
      desc: '국가별 표현 차이를 숨기지 않고 함께 드러냅니다.',
      hint: '“한국에서는 ○○, 일본에서는 ○○로 불린다”처럼 서로 다른 이름과 강조점을 함께 적어 보세요.'
    },
    {
      id: 'shared',
      label: '공동 기억 중심',
      desc: '서로 다른 서술에서도 함께 확인되는 요소를 중심으로 표현합니다.',
      hint: '분석 탭의 “세 국가 공통 표현”을 참고하되, 공통점만 남기느라 책임이나 피해 같은 사실이 사라지지 않았는지 확인해 보세요.'
    },
    {
      id: 'future',
      label: '미래 대화 중심',
      desc: '역사적 사실을 바탕으로 현재의 대화와 공존까지 연결합니다.',
      hint: '먼저 사실을 적고, 그 사실을 오늘 어떻게 기억하고 이야기하면 좋을지를 이어서 적어 보세요.'
    }
  ];

  /** STEP 3. 문장 틀 (참고용 · 정답 아님) */
  const TEMPLATES = [
    {
      id: 'describe',
      label: '사건 설명형',
      text: '이 사건은 ______로 시작되어, ______가 참여한 ______이었다.'
    },
    {
      id: 'compare',
      label: '관점 비교형',
      text: '세 국가의 서술은 ______를 바라보는 방식에서 차이를 보이지만, ______라는 점은 함께 확인할 수 있다.'
    },
    {
      id: 'memory',
      label: '공동 기억형',
      text: '______의 책임과 ______의 피해를 함께 기억하며, 이 사건을 ______로 표현하고 싶다.'
    }
  ];

  /** STEP 4. 표현 이유 (복수 선택) */
  const REASONS = [
    { id: 'multi_perspective', label: '여러 국가의 관점을 함께 담고 싶어서' },
    { id: 'responsibility', label: '역사적 책임을 명확하게 표현하고 싶어서' },
    { id: 'damage', label: '피해 경험을 함께 포함하고 싶어서' },
    { id: 'common_facts', label: '공통적으로 확인되는 사실을 중심으로 쓰고 싶어서' },
    { id: 'future_dialogue', label: '미래의 대화와 공존을 강조하고 싶어서' },
    { id: 'other', label: '기타 / 직접 작성' }
  ];

  /* ------------------------------------------------------------
     제출 전 확인 (모두 브라우저 안에서만 실행, 서버로 보내지 않음)
     ------------------------------------------------------------ */

  const BLANK = '______';

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function snippetAround(text, index, length) {
    const from = Math.max(0, index - 10);
    const to = Math.min(text.length, index + length + 10);
    return (from > 0 ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '');
  }

  /**
   * 문장 틀의 빈칸이 남아 있는지 검사합니다.
   *  · 밑줄(_ 또는 전각 ＿)이 3개 이상 이어지면 항상 빈칸으로 봅니다.
   *  · 문장 틀을 사용한 경우(templateUsed)에는 2개 연속도 빈칸으로 봅니다.
   *    (일반 문장의 밑줄 1개(예: snake_case)는 막지 않습니다)
   *  · 빈칸을 지우기만 하고 채우지 않은 경우("이 사건은 로 시작되어,")도 찾습니다.
   * → { blocked, issues: [{ kind, index, length, snippet }] }
   */
  function findPlaceholderIssues(text, options) {
    const src = typeof text === 'string' ? text : '';
    const opts = options || {};
    const issues = [];
    const min = opts.templateUsed ? 2 : 3;
    const runRe = /[_＿]{2,}/g;
    let m;
    while ((m = runRe.exec(src))) {
      if (m[0].length >= min) issues.push({ kind: 'underscore', index: m.index, length: m[0].length, snippet: snippetAround(src, m.index, m[0].length) });
    }
    TEMPLATES.forEach(t => {
      const pieces = t.text.split(BLANK);
      for (let i = 0; i < pieces.length - 1; i++) {
        const leftTokens = pieces[i].trim().split(/\s+/).filter(Boolean);
        const rightTokens = pieces[i + 1].trim().split(/\s+/).filter(Boolean);
        if (!leftTokens.length || !rightTokens.length) continue;
        const left = leftTokens[leftTokens.length - 1];
        const right = rightTokens.slice(0, 2).map(escapeRegExp).join('\\s+');
        const re = new RegExp(escapeRegExp(left) + '\\s*' + right);
        const hit = re.exec(src);
        if (hit && !issues.some(x => x.index === hit.index)) {
          issues.push({ kind: 'emptied', index: hit.index, length: hit[0].length, snippet: hit[0] });
        }
      }
    });
    issues.sort((a, b) => a.index - b.index);
    return { blocked: issues.length > 0, issues };
  }

  function placeholderMessage(result) {
    if (!result || !result.blocked) return '';
    const first = result.issues[0];
    return first.kind === 'underscore'
      ? `문장 틀의 빈칸(____)이 남아 있어요. “${first.snippet}” 부분의 밑줄을 자신의 말로 바꿔 주세요.`
      : `문장 틀의 빈칸이 비어 있는 것 같아요. “${first.snippet}” 사이에 들어갈 말을 채워 주세요.`;
  }

  /**
   * 역사 용어 확인 — 매우 제한적인 보조 안내입니다.
   *  · 해석·관점·가치판단은 다루지 않고, 확실한 국호·연대 불일치만 대상으로 합니다.
   *  · 점수를 매기거나 제출을 막지 않습니다 (안내 후 그대로 등록 가능).
   *  · 같은 문장에 "오늘날·현재" 같은 현재 시점 표현이나 "부른다·교과서" 같은 명칭 설명이 있으면
   *    현재의 국가를 가리키는 정당한 표현일 수 있어 안내하지 않습니다.
   */
  const TERM_RULES = [
    {
      id: 'imjin-state-name',
      events: ['imjin'],
      patterns: [/대한민국/, /대한제국/, /大韓民國/, /大韓民国/, /大韩民国/, /Republic of Korea/i, /South Korea/i],
      message: '1592년 당시 한반도의 국호는 ‘조선’이었습니다. ‘대한민국’(1948년 수립)·‘대한제국’(1897–1910)이 당시를 가리키는 말로 쓰였는지 한 번 확인해 보세요.'
    }
  ];
  const PRESENT_CONTEXT = /오늘날|현재|지금|요즘|현대|부르|불리|불린|교과서|배우|\b(?:today|now|nowadays|present|modern|call(?:s|ed)?|textbooks?)\b|現在|今日|現代|呼ば|呼ん|教科書|现在|如今|今天|称为|叫做|课本/i;

  function checkHistoricalTerms(text, eventId) {
    const src = typeof text === 'string' ? text : '';
    const sentences = src.split(/[.!?。！？\n]+/);
    const out = [];
    TERM_RULES.forEach(rule => {
      if (rule.events.indexOf(eventId) < 0) return;
      const hit = sentences.some(sentence =>
        !PRESENT_CONTEXT.test(sentence) && rule.patterns.some(p => p.test(sentence)));
      if (hit) out.push({ id: rule.id, message: rule.message });
    });
    return out;
  }

  /**
   * 닉네임 개인정보 확인 — 공개되는 이름에 연락처·학교·학년/반 정보가 들어간 경우만 막습니다.
   * (실명 여부는 판별할 수 없으므로 화면 안내로 대신합니다)
   */
  function checkNickname(name) {
    const s = typeof name === 'string' ? name.trim() : '';
    if (!s) return { ok: true };
    if (/\S+@\S+\.\S+/.test(s)) return { ok: false, reason: 'email' };
    if ((s.match(/\d/g) || []).length >= 8 || /\d{2,3}[-.\s]\d{3,4}[-.\s]\d{4}/.test(s)) return { ok: false, reason: 'phone' };
    if (/학교|고교|중학|초등|대학|高校|中学|小学|大学|school/i.test(s)) return { ok: false, reason: 'school' };
    if (/\d+\s*학년|\d+\s*반\s*\d+\s*번|\d+\s*반\b/.test(s)) return { ok: false, reason: 'class' };
    return { ok: true };
  }

  const NICKNAME_MESSAGE = '닉네임에 연락처·학교명·학년/반처럼 개인을 알아볼 수 있는 정보가 있는 것 같아요. 닉네임은 다른 참여자에게 공개되므로 별명으로 바꾸거나 비워 두세요.';

  return {
    STYLES, TEMPLATES, REASONS, BLANK,
    findPlaceholderIssues, placeholderMessage,
    TERM_RULES, checkHistoricalTerms,
    checkNickname, NICKNAME_MESSAGE
  };
});
