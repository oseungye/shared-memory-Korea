/* 아카이브 입구 · 기록한 '내 생각'을 공동 표현으로 공개 (기본 체험) — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/archive-entry.e2e.js   (전체: npm run test:e2e)
   · 카드 화면: 공개된 다른 참여자의 문장 3개(공감 최다 포함 · 숨김 제외) · 공감 · 모든 문장 보기 · 공동 표현 제안하기
   · 3단계에는 공개 체크 상자가 없음. '내 생각 기록하기' 뒤 카드 화면 맨 위에서 [공개하기]/[나만 간직하기]로 물음(누르는 것이 동의)
     · 공개는 심화 탐구와 같은 방식으로 '익명' 공동 표현 등록 · 같은 문장 다시 보내지 않음 · 빈칸(___)·링크가 있으면 공개하지 않음
     · 나만 간직하기 → 공개 안 됨(나중에 마음을 바꿀 수 있음) · 새 참여자는 이전 학생의 공개 상태가 남지 않음 */
'use strict';
const { run } = require('./harness');

const db = page => page.evaluate(() => window.__mockDb.read());
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const inViewport = (page, sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.width > 0; });
const entryTexts = page => page.$$eval('#archiveEntry .archive-entry__text', els => els.map(e => e.textContent.trim()));

const SEED = [
  { event_key: 'imjin', content: '공감을 가장 많이 받은 임진왜란 문장', empathy: 3 },
  { event_key: 'imjin', content: '임진왜란 최근 문장 하나' },
  { event_key: 'imjin', content: '임진왜란 최근 문장 둘' },
  { event_key: 'imjin', content: '임진왜란 최근 문장 셋' },
  { event_key: 'imjin', content: '운영자가 아직 확인하지 않은 문장', is_hidden: true, entry_source: 'quick' },
  { event_key: 'zainichi', content: '재일조선인 사건의 문장' }
];

/** 가짜 DB에 공개된 문장·공감을 미리 넣습니다 (아카이브는 2026-10-16 이후 등록분만 보여 줌) */
async function seed(page) {
  await page.evaluate(rows => {
    const raw = window.__mockDb.read();
    rows.forEach((r, i) => {
      const id = 900 + i;
      raw.shared_expressions.push({ id, event_key: r.event_key, author_name: '익명', country_code: 'ko', content: r.content, reason: '',
        created_at: new Date(Date.now() - (i + 1) * 60000).toISOString(), is_hidden: !!r.is_hidden, entry_source: r.entry_source || null });
      for (let k = 0; k < (r.empathy || 0); k++) raw.expression_empathy.push({ expression_id: id, voter_key: 'seed-voter-' + k });
    });
    sessionStorage.setItem('__mock_db', JSON.stringify(raw));
  }, SEED);
}

/** 기본 체험: 질문마다 첫 선택지 → 한 줄 소감 단계 */
async function quickToReflect(page, base, eventId) {
  await page.goto(base + `index.html#/e/${eventId}`);
  await page.waitForSelector('.page--detail.active');
  if (await page.isVisible('#participantGate')) await page.click('[data-gate-choice="continue"]');
  await page.click('[data-step-main="q1"]');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    if (await page.$eval('.page--detail', el => el.dataset.step) === '3') break;
    await page.click('#choiceStep [data-choice-option]');
    await page.click('[data-step-main="q2"]');
  }
  await page.waitForFunction(() => document.querySelector('.page--detail').dataset.step === '3');
}

async function makeCard(page) {
  // 쓴 문장이 있으면 '내 생각 기록하기', 없으면 '이번엔 건너뛰고 카드 보기'
  const typed = (await page.inputValue('#reflectInput')).trim();
  await page.click(typed ? '[data-step-main="q3"]' : '[data-reflect-skip]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => {
    const box = document.getElementById('archiveEntry');
    return box && !box.hidden && !/불러오는 중/.test(box.textContent);
  });
}

