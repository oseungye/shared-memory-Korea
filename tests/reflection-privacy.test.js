/* 한 줄 소감 개인정보 확인 — 실행: npm test
   · 소감은 동의 상자 없이 이름 없이 저장되므로(비공개), 나를 알아볼 수 있는 내용은 저장 전에 고치게 합니다.
   · 역사 문장·학교를 말하는 일반 문장은 막지 않는지(오탐)도 함께 확인합니다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Guide = require('../contribution-guide.js');

test('소감: 연락처·링크·이름 밝히기·학교 이름·학년/반은 막는다', () => {
  [
    ['제 이름은 홍길동이고 010-1234-5678 입니다', 'link|email|phone|name'],
    ['내 이름은 민수', 'name'],
    ['연락 주세요 010 1234 5678', 'phone'],
    ['me@test.org 로 보내 줘', 'email|link'],
    ['www.example.kr 참고', 'link'],
    ['서울고등학교 학생으로서 느낀 점', 'school'],
    ['한빛중 2학년인데 처음 알았다', 'school'],
    ['한국여고 다니는 학생', 'school'],
    ['2학년 3반 친구들과 같이 했다', 'class'],
    ['3반 12번', 'class']
  ].forEach(([t, reason]) => {
    const r = Guide.checkPrivateText(t);
    assert.equal(r.ok, false, t);
    assert.match(r.reason, new RegExp(`^(${reason})$`), t);
  });
});

test('소감: 역사 문장과 학교를 말하는 일반 문장은 막지 않는다 (오탐 없음)', () => {
  [
    '', '학교에서 배운 것과 달랐다', '고등학교 교과서에는 짧게 나왔다', '중학교 때 처음 들었다', '3학년 때 배웠다',
    '이름 하나에도 각 나라가 이 전쟁을 보는 눈이 담겨 있다', '1592년 4월 13일 부산에 상륙했다', '1945 1952 1965 1991',
    '명나라와 조선이 함께 싸웠다', '이 전쟁은 동아시아 최고 규모였다', '언젠가 한중일 합작이 꼭 나왔으면 하는 바람이다',
    '국가 차원에서 전후 보상을 좀 더 잘해줬으면 어땠을까, 아쉽다.', '万历朝鲜战争是东亚的国际战争。', '文禄・慶長の役は日本の出兵で始まった。'
  ].forEach(t => assert.equal(Guide.checkPrivateText(t).ok, true, t));
});

test('소감 안내: 입력 칸 아래와 막을 때 문구가 무엇을 쓰지 말지 알려 준다', () => {
  assert.match(Guide.PRIVATE_TEXT_MESSAGE, /이름·학교·학년\/반·전화번호·이메일·링크/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="reflectHint">[\s\S]*?이름·학교·학년\/반·연락처는 쓰지 말아 주세요\.<\/p>/);
  // 카드를 만들고 저장하기 전에 확인한다
  const js = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const fn = js.slice(js.indexOf('function makeQuickCard('), js.indexOf('async function saveQuickAnswers('));
  assert.ok(fn.indexOf('checkPrivateText') > 0 && fn.indexOf('checkPrivateText') < fn.indexOf('saveQuickAnswers()'));
  assert.ok(fn.indexOf('checkPrivateText') < fn.indexOf('countParticipation()'));
});
