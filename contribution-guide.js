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

  return { STYLES, TEMPLATES, REASONS };
});