run('archive-entry', async ({ browser, base, check, mockPage }) => {
  const REFLECT = '이름 하나에도 각 나라가 이 전쟁을 보는 눈이 담겨 있다.';

  /* ---------- 1. 휴대폰: 3단계에는 공개 체크 상자가 없음 ---------- */
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let page = await mockPage(mobile);
  await page.goto(base + 'index.html');
  await seed(page);
  await quickToReflect(page, base, 'imjin');
  check('3단계에 공개 체크 상자가 없음 (공개는 기록한 뒤 버튼으로 물음) · 입력란 아래 개인정보 주의', !(await page.$('#reflectShareConsent')) &&
    /이름·학교·연락처는 쓰지 마세요/.test(await page.textContent('#reflectHint')));
  await page.fill('#reflectInput', REFLECT);
  check('3단계 가로 넘침 없음', await noHScroll(page));

  /* ---------- 2. 기록 → 카드 화면 맨 위에서 공개 여부를 물음 (아직 공개 안 됨) ---------- */
  await makeCard(page);
  await page.waitForFunction(() => !document.getElementById('sharePrompt').hidden);
  let d = await db(page);
  check('기록하면 비공개로 저장 (입력 그대로)', d.exploration_reflections.length === 1 && d.exploration_reflections[0].content === REFLECT);
  check('카드 화면 맨 위: "내 생각이 기록되었어요" + [공개하기] [나만 간직하기] (스크롤 없이)', /내 생각이 기록되었어요/.test(await page.textContent('#sharePrompt')) &&
    await inViewport(page, '#sharePrompt [data-share-publish]') && await inViewport(page, '#sharePrompt [data-share-keep]') &&
    await page.$eval('#sharePrompt', el => el.getBoundingClientRect().top < document.getElementById('memoryCard').getBoundingClientRect().top));
  check('공개 안내: 익명 · Shared Archive · 나누지 않아도 카드는 그대로', /익명/.test(await page.textContent('#sharePrompt')) && /Shared Archive/.test(await page.textContent('#sharePrompt')) &&
    /나누지 않아도 카드는 그대로/.test(await page.textContent('#sharePrompt')));
  check('누르기 전에는 공동 표현(공개 테이블)에 아무것도 보내지 않음', d.shared_expressions.length === SEED.length &&
    !(await page.evaluate(() => window.__mockDb.calls.some(c => c.op === 'insert' && c.table === 'shared_expressions'))));
  const texts = await entryTexts(page);
  check('카드 화면: 다른 사람들이 남긴 문장 3개', texts.length === 3, JSON.stringify(texts));
  check('공감을 가장 많이 받은 문장이 첫 번째', texts[0] === '공감을 가장 많이 받은 임진왜란 문장', texts[0]);
  check('확인 전(숨김) 문장·다른 사건 문장은 보이지 않음', !texts.some(t => /확인하지 않은|재일조선인/.test(t)));
  check('같은 취지의 안내("옳은 문장이라는 뜻은 아니에요")를 반복하지 않음', !/옳은 문장이라는 뜻은 아니에요/.test(await page.textContent('#archiveEntry')));
  const order = await page.evaluate(() => ['[data-card-action="png"]', '#archiveEntry', '.card-design', '#choiceOthers'].map(s => document.querySelector(s).getBoundingClientRect().top));
  check('카드 화면 순서: 저장 버튼 → 다른 사람들의 문장 → 디자인 고르기 → 객관식 통계', order[0] < order[1] && order[1] < order[2] && order[2] < order[3], JSON.stringify(order.map(Math.round)));
  check('같은 일을 하는 아래 버튼(다른 사람 기억 보기·공개하기)은 기본 체험 카드에서 숨김',
    !(await page.isVisible('.card-builder__next [data-card-action="memory"]')) && !(await page.isVisible('.card-builder__next [data-card-action="publish"]')));
  check('카드 화면 가로 넘침 없음 (문장·버튼 포함)', await noHScroll(page));

  /* ---------- 3. 공감 ---------- */
  const firstBtn = '#archiveEntry [data-entry-empathy="900"]';
  const before = await page.textContent(firstBtn);
  await page.click(firstBtn);
  await page.waitForFunction(() => /공감했어요/.test(document.querySelector('#archiveEntry [data-entry-empathy="900"]').textContent));
  d = await db(page);
  check('공감을 누르면 저장되고 "공감했어요 · 4"', /· 3/.test(before) && /공감했어요\s*·\s*4/.test(await page.textContent(firstBtn)) &&
    d.expression_empathy.filter(e => Number(e.expression_id) === 900).length === 4);
  check('같은 문장에 다시 공감할 수 없음', await page.isDisabled(firstBtn));

  /* ---------- 4. [공개하기] → 심화 탐구와 같은 테이블·방식, '익명'으로 바로 공개 ---------- */
  await page.click('#sharePrompt [data-share-publish]');
  await page.waitForFunction(() => /공동 표현으로 공개되었어요/.test(document.getElementById('sharePrompt').textContent));
  d = await db(page);
  const mine = d.shared_expressions.filter(r => r.content === REFLECT);
  check('[공개하기]를 누르면 공동 표현으로 한 번 등록 (바로 공개 · 숨김 아님)', mine.length === 1 && mine[0].is_hidden !== true, JSON.stringify(mine));
  check('등록 칸: 사건·익명·한국어·쓴 문장 그대로 (닉네임·연령대 없음)', mine[0] && mine[0].author_name === '익명' && mine[0].event_key === 'imjin' &&
    mine[0].country_code === 'ko' && !mine[0].age_group && !('entry_source' in mine[0]));
  check('공개해도 비공개 저장(분석용)은 그대로 한 번만', d.exploration_reflections.filter(r => r.content === REFLECT).length === 1);
  check('공개한 문장이 아카이브(공개 목록)에 바로 들어감', await page.evaluate(async t => (await SharedStore.loadExpressions('imjin')).data.some(x => x.text === t), REFLECT));
  await page.click('[data-card-action="back"]');
  await page.waitForSelector('.page--detail.active');
  await makeCard(page);
  await page.waitForFunction(() => /공동 표현으로 공개되었어요/.test(document.getElementById('sharePrompt').textContent));
  check('같은 문장으로 다시 기록해도 다시 공개하지 않고, 다시 묻지 않음', (await db(page)).shared_expressions.filter(r => r.content === REFLECT).length === 1 &&
    !(await page.$('#sharePrompt [data-share-keep]')));

  /* ---------- 5. 문장을 고치면 다시 물음 · [나만 간직하기] → 공개 안 됨 ---------- */
  const REFLECT2 = REFLECT + ' 그리고 다른 이름도 함께 기억하고 싶다.';
  await page.click('[data-card-action="back"]');
  await page.waitForSelector('.page--detail.active');
  await page.fill('#reflectInput', REFLECT2);
  await makeCard(page);
  await page.waitForFunction(() => !!document.querySelector('#sharePrompt [data-share-keep]'));
  check('고친 문장은 공개 여부를 다시 물음', /이 문장을 공동 표현으로 나눌까요/.test(await page.textContent('#sharePrompt')));
  await page.click('#sharePrompt [data-share-keep]');
  check('[나만 간직하기] → "나만 간직하기" 표시, 공개 안 됨, 마음을 바꿀 수 있음', /나만 간직하기/.test(await page.textContent('#sharePrompt')) &&
    (await db(page)).shared_expressions.filter(r => r.content === REFLECT2).length === 0 && await page.isVisible('#sharePrompt [data-share-publish]'));

  /* ---------- 6. 모든 문장 보기 · 공동 표현 제안하기 ---------- */
  await page.click('#archiveEntry [data-card-action="archive"]');
  await page.waitForSelector('.page--archive.active');
  check('"이 사건의 모든 문장 보기" → Shared Archive(임진왜란)', await page.evaluate(() => archiveEventId === 'imjin'));
  await page.goBack().catch(() => {});
  await page.evaluate(() => { navigateTo('card'); });
  await page.waitForSelector('.page--card.active');
  await page.click('#archiveEntry [data-card-action="propose"]');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(300);
  check('"나도 공동 표현 제안하기" → 심화 · 공동 표현 쓰기, 쓴 문장을 칸에 옮겨 둠', (await page.$eval('.page--detail', el => `${el.dataset.mode}:${el.dataset.step}`)) === 'deep:3' &&
    (await page.inputValue('#userNarrative')) === REFLECT2);
  check('제안하기로 와도 공개 동의는 꺼진 채 (공개는 따로)', !(await page.isChecked('#publishConsent')) &&
    (await db(page)).shared_expressions.filter(r => r.content === REFLECT2).length === 0);
  // 공용 기기: 다음 학생이 새 참여자로 시작하면 이전 학생의 문장·공개 상태·안내가 남지 않음
  page.__dialogAnswer = true;
  await page.click('#flowProgress [data-new-participant]');
  await page.waitForSelector('.page--home.active');
  await quickToReflect(page, base, 'imjin');
  check('새 참여자: 입력란 비어 있음', (await page.inputValue('#reflectInput')) === '');
  await page.fill('#reflectInput', '다음 학생의 생각');
  await makeCard(page);
  await page.waitForFunction(() => !!document.querySelector('#sharePrompt [data-share-publish]'));
  check('새 참여자의 카드 화면은 공개 여부를 새로 물음 (이전 학생의 "공개되었어요"·"나만 간직하기"가 남지 않음)',
    /이 문장을 공동 표현으로 나눌까요/.test(await page.textContent('#sharePrompt')) && !/공개되었어요/.test(await page.textContent('#sharePrompt')) &&
    (await db(page)).shared_expressions.filter(r => r.content === '다음 학생의 생각').length === 0);
  check('휴대폰 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await mobile.close();

  /* ---------- 7. 공개 전 검사(빈칸·링크) · 건너뛰면 묻지 않음 · 공개된 문장이 없는 사건 ---------- */
  const m2 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  page = await mockPage(m2);
  await page.goto(base + 'index.html');
  await quickToReflect(page, base, 'zainichi');
  await makeCard(page);                                           // 건너뛰기
  check('건너뛰면 공개 여부를 묻지 않음 · "고른 관점이 저장되었어요"', !(await page.isVisible('#sharePrompt')) &&
    /고른 관점이 이름 없이 저장되었어요/.test(await page.textContent('#archiveEntry')));
  await page.click('[data-card-action="back"]');
  await page.waitForSelector('.page--detail.active');
  await page.fill('#reflectInput', '세 나라의 기록에서 가장 다르게 느낀 점은 ___이다.');
  await makeCard(page);
  await page.waitForFunction(() => !!document.querySelector('#sharePrompt [data-share-publish]'));
  await page.click('#sharePrompt [data-share-publish]');
  await page.waitForFunction(() => /빈칸/.test(document.getElementById('sharePrompt').textContent));
  d = await db(page);
  check('예시의 빈칸(___)이 남은 문장은 공개하지 않고 안내 (카드·비공개 저장은 그대로)', d.shared_expressions.length === 0 && d.exploration_reflections.length === 1 &&
    /빈칸\(___\)이 남아 있어 공개하지 않았어요/.test(await page.textContent('#sharePrompt')));
  await page.click('[data-card-action="back"]');
  await page.waitForSelector('.page--detail.active');
  await page.fill('#reflectInput', '자세한 내용은 www.example.com 에서');
  await makeCard(page);
  await page.waitForFunction(() => !!document.querySelector('#sharePrompt [data-share-publish]'));
  await page.click('#sharePrompt [data-share-publish]');
  await page.waitForFunction(() => /링크/.test(document.getElementById('sharePrompt').textContent));
  check('링크·연락처가 있으면 공개하지 않음 (심화 탐구와 같은 검사)', (await db(page)).shared_expressions.length === 0);
  check('공개된 문장이 없으면 "아직 공개된 문장이 없어요" + 제안하기 입구', /아직 공개된 문장이 없어요/.test(await page.textContent('#archiveEntry')) &&
    await page.isVisible('#archiveEntry [data-card-action="propose"]'));
  check('작은 화면(360px) 카드 화면 가로 넘침 없음', await noHScroll(page));
  check('공개 전 검사 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await m2.close();

  /* ---------- 8. PC · 심화 탐구 카드에는 입구 없음 ---------- */
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await mockPage(desk);
  await page.goto(base + 'index.html');
  await seed(page);
  await quickToReflect(page, base, 'imjin');
  await makeCard(page);
  check('PC: 카드 화면에 다른 사람들의 문장 3개와 공감 버튼', (await entryTexts(page)).length === 3 &&
    (await page.$$eval('#archiveEntry [data-entry-empathy]', els => els.length)) === 3);
  check('PC(넓은 화면): 문장 칸이 카드 옆 오른쪽 칸 맨 위에, 스크롤 없이 보임', await page.$eval('#archiveEntry', el => el.parentElement.classList.contains('card-builder') && el.parentElement.firstElementChild === el) &&
    await page.$eval('#archiveEntry .archive-entry__title', el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }));
  await page.click('#archiveEntry [data-entry-empathy]:not([disabled])');
  await page.waitForFunction(() => document.querySelectorAll('#archiveEntry .archive-entry__empathy.is-done').length >= 1);
  check('PC: 클릭으로 공감', (await db(page)).expression_empathy.length === 4);
  await page.evaluate(() => { openEventDetail('culture'); });
  await page.waitForSelector('.page--detail.active');
  await page.evaluate(() => { setBefore && setBefore('문화 교류 탐구 전 문장'); });
  await page.evaluate(() => { cardState.after = '문화 교류 탐구 후 문장'; cardState.mode = 'classic'; openCardPage(); });
  await page.waitForSelector('.page--card.active');
  check('심화 탐구(기존 4단계) 카드에는 아카이브 입구가 없음', !(await page.isVisible('#archiveEntry')));
  check('PC 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await desk.close();
});
