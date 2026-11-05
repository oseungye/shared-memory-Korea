/* 사용자 피드백 1차 반영 (2026-11) — 실행: npm test
   ① 쉬운 말: 학생에게 보이는 곳에 NLP·TF-IDF·Supabase 같은 기술 용어를 쓰지 않음(분석 방법은 접힌 상자·FAQ에만)
   ② 같은 안내 반복 줄이기: '옳다는 뜻은 아니에요'류 문구를 카드 화면·통계에서 뺌
   ③ 처음 온 사람을 위한 진행 안내(대화 상자) · '봤음' 표시는 'sm_' 키가 아님(공용 기기 기록으로 세지 않음)
   ④ 이름의 뜻: 임진왜란·재일조선인의 세 나라 이름마다 한 줄 설명
   ⑤ 닉네임: 개인정보에 더해 링크·운영자 행세·욕설/비하 표현 차단, 이유별 안내 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const Guide = require('../contribution-guide.js');

/** index.html에서 화면에 바로 보이는 글자만 (주석·접힌 상자(details)·FAQ·script 제외) */
function visibleHtml() {
  return HTML.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<details[\s\S]*?<\/details>/g, '')
    .replace(/<head>[\s\S]*?<\/head>/, '');
}

test('① 화면에 바로 보이는 곳에 기술 용어가 없음 (분석 방법은 접힌 상자 안)', () => {
  const v = visibleHtml();
  for (const word of ['NLP', 'TF-IDF', '코사인', 'Jaccard', 'Supabase', 'RLS']) assert.ok(!v.includes(word), word);
  assert.match(HTML, /<details class="method-note">[\s\S]*TF-IDF[\s\S]*<\/details>/);          // 궁금한 사람은 볼 수 있음
  assert.match(HTML, /data-tab="ai">어떻게 다를까\?<small class="tab__sub">단어로 비교<\/small>/);
  // 스크립트가 만드는 안내 문구
  for (const s of ['NLP로 계산한 결과', '(NLP 계산)', '자동 계산(NLP)', "'NLP 공통·특징 표현'", '개 어휘 토큰(서로 다른 어휘', '국가별 역사 서술 · NLP 비교']) assert.ok(!SCRIPT.includes(s), s);
});

test('② 같은 안내 반복 줄이기: 카드 화면·통계·분석 상자에서 "옳다는 뜻 아님"류 문구를 뺌', () => {
  for (const s of ['많이 고른 관점이 옳다는 뜻은 아니에요', '공감이 많다고 옳은 문장이라는 뜻은 아니에요', '판정이 아닙니다)', '표현의 옳고 그름을 평가하지 않습니다. 문장의', '중요도나 옳고 그름을 뜻하지 않습니다', '값이 높다고 더 좋은 표현이라는 뜻이 아닙니다']) {
    assert.ok(!SCRIPT.includes(s), s);
  }
  assert.ok(!visibleHtml().includes('“가장 올바른 표현”을 판정하는 기능이 아닙니다'));
  // 꼭 필요한 곳(관점 고르기 · 네 번째 서술자 소개)에는 남김
  assert.match(SCRIPT, /정답은 없어요\. 내가 가장 중요하다고 생각하는 것/);
  assert.match(HTML, /AI의 답은 정답이 아니라 또 하나의 서술입니다/);
});

test('③ 진행 안내: 대화 상자·4단계·시작 버튼, 봤음 표시는 sm_ 키가 아님', () => {
  const box = HTML.match(/<div class="flow-guide" id="flowGuide"[\s\S]*?<\/div>\s*<\/div>/)[0];
  assert.match(box, /role="dialog" aria-modal="true" aria-labelledby="flowGuideTitle"/);
  assert.equal((box.match(/<li>/g) || []).length, 4);
  assert.match(box, /data-guide-close>시작하기</);
  assert.match(SCRIPT, /const GUIDE_SEEN_KEY = 'sm-guide-seen';/);
  assert.ok(!/GUIDE_SEEN_KEY = 'sm_/.test(SCRIPT));
  assert.match(SCRIPT, /data-guide-open aria-haspopup="dialog">\? 진행 방법</);
});

test('④ 이름의 뜻: 임진왜란·재일조선인의 세 이름마다 한 줄 설명', () => {
  const src = fs.readFileSync(path.join(ROOT, 'events-data.js'), 'utf8');
  const events = new Function(`${src}; return eventsData;`)();
  for (const id of ['imjin', 'zainichi']) {
    const e = events.find(x => x.id === id);
    for (const k of ['korea', 'japan', 'china']) {
      const note = e.nameNotes && e.nameNotes[k];
      assert.ok(note && note.length >= 20 && note.length <= 130, `${id}.${k}`);
    }
  }
  const imjin = events.find(x => x.id === 'imjin').nameNotes;
  assert.match(imjin.korea, /임진년\(1592\)/);
  assert.match(imjin.japan, /‘역\(役\)’은 전쟁·군사 동원/);
  assert.match(imjin.japan, /‘침략’이라는 말은 없어요/);
  assert.match(imjin.china, /만력/);
  assert.match(SCRIPT, /sum-card__name-note/);
});

test('⑤ 닉네임: 개인정보·링크·운영자 행세·욕설/비하 표현은 막고, 평범한 별명은 통과', () => {
  const ok = ['민지', '익명의 고양이', 'Hana', 'student_01', 'japan_fan', '역사덕후', '시바견 사랑', '운동하는 민지', ''];
  const bad = {
    impersonation: ['운영자', '운 영 자', 'Admin', '관리자 민지', 'SharedMemory 공식'],
    abuse: ['ㅅ.ㅂ', '씨발', '병신', '쪽바리', '짱깨', '조센징', 'fuck you', 'jap', '死ね', '小日本'],
    link: ['www.example.com', 'http://a.b'],
    school: ['서울고등학교 민지'],
    phone: ['010-1234-5678']
  };
  ok.forEach(n => assert.equal(Guide.checkNickname(n).ok, true, n));
  for (const [reason, list] of Object.entries(bad)) {
    list.forEach(n => { const r = Guide.checkNickname(n); assert.equal(r.ok, false, n); assert.equal(r.reason, reason, n); });
    assert.ok(Guide.NICKNAME_MESSAGES[reason], reason);
  }
});
