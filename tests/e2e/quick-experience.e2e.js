/* 기본 체험(객관식 관점 고르기) — 모바일 중심 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/quick-experience.e2e.js   (전체: npm run test:e2e)
   첫 화면 큰 사건 카드 → 세 나라 비교 → 객관식 질문(한 화면에 하나·정답 없음·건너뛰기) → 한 줄 소감(건너뛰기) → 카드.
   탭 수 · 이전/다음 · 화살표 키 · 답 유지 · 고른 관점과 소감의 구분 · 공개/통계 동의 분리 · 별도 테이블 저장 ·
   소표본 숨김 · SQL 실행 전 · 심화 탐구 전환과 복귀 · 다른 사건은 기존 흐름 · 새 참여자 초기화 · 가로 넘침 · 오류 */
'use strict';
const fs = require('node:fs');
const { run } = require('./harness');

const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const step = page => page.$eval('.page--detail', el => `${el.dataset.mode}:${el.dataset.step}`);
const visibleMains = page => page.$$eval('#stepCta [data-step-main]', els => els.filter(b => !b.hidden && b.offsetParent !== null).map(b => b.dataset.stepMain));
const options = page => page.$$eval('#choiceStep [data-choice-option]', els => els.map(e => e.dataset.choiceOption));
const db = page => page.evaluate(() => window.__mockDb.read());
const pngSize = buf => ({ png: buf.slice(1, 4).toString() === 'PNG', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
const inViewport = (page, sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.width > 0; });

run('quick-experience', async ({ browser, base, check, mockPage }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  let page = await mockPage(mobile);
  let taps = 0;
  const tap = async sel => { taps += 1; await page.click(sel); };

  /* ---------- 1. 첫 화면 → 사건 카드 하나로 바로 시작 ---------- */
  await page.goto(base + 'index.html');
  await page.waitForTimeout(800);
  check('첫 화면: 임진왜란·재일조선인 큰 카드가 스크롤 없이 보임', await inViewport(page, '[data-quick-event="imjin"]') && await inViewport(page, '[data-quick-event="zainichi"]'));
  const pickH = await page.$$eval('.quick-pick', els => els.map(e => e.getBoundingClientRect().height));
  check('사건 카드 터치 높이 48px 이상', pickH.every(h => h >= 48), JSON.stringify(pickH));
  check('첫 화면에 "3–5분 · 익명 · 로그인 없음 · 정답 없음"', /3–5분[\s\S]*익명[\s\S]*로그인 없음[\s\S]*정답 없음/.test(await page.$eval('.hero__meta', el => el.innerText)));
  check('모바일 첫 화면 가로 넘침 없음', await noHScroll(page));
  check('사건 카드 위에 "어떤 역사부터 볼까요?" · 임진왜란에 "처음이라면 여기부터"', await page.isVisible('#quickPicksLabel') &&
    /처음이라면 여기부터/.test(await page.textContent('[data-quick-event="imjin"]')) && !(await page.textContent('[data-quick-event="zainichi"]')).includes('처음이라면'));
  // 상단 "참여하기"는 기본 체험 사건 카드로 (사건 목록·연령대가 아님)
  await page.evaluate(() => navigateTo('archive'));
  await page.click('.nav__menu a[data-view="participate"]');
  await page.waitForSelector('.page--home.active');
  await page.waitForTimeout(700);
  check('상단 "참여하기" → 첫 화면 사건 카드, 첫 카드에 초점 (연령대·사건 목록 아님)',
    await inViewport(page, '[data-quick-event="imjin"]') && await page.evaluate(() => document.activeElement && document.activeElement.dataset.quickEvent === 'imjin') &&
    !(await page.isVisible('#agePicker')) && !(await page.isVisible('.page--events.active')));
  await page.evaluate(() => window.scrollTo(0, 0));

  await tap('[data-quick-event="imjin"]');
  await page.waitForSelector('.page--detail.active');
  check('카드 한 번으로 사건 화면 (연령대 묻지 않음)', !(await page.isVisible('#agePicker')) && (await step(page)) === 'quick:1');
  check('STEP 1 · 세 나라 비교: 서술이 바로 보이고, 탐구 전 문장·탭은 숨김',
    await page.isVisible('#narrativesGrid') && !(await page.isVisible('#beforeCard')) && !(await page.isVisible('.tabs')) &&
    /세 나라 비교/.test(await page.$eval('#flowProgress .flow-progress__step.is-current', el => el.innerText)));
  check('첫 화면 안에서 서술이 시작됨 (스크롤 없이 한국 서술 제목이 보임)', await inViewport(page, '#narrativesGrid .narrative-card__title'));
  check('단계 표시는 위쪽 한 곳만 (아래 버튼의 STEP 글자·중복 제목 숨김)', !(await page.isVisible('#stepCtaStep')) && !(await page.isVisible('#flowProgress .stepper__count')) &&
    !(await page.isVisible('[data-tab-content="compare"] .step-head')));
  check('키워드·근거 자료·연표·NLP 카드는 기본 체험에서 접어 둠 (심화 탐구에 그대로)', !(await page.isVisible('.narrative-card__more')) && !(await page.isVisible('#timelineBox')) &&
    !(await page.isVisible('.sum-card--common')) && await page.isVisible('.sum-card--names') && await page.isVisible('.quick-scope'));
  const s1 = await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
  check('STEP 1 길이 2.5화면 이하', s1 <= 2.5, s1.toFixed(2));
  check('주요 버튼 하나(관점 고르러 가기) · 이전 버튼 없음', JSON.stringify(await visibleMains(page)) === '["q1"]' && !(await page.isVisible('[data-step-back]')));
  check('심화 탐구 입구가 보임 (AI·분석·사료는 그대로)', await page.isVisible('[data-deep-switch="2"]'));
  check('주소에 사건 링크', await page.evaluate(() => location.hash === '#/e/imjin'));

  /* ---------- 2. 관점 고르기: 한 화면에 질문 하나 ---------- */
  await tap('[data-step-main="q1"]');
  await page.waitForTimeout(400);
  check('STEP 2 · 질문 1/3', (await step(page)) === 'quick:2' && /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)));
  check('"정답은 없어요" 안내', /정답은 없어요/.test(await page.$eval('#choiceStep', el => el.textContent)));
  const q1 = await options(page);
  check('선택지 4개, 처음에는 아무것도 선택되지 않음', q1.length === 4 && (await page.$$eval('#choiceStep [aria-checked="true"]', els => els.length)) === 0);
  check('선택지는 라디오 묶음 · 높이 48px 이상', await page.$eval('#choiceStep .choice-options', el => el.getAttribute('role') === 'radiogroup') &&
    (await page.$$eval('#choiceStep .choice-option', els => els.every(e => e.getBoundingClientRect().height >= 48))));
  check('질문·선택지·다음 버튼이 한 화면에', await inViewport(page, '#choicePrompt') && await inViewport(page, `[data-choice-option="${q1[3]}"]`) && await inViewport(page, '[data-step-main="q2"]'));
  check('고르기 전 아래 버튼은 "이 질문 건너뛰기" (덜 눈에 띄게)', /이 질문 건너뛰기/.test(await page.textContent('[data-step-main="q2"]')) &&
    await page.$eval('[data-step-main="q2"]', el => el.classList.contains('step-cta__main--quiet')));
  check('안내: 고른 뒤 "다음 질문"을 누르고, 넘어가기 전에는 바꿀 수 있음', /고른 뒤 아래 ‘다음 질문’을 눌러/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    /바꿀 수 있어요/.test(await page.$eval('#choiceStep', el => el.textContent)));
  // 키보드: 화살표로 선택만 바뀜
  await page.focus(`[data-choice-option="${q1[0]}"]`);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  check('화살표 키로는 선택만 바뀌고 다음 질문으로 넘어가지 않음', /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    (await page.$$eval('#choiceStep [aria-checked="true"]', els => els.length)) === 1);
  // 누르면 체크만 — 화면은 그대로 (자동으로 넘어가지 않음)
  await tap('[data-choice-option="responsibility"]');
  await page.waitForTimeout(800);
  check('선택지를 누르면 체크 표시만, 0.8초 뒤에도 질문 1/3 그대로', /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    await page.$eval('[data-choice-option="responsibility"]', el => el.getAttribute('aria-checked') === 'true' && el.classList.contains('is-selected')));
  check('고르면 아래 버튼이 "다음 질문"(강조)으로 바뀜', (await page.textContent('[data-step-main="q2"]')).trim().startsWith('다음 질문') &&
    !(await page.$eval('[data-step-main="q2"]', el => el.classList.contains('step-cta__main--quiet'))));
  // 다음 버튼을 누르기 전에는 자유롭게 바꿀 수 있음 (하나만 선택)
  await page.click('[data-choice-option="suffering"]');
  await page.click('[data-choice-option="many_names"]');
  await page.waitForTimeout(400);
  check('다음을 누르기 전 선택 바꾸기: 마지막에 고른 하나만 선택됨, 여전히 질문 1/3', /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    JSON.stringify(await page.$$eval('#choiceStep [aria-checked="true"]', els => els.map(e => e.dataset.choiceOption))) === '["many_names"]');
  check('질문·선택지·다음 버튼이 한 화면에 (고른 뒤에도)', await inViewport(page, '#choicePrompt') && await inViewport(page, `[data-choice-option="${q1[3]}"]`) && await inViewport(page, '[data-step-main="q2"]'));
  await tap('[data-step-main="q2"]');                               // 다음 질문
  await page.waitForTimeout(300);
  check('"다음 질문"을 눌러야 질문 2/3으로 이동 · 새 질문은 아무것도 선택되지 않음', /질문 2\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    (await page.$$eval('#choiceStep [aria-checked="true"]', els => els.length)) === 0 && /이 질문 건너뛰기/.test(await page.textContent('[data-step-main="q2"]')));
  await tap('[data-step-main="q2"]');                               // 2번은 고르지 않고 넘어감 (건너뛰기)
  await page.waitForTimeout(300);
  check('질문 3/3 · 고르기 전 마지막 버튼 "이 질문 건너뛰고 소감 쓰기"', /질문 3\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    /이 질문 건너뛰고 소감 쓰기/.test(await page.textContent('[data-step-main="q2"]')));
  check('마지막 질문 안내는 "한 줄 소감 쓰러 가기"', /‘한 줄 소감 쓰러 가기’를 눌러/.test(await page.$eval('#choiceStep', el => el.textContent)));
  await tap('[data-choice-option="side_by_side"]');
  await page.waitForTimeout(600);
  check('마지막 질문에서 고르면 버튼이 "한 줄 소감 쓰러 가기" · 자동으로 넘어가지 않음', (await step(page)) === 'quick:2' &&
    (await page.textContent('[data-step-main="q2"]')).trim().startsWith('한 줄 소감 쓰러 가기'));
  await page.click('[data-step-back]');
  await page.click('[data-step-back]');
  check('이전 버튼으로 질문 1로 돌아가도 고른 답 유지 · 버튼 "다음 질문"', /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    await page.$eval('[data-choice-option="many_names"]', el => el.getAttribute('aria-checked') === 'true') &&
    (await page.textContent('[data-step-main="q2"]')).trim().startsWith('다음 질문'));
  await page.click('[data-step-main="q2"]');
  await page.click('[data-step-main="q2"]');
  check('다시 질문 3: 고른 답 유지', await page.$eval('[data-choice-option="side_by_side"]', el => el.getAttribute('aria-checked') === 'true'));
  check('관점 고르기 화면 가로 넘침 없음', await noHScroll(page));
  await tap('[data-step-main="q2"]');                               // 한 줄 소감 쓰러 가기
  await page.waitForFunction(() => document.querySelector('.page--detail').dataset.step === '3');
  await page.waitForTimeout(300);

  /* ---------- 3. 한 줄 소감 (건너뛰기 가능) ---------- */
  check('STEP 3 · 한 줄 소감', (await step(page)) === 'quick:3' && await page.isVisible('#reflectInput'));
  const recap = await page.$eval('#reflectRecap', el => el.innerText);
  check('내가 고른 관점 다시 보기 (건너뛴 질문은 없음)', /서로 다른 이름을 함께 보여 주는 것/.test(recap) && /서로 다른 이름과 시선/.test(recap) && !/꼭 기억할 장면/.test(recap), recap);
  check('동의 상자 없음 · 소감 바로 아래에 "이름 없이 저장 · 다른 참여자에게 비공개" 안내', !(await page.$('#choiceShareConsent')) &&
    /이름 없이 저장되어 프로젝트 분석에 쓰여요/.test(await page.textContent('#reflectHint')) && /공개되지 않아요/.test(await page.textContent('#reflectHint')) &&
    await page.isVisible('#reflectHint'));
  check('소감 입력란 이름 "내 카드에 남길 소감" · 카드에 담긴다는 안내', /내 카드에 남길 소감/.test(await page.textContent('label[for="reflectInput"]')) &&
    await page.isVisible('label[for="reflectInput"]') && /My Memory Card/.test(await page.textContent('#reflectStep .step-head__desc')));
  check('소감 입력란이 첫 화면 안에 보임 (모바일)', await inViewport(page, '#reflectInput'));
  check('버튼은 하나: 소감이 비어 있으면 "소감 없이 카드 만들기"', JSON.stringify(await visibleMains(page)) === '["q3"]' &&
    /소감 없이 카드 만들기/.test(await page.textContent('[data-step-main="q3"]')) && !(await page.$('[data-reflect-skip]')));
  await page.fill('#reflectInput', '가');
  const typedLabel = await page.textContent('[data-step-main="q3"]');
  await page.fill('#reflectInput', '');
  check('한 글자라도 쓰면 "My Memory Card 만들기"', /My Memory Card 만들기/.test(typedLabel));
  await tap('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  check(`첫 화면부터 카드까지 탭 ${taps}번 (사용법 설명 없이 · 8번 이하: 고르기와 다음을 따로 누름)`, taps <= 8, String(taps));

  /* ---------- 4. 카드: 고른 관점(객관식)과 직접 쓴 소감 구분 ---------- */
  await page.waitForTimeout(500);
  const labels = await page.$$eval('#memoryCard .memory-card__label', els => els.map(e => e.textContent));
  check('카드 칸 이름: "내가 고른 관점 · 객관식" / "나의 한 줄 소감 · 직접 쓴 문장"', labels.includes('내가 고른 관점 · 객관식') && labels.includes('나의 한 줄 소감 · 직접 쓴 문장') &&
    !labels.some(l => /탐구 전/.test(l)), labels.join(' | '));
  const picked = await page.$$eval('#memoryCard .memory-card__choices li span', els => els.map(e => e.textContent));
  check('카드에 고른 관점 2개만 (건너뛴 질문 없음)', JSON.stringify(picked) === JSON.stringify(['서로 다른 이름을 함께 보여 주는 것', '서로 다른 이름과 시선']), JSON.stringify(picked));
  check('소감을 건너뛰면 "소감은 남기지 않았어요" (지어내지 않음)', /소감은 남기지 않았어요/.test(await page.$eval('#memoryCard .memory-card__reflect', el => el.textContent)));
  const stamps = await page.$$eval('#memoryCard .memory-card__stamps li', els => els.map(e => [e.textContent.trim().slice(1, 6), e.classList.contains('is-done')]));
  check('도장: 관점 고르기 ✓, 한 줄 소감 ✗, 공개 ✗', stamps[1][1] === true && stamps[2][1] === false && stamps[3][1] === false, JSON.stringify(stamps));
  await page.waitForFunction(() => window.__mockDb.read().exploration_choices.length === 2);
  let d = await db(page);
  check('카드를 만들면 동의 상자 없이 객관식 답 저장 (건너뛴 질문 제외) · 공동 표현은 0건', JSON.stringify(d.exploration_choices.map(r => [r.question_id, r.option_id])) === JSON.stringify([['name_focus', 'many_names'], ['textbook_line', 'side_by_side']]) &&
    d.shared_expressions.length === 0, JSON.stringify(d.exploration_choices));
  check('소감을 건너뛰면 소감은 저장하지 않음 (빈 소감 행 없음)', d.exploration_reflections.length === 0);
  const firstSubmission = d.exploration_choices[0].submission_id;
  check('같은 카드의 객관식 답은 하나의 무작위 묶음 번호(UUID)', /^[0-9a-f-]{36}$/.test(firstSubmission || '') && d.exploration_choices.every(r => r.submission_id === firstSubmission));
  check('카드 화면 가로 넘침 없음', await noHScroll(page));
  const order = await page.evaluate(() => ['#memoryCard', '[data-card-action="png"]', '.card-design'].map(sel => document.querySelector(sel).getBoundingClientRect().top));
  check('카드가 먼저, 저장 버튼, 그다음 디자인 고르기', order[0] < order[1] && order[1] < order[2], JSON.stringify(order.map(Math.round)));
  check('저장 버튼이 스크롤 없이 보임 (휴대폰 아래 고정)', await inViewport(page, '[data-card-action="png"]'));
  check('기본 체험 카드 화면: 진행 표시·심화용 "카드 다듬기"는 숨김, 돌아가기는 "한 줄 소감 고치기"', !(await page.isVisible('#cardProgress')) &&
    !(await page.isVisible('#discoveryOptions')) && /한 줄 소감 고치기/.test(await page.textContent('[data-card-action="back"]')));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-card-action="png"]')]);
  const png = pngSize(fs.readFileSync(await dl.path()));
  check('기본 체험 카드도 PNG 저장 (1080px)', png.png && png.width === 1080 && png.height >= 1350, JSON.stringify(png));

  /* ---------- 5. 소감을 쓰면 → 비공개 테이블에 같은 묶음 번호로 저장 ---------- */
  await page.click('[data-card-action="back"]');
  await page.waitForSelector('.page--detail.active');
  check('카드에서 돌아오면 STEP 3, 고른 관점 그대로', (await step(page)) === 'quick:3' && /서로 다른 이름을 함께 보여 주는 것/.test(await page.$eval('#reflectRecap', el => el.innerText)));
  const REFLECT = '이름 하나에도 각 나라가 이 전쟁을 보는 눈이 담겨 있다는 게 새로웠다.';
  await page.fill('#reflectInput', REFLECT);
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => window.__mockDb.read().exploration_reflections.length === 1);
  check('카드에 직접 쓴 소감이 입력 그대로', (await page.$eval('#memoryCard .memory-card__reflect blockquote', el => el.textContent)) === `“${REFLECT}”`);
  d = await db(page);
  check('소감은 입력 그대로, 같은 카드의 객관식 답과 같은 묶음 번호로 저장', d.exploration_reflections[0].content === REFLECT &&
    d.exploration_reflections[0].event_key === 'imjin' && d.exploration_reflections[0].submission_id === firstSubmission);
  check('같은 답이면 객관식은 다시 보내지 않음 (2행 그대로)', d.exploration_choices.length === 2);
  const sentChoices = await page.evaluate(() => window.__mockDb.calls.filter(c => c.op === 'insert' && c.table === 'exploration_choices').flatMap(c => c.rows));
  const sentReflections = await page.evaluate(() => window.__mockDb.calls.filter(c => c.op === 'insert' && c.table === 'exploration_reflections').flatMap(c => c.rows));
  check('보낸 객관식 행: 사건·질문·선택지 id·묶음 번호만 (소감·닉네임·참여자 키 없음)', sentChoices.length > 0 && sentChoices.every(r => Object.keys(r).sort().join() === 'event_key,option_id,question_id,submission_id'));
  check('보낸 소감 행: 사건·묶음 번호·소감만 (닉네임·연령대·참여자 키 없음)', sentReflections.length === 1 && Object.keys(sentReflections[0]).sort().join() === 'content,event_key,submission_id');
  check('소감은 공동 표현으로 등록되지 않음 (다른 참여자에게 공개되지 않음)', d.shared_expressions.length === 0 && !JSON.stringify(d.shared_expressions).includes(REFLECT));
  check('질문별 응답 5명 미만이면 결과 숨김', /5명 미만/.test(await page.$eval('#choiceOthers', el => el.textContent)));
  await page.click('[data-card-action="back"]');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForTimeout(400);
  d = await db(page);
  check('같은 답·같은 소감으로 카드를 다시 만들어도 중복 저장하지 않음', d.exploration_choices.length === 2 && d.exploration_reflections.length === 1);
  await page.click('[data-card-action="back"]');
  await page.fill('#reflectInput', REFLECT + ' 고쳐 씀');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => window.__mockDb.read().exploration_reflections.length === 2);
  d = await db(page);
  check('소감을 고쳐 다시 만들면 고친 소감만 새로 저장 (같은 묶음 번호)', d.exploration_reflections[1].content === REFLECT + ' 고쳐 씀' &&
    d.exploration_reflections[1].submission_id === firstSubmission && d.exploration_choices.length === 2);
  // 참여자 수: 공동 표현 없이 객관식만 동의해 보낸 참여도 1명으로 셈 (한 번에 보낸 응답 묶음 = 1)
  await page.evaluate(() => loadParticipantCount());
  await page.waitForFunction(() => !document.getElementById('participantCount').hidden);
  check('객관식만 보낸 참여도 첫 화면 참여자 수에 포함 (응답 2개 = 1명)', /현재 1명이/.test(await page.$eval('#participantCount', el => el.textContent)),
    await page.$eval('#participantCount', el => el.textContent));

  // 다른 참여자들의 응답이 모였을 때 (가짜 DB에 직접 추가 — 서버 집계와 같은 규칙)
  await page.evaluate(() => {
    const raw = JSON.parse(sessionStorage.getItem('__mock_db'));
    ['many_names', 'many_names', 'responsibility', 'suffering'].forEach(o => raw.exploration_choices.push({ event_key: 'imjin', question_id: 'name_focus', option_id: o }));
    sessionStorage.setItem('__mock_db', JSON.stringify(raw));
  });
  await page.evaluate(() => renderChoiceOthers(null));
  await page.waitForFunction(() => /내 선택/.test(document.getElementById('choiceOthers').textContent));
  const others = await page.$eval('#choiceOthers', el => el.innerText);
  check('5명 이상 모인 질문은 비율과 "내 선택" 표시 (이름 질문 5명: 60%)', /\(5명\)/.test(others) && /60%/.test(others) && /내 선택/.test(others), others);
  check('"많이 고른 관점이 옳다는 뜻은 아니에요" 안내', /옳다는 뜻은 아니에요/.test(others));

  /* ---------- 6. 심화 탐구로 전환 → 공동 표현은 기존 공개 동의 그대로 ---------- */
  await page.click('[data-card-action="back"]');
  await page.click('[data-deep-switch="3"]');
  await page.waitForTimeout(300);
  check('심화 탐구 전환: 공동 표현 쓰기(기존 STEP 3), 탭 보임', (await step(page)) === 'deep:3' && await page.isVisible('.tabs') && await page.isVisible('#userNarrative'));
  check('쓴 소감(고친 최신 문장)을 공동 표현 칸에 옮겨 줌 (공개 전)', (await page.inputValue('#userNarrative')) === REFLECT + ' 고쳐 씀' && (await db(page)).shared_expressions.length === 0);
  await page.click('#submitNarrative');
  check('공개 등록은 여전히 별도 동의가 있어야 함', (await db(page)).shared_expressions.length === 0 && /동의 상자에 체크/.test(await page.$eval('#submitStatus', el => el.textContent)));
  await page.click('[data-quick-return]');
  await page.waitForTimeout(300);
  check('"기본 체험으로 돌아가기": 관점 고르기로, 고른 답 유지', (await step(page)) === 'quick:2' && (await page.$$eval('#choiceStep [aria-checked="true"]', els => els.length)) === 1);
  check('모바일 기본 체험 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));

  /* ---------- 7. 새 참여자로 시작 → 선택·소감·동의 지움 ---------- */
  page.__dialogAnswer = true;
  await page.click('#flowProgress [data-new-participant]');
  await page.waitForSelector('.page--home.active');
  check('새 참여자: 고른 답·소감·묶음 번호를 지움', await page.evaluate(() => Object.keys(choiceState.answers).length === 0 && choiceState.reflection === '' &&
    choiceState.submissionId === null && document.getElementById('reflectInput').value === ''));
  await mobile.close();

  /* ---------- 8. QR 링크 · 다른 사건 · SQL 실행 전 (휴대폰) ---------- */
  const m2 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  page = await mockPage(m2);
  await page.goto(base + 'index.html#/e/zainichi');
  await page.waitForSelector('.page--detail.active');
  check('QR 링크(재일조선인)도 기본 체험 STEP 1', (await step(page)) === 'quick:1');
  await page.click('[data-step-main="q1"]');
  const zq = await page.$eval('#choicePrompt', el => el.textContent);
  check('재일조선인 질문 1', /가장 먼저 다뤄야/.test(zq), zq);
  await page.evaluate(() => { window.__mockDb.noChoiceTable = true; });
  await page.dblclick('[data-choice-option="legal_status"]');          // 두 번 빨리 눌러도 선택만 유지, 넘어가지 않음
  await page.waitForTimeout(600);
  check('작은 화면에서 선택지를 두 번 눌러도 질문 1/3 그대로 · 선택 유지', /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    await page.$eval('[data-choice-option="legal_status"]', el => el.getAttribute('aria-checked') === 'true'));
  check('작은 화면(360×740)에서도 고른 뒤 "다음 질문" 버튼이 보임', await inViewport(page, '[data-step-main="q2"]') &&
    (await page.textContent('[data-step-main="q2"]')).trim().startsWith('다음 질문'));
  for (let i = 0; i < 3; i++) await page.click('[data-step-main="q2"]');   // 다음 → 건너뛰기 → 건너뛰고 소감
  await page.fill('#reflectInput', '테이블이 없어도 카드는 만들어져야 한다');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForTimeout(600);
  check('객관식 SQL 실행 전이어도 카드는 그대로 · 오류 안내 없음', /국적과 법적 지위가 바뀐 과정/.test(await page.$eval('#memoryCard', el => el.textContent)) &&
    !/저장하지 못했어요/.test(await page.$eval('#choiceOthers', el => el.textContent)));
  check('작은 화면(360px) 카드 가로 넘침 없음', await noHScroll(page));

  await page.goto(base + 'index.html#/e/culture');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(300);
  check('질문이 없는 사건(문화 교류)은 기존 심화 탐구 그대로 (STEP 1 탐구 전 문장)', (await step(page)) === 'deep:1' && await page.isVisible('#beforeInput') && !(await page.isVisible('[data-quick-return]')));
  check('QR·다른 사건 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await m2.close();

  /* ---------- 9. 사건 목록(전체 탐구)으로 열면 기존 심화 탐구 ---------- */
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await mockPage(desk);
  await page.goto(base + 'index.html');
  await page.evaluate(() => { localStorage.setItem('sm_age_group', '20s'); });
  await page.click('#startButton');
  // 이 기기에 연령대 기록이 있으므로 공용 기기 확인 창이 먼저 뜹니다 → 같은 학생으로 이어서
  if (await page.isVisible('#participantGate')) await page.click('[data-gate-choice="continue"]');
  await page.waitForSelector('.page--events.active');
  await page.click('.event-card[data-event-id="imjin"]');
  await page.waitForSelector('.page--detail.active');
  check('사건 목록에서 고른 임진왜란은 심화 탐구 STEP 1 (기존 흐름)', (await step(page)) === 'deep:1' && await page.isVisible('#beforeInput'));
  check('심화 탐구에서도 기본 체험으로 갈 수 있음', await page.isVisible('[data-quick-return]'));
  // PC(마우스): 관점 고르기도 고른 뒤 '다음 질문'을 눌러야 넘어감
  await page.click('[data-quick-return]');
  await page.waitForTimeout(300);
  if ((await step(page)) === 'quick:1') await page.click('[data-step-main="q1"]');
  await page.waitForSelector('#choiceStep [data-choice-option]');
  const deskFirst = (await options(page))[2];
  await page.click(`[data-choice-option="${deskFirst}"]`);
  await page.waitForTimeout(800);
  check('PC: 선택지를 클릭하면 체크만, 질문 1/3 그대로 · 버튼 "다음 질문"', /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    await page.$eval(`[data-choice-option="${deskFirst}"]`, el => el.getAttribute('aria-checked') === 'true') &&
    (await page.textContent('[data-step-main="q2"]')).trim().startsWith('다음 질문') && await inViewport(page, '[data-step-main="q2"]'));
  await page.click('[data-step-main="q2"]');
  await page.waitForTimeout(300);
  check('PC: "다음 질문"을 클릭하면 질문 2/3', /질문 2\/3/.test(await page.$eval('#choiceStep', el => el.textContent)));
  check('데스크톱에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await desk.close();
});
