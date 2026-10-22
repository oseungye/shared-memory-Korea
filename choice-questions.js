/* ============================================================
   Shared Memory Project — choice-questions.js
   기본 체험(객관식 관점 고르기) 질문 데이터와 처리
   ============================================================
   [이 객관식은 퀴즈가 아닙니다]
   · 정답이 없습니다. 선택지는 모두 역사적 사실에 맞는 "무엇을 중요하게 볼 것인가"의 차이입니다.
     사실을 부정하는 선택지(예: "침략이 아니었다")는 넣지 않습니다.
   · 선택지는 이 사건의 세 나라 요약 서술(events-data.js)·타임라인·편집자 해설에 실제로 나온 내용에서만 만듭니다.
     각 선택지의 basis에 근거가 된 서술·연표를 적어 두고, 테스트에서 근거 낱말이 실제로 있는지 확인합니다.
   · 나라 이름을 선택지에 붙이지 않습니다(학생을 "어느 나라 편"으로 나누지 않도록).
   · 순서 효과(앞 선택지를 더 고르는 경향)를 줄이기 위해, 화면에서는 선택지 순서를 참여자마다 돌려서 보여줍니다(rotation).
   · 질문마다 "건너뛰기"를 허용합니다.
   · 선택지 id는 Supabase에 저장될 수 있으므로, 한 번 쓴 id는 바꾸지 마세요. 화면 문구(label)는 고쳐도 됩니다.
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChoiceQuestions = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 사건별 질문. 질문 id·선택지 id는 [a-z0-9_]만 씁니다 (DB 제약과 같음).
   * basis: 선택지의 근거 — { field: 'korea.text' | 'japan.feature' | 'timeline' …, terms: [서술에 실제로 있는 낱말] }
   */
  const QUESTIONS = {
    imjin: [
      {
        id: 'name_focus',
        prompt: '이 전쟁을 부르는 이름에, 무엇이 가장 먼저 드러나야 한다고 생각하나요?',
        short: '이름에 담고 싶은 것',
        options: [
          { id: 'responsibility', label: '누가 전쟁을 일으켰는지 — 침략의 책임', card: '침략의 책임이 드러나는 이름',
            basis: [{ field: 'korea.text', terms: ['침략'] }] },
          { id: 'international', label: '조선·명·일본이 모두 얽힌 국제 전쟁이었다는 점', card: '세 나라가 얽힌 국제 전쟁이라는 점',
            basis: [{ field: 'shortDesc', terms: ['국제 전쟁'] }] },
          { id: 'suffering', label: '전쟁으로 고통받은 백성과 병사들의 희생', card: '백성과 병사들의 희생',
            basis: [{ field: 'korea.text', terms: ['희생'] }] },
          { id: 'many_names', label: '나라마다 다른 이름을 함께 소개해, 관점의 차이를 보여 주는 것', card: '서로 다른 이름을 함께 보여 주는 것',
            basis: [{ field: 'titleJP', terms: ['文禄'] }, { field: 'titleCN', terms: ['万历'] }] }
        ]
      },
      {
        id: 'remember_scene',
        prompt: '이 전쟁에서 오늘 우리가 꼭 기억해야 할 장면은 무엇이라고 생각하나요?',
        short: '꼭 기억할 장면',
        options: [
          { id: 'resistance', label: '이순신의 수군과 의병들의 항전', card: '수군과 의병의 항전',
            basis: [{ field: 'korea.text', terms: ['이순신', '의병'] }] },
          { id: 'alliance', label: '조선과 명나라 군대가 함께 싸운 연합', card: '조선·명 연합군',
            basis: [{ field: 'china.text', terms: ['조선의 요청'] }, { field: 'timeline', terms: ['연합군'] }] },
          { id: 'devastation', label: '황폐해진 국토와 희생된 수많은 사람들', card: '황폐해진 국토와 희생',
            basis: [{ field: 'korea.text', terms: ['황폐화'] }] },
          { id: 'potters', label: '조선의 도공과 기술이 일본으로 옮겨 간 일 — 많은 도공이 끌려갔다는 사실까지', card: '일본으로 끌려간 도공과 옮겨 간 기술',
            basis: [{ field: 'japan.text', terms: ['도자기'] }] }
        ]
      },
      {
        id: 'textbook_line',
        prompt: '세 나라 학생이 함께 읽는 교과서에 이 전쟁을 한 문장으로 넣는다면, 무엇을 꼭 담고 싶나요?',
        short: '함께 읽는 교과서에 담을 것',
        options: [
          { id: 'invasion_clear', label: '일본의 침략으로 시작된 전쟁이라는 사실', card: '침략으로 시작된 전쟁이라는 사실',
            basis: [{ field: 'korea.text', terms: ['침공'] }, { field: 'china.text', terms: ['일본의 침략'] }] },
          { id: 'side_by_side', label: '세 나라가 이 전쟁을 서로 다르게 불러 왔다는 사실', card: '서로 다른 이름과 시선',
            basis: [{ field: 'japan.feature', terms: ['출병'] }] },
          { id: 'order_change', label: '전쟁이 동아시아에 남긴 변화 — 예를 들어 명나라의 국력 약화', card: '동아시아 질서에 남긴 변화',
            basis: [{ field: 'china.text', terms: ['국력 약화'] }] },
          { id: 'human_cost', label: '이름과 관계없이, 조선·명·일본 모두 큰 인적·물적 부담을 졌다는 점', card: '세 나라 모두가 진 큰 부담',
            basis: [{ field: 'shortDesc', terms: ['인적·물적 부담'] }] }
        ]
      }
    ],
    zainichi: [
      {
        id: 'start_point',
        prompt: '재일조선인의 역사를 설명할 때, 가장 먼저 다뤄야 할 것은 무엇이라고 생각하나요?',
        short: '가장 먼저 다룰 것',
        options: [
          { id: 'colonial_origin', label: '식민지 지배 아래의 노동 이주와 전시 동원이라는 시작', card: '식민지 지배와 동원이라는 시작',
            basis: [{ field: 'korea.text', terms: ['노동 이주', '강제 동원'] }] },
          { id: 'legal_status', label: '해방 뒤 국적을 잃고 법적 지위가 여러 번 바뀐 과정', card: '국적과 법적 지위가 바뀐 과정',
            basis: [{ field: 'timeline', terms: ['국적 상실', '특별영주자'] }] },
          { id: 'discrimination', label: '교육·취업 등에서 겪은 차별과 권리를 위한 노력', card: '차별과 권리를 위한 노력',
            basis: [{ field: 'korea.text', terms: ['차별'] }] },
          { id: 'community_life', label: '일본 사회에서 생활 기반을 만들며 살아온 지역의 삶', card: '지역에서 일궈 온 삶',
            basis: [{ field: 'japan.text', terms: ['생활 기반'] }] }
        ]
      },
      {
        id: 'whose_history',
        prompt: '재일조선인의 역사는 누구의 역사라고 생각하나요?',
        short: '누구의 역사인가',
        options: [
          { id: 'peninsula', label: '한반도의 역사 — 식민지 시기에 고향을 떠난 사람들의 이야기', card: '한반도의 역사',
            basis: [{ field: 'korea.text', terms: ['일제강점기'] }] },
          { id: 'japan_society', label: '일본 사회의 역사 — 함께 살아온 이웃이자 주민의 이야기', card: '일본 사회의 역사',
            basis: [{ field: 'japan.text', terms: ['외국인 주민'] }] },
          { id: 'east_asia', label: '동아시아 전체가 함께 기억해야 할 역사', card: '동아시아가 함께 기억할 역사',
            basis: [{ field: 'china.text', terms: ['동아시아'] }] },
          { id: 'their_own', label: '무엇보다 재일조선인 자신들의 역사', card: '재일조선인 자신들의 역사',
            basis: [{ field: 'timeline', terms: ['정체성'] }] }
        ]
      },
      {
        id: 'remember_how',
        prompt: '오늘 이 역사를 기억하는 데 가장 필요한 것은 무엇이라고 생각하나요?',
        short: '기억하기 위해 필요한 것',
        options: [
          { id: 'responsibility', label: '식민지 지배와 전후 처리에 대한 책임을 분명히 하기', card: '식민지 지배·전후 처리의 책임',
            basis: [{ field: 'china.text', terms: ['전후 처리'] }, { field: 'korea.feature', terms: ['책임'] }] },
          { id: 'rights', label: '차별을 없애는 제도와 권리 보장', card: '차별을 없애는 제도와 권리',
            basis: [{ field: 'korea.text', terms: ['차별'] }, { field: 'japan.text', terms: ['복지'] }] },
          { id: 'testimony', label: '당사자의 이야기를 기록하고 귀 기울여 듣기', card: '당사자의 이야기를 기록하고 듣기',
            basis: [{ field: 'timeline', terms: ['정체성'] }] },
          { id: 'together', label: '서로 다른 나라의 시선을 함께 읽어 보기', card: '서로 다른 시선을 함께 읽기',
            basis: [{ field: 'china.text', terms: ['역사 인식 갈등'] }] }
        ]
      }
    ]
  };

  const ID_RE = /^[a-z0-9_]{1,40}$/;
  const SKIP = 'skip';

  function questionsFor(eventId) {
    return QUESTIONS[eventId] ? QUESTIONS[eventId].slice() : [];
  }

  function hasChoices(eventId) { return questionsFor(eventId).length > 0; }

  /** 응답 하나가 질문 목록에 실제로 있는 선택지인지 (건너뛰기는 유효) */
  function isValidAnswer(eventId, questionId, optionId) {
    const q = questionsFor(eventId).find(x => x.id === questionId);
    if (!q) return false;
    return optionId === SKIP || q.options.some(o => o.id === optionId);
  }

  /**
   * 선택지 표시 순서: 원래 순서를 유지한 채 시작 위치만 돌립니다(순서 효과 완화).
   * @param {number} offset  참여자·질문마다 정한 정수
   */
  function rotate(options, offset) {
    const n = options.length;
    if (!n) return [];
    const k = ((Math.floor(offset) % n) + n) % n;
    return options.slice(k).concat(options.slice(0, k));
  }

  /**
   * 카드·저장에 쓸 응답 정리. 질문 순서대로, 건너뛴 질문은 skipped=true로 남기고 지어내지 않습니다.
   * @param {Object<string,string>} answers  질문 id → 선택지 id | 'skip'
   * @returns {Array<{questionId, question, optionId, answer, skipped}>}
   */
  function summarize(eventId, answers) {
    const a = answers || {};
    return questionsFor(eventId).map(q => {
      const picked = a[q.id];
      const opt = q.options.find(o => o.id === picked);
      return {
        questionId: q.id,
        question: q.short,
        optionId: opt ? opt.id : null,
        answer: opt ? opt.card : '',
        skipped: !opt
      };
    });
  }

  /** 서버로 보낼 행 (건너뛴 질문은 보내지 않음). 닉네임·문장·키 등 다른 값은 넣지 않습니다. */
  function rowsForStorage(eventId, answers) {
    return summarize(eventId, answers)
      .filter(r => !r.skipped && ID_RE.test(r.questionId) && ID_RE.test(r.optionId))
      .map(r => ({ event_key: eventId, question_id: r.questionId, option_id: r.optionId }));
  }

  /**
   * 집계 결과(서버 RPC) → 질문별 비율. 응답 수가 minSize 미만인 질문은 비율을 숨깁니다(hidden).
   * @param {Array<{question_id, option_id, n}>} rows
   */
  function shareOf(eventId, rows, minSize) {
    const min = minSize == null ? 5 : minSize;
    const list = Array.isArray(rows) ? rows : [];
    return questionsFor(eventId).map(q => {
      const counts = {};
      q.options.forEach(o => { counts[o.id] = 0; });
      list.forEach(r => {
        if (r && r.question_id === q.id && counts[r.option_id] != null) counts[r.option_id] += Number(r.n) || 0;
      });
      const total = Object.keys(counts).reduce((s, k) => s + counts[k], 0);
      return {
        questionId: q.id,
        total,
        hidden: total < min,
        options: q.options.map(o => ({ id: o.id, card: o.card, n: counts[o.id], share: total ? counts[o.id] / total : 0 }))
      };
    });
  }

  return { QUESTIONS, SKIP, ID_RE, questionsFor, hasChoices, isValidAnswer, rotate, summarize, rowsForStorage, shareOf };
});
