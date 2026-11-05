/* 사용자 피드백 1차 반영 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/feedback-round1.e2e.js   (전체: npm run test:e2e)
   · 처음 온 사람을 위한 진행 안내: 첫 진입에 한 번 · 초점·Esc·바깥 누르기 · '? 진행 방법'으로 다시 열기 · 공용 기기 기록으로 세지 않음 · 새 참여자는 다시 봄
   · 이름의 뜻(임진왜란·재일조선인) · 휴대폰 360px에서 화면이 넓어지지 않음(페이지 전체가 줄어들거나 글자가 잘리지 않음)
   · 탭이 화면 안에서 줄바꿈 · 기술 용어가 화면에 바로 보이지 않음 · 닉네임 이유별 안내 */
'use strict';
const { run } = require('./harness');

const step = page => page.$eval('.page--detail', el => `${el.dataset.mode}:${el.dataset.step}`);
const guideOpen = page => page.$eval('#flowGuide', el => !el.hidden);
/** 휴대폰 브라우저가 페이지를 넓히지 않았는지 (넓히면 innerWidth 가 화면 폭보다 커짐) */
const fitsPhone = (page, w) => page.evaluate(w => window.innerWidth === w && document.documentElement.scrollWidth <= w + 1, w);

run('feedback-round1', async ({ browser, base, check, mockPage }) => {
  /* ---------- 1. 진행 안내 ---------- */
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let page = await mockPage(mobile, { guide: true });
  await page.goto(base + 'index.html');
  await page.waitForTimeout(500);
  check('첫 화면에서는 안내가 뜨지 않음', !(await guideOpen(page)));
  await page.click('[data-quick-event="imjin"]');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(200);
  check('기본 체험에 처음 들어오면 진행 안내가 뜸 (4단계 · 약 4분)', await guideOpen(page) &&
    (await page.$$eval('#flowGuide .flow-guide__steps li', els => els.length)) === 4 && /약 4분/.test(await page.textContent('#flowGuide')));
  check('안내가 뜨면 "시작하기"에 초점', await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-guide-close]')));
  await page.keyboard.press('Tab');
  check('Tab을 눌러도 초점이 안내 밖으로 나가지 않음', await page.evaluate(() => !!document.activeElement.closest('#flowGuide')));
  const box = await page.$eval('#flowGuide .flow-guide__card', el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight; });
  check('안내 상자가 휴대폰 화면 안에 다 보임', box);
  await page.keyboard.press('Escape');
  check('Esc로 닫힘 → 세 나라 비교 그대로', !(await guideOpen(page)) && (await step(page)) === 'quick:1');
  check('안내를 봤다는 표시는 공용 기기의 "이전 참여 기록"으로 세지 않음', await page.evaluate(() => !SharedStore.hasParticipantState()));
  await page.click('#flowProgress [data-guide-open]');
  check('"? 진행 방법"으로 다시 열 수 있음', await guideOpen(page));
  await page.click('#flowGuide [data-guide-close]');
  check('"시작하기"로 닫힘', !(await guideOpen(page)));
  await page.click('#flowProgress [data-guide-open]');
  await page.mouse.click(5, 5);                                         // 상자 바깥(어두운 배경)
  check('바깥을 눌러도 닫힘', !(await guideOpen(page)));
  await page.goto(base + 'index.html#/e/zainichi');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(200);
  check('한 번 본 뒤에는 다른 사건에 들어가도 다시 뜨지 않음', !(await guideOpen(page)));

  /* ---------- 2. 이름의 뜻 ---------- */
  const names = await page.$$eval('.sum-card--names .sum-card__name-note', els => els.map(e => e.textContent));
  check('재일조선인: 세 이름마다 뜻 한 줄', names.length === 3 && /일본에 사는/.test(names[0]), JSON.stringify(names));
  await page.goto(base + 'index.html#/e/imjin');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(300);
  const imjin = await page.$$eval('.sum-card--names li', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
  check('임진왜란: 文禄·慶長の役 옆에 ‘역(役)’의 뜻', imjin.length === 3 && /文禄·慶長の役.*역\(役\).*전쟁·군사 동원/.test(imjin[1]), JSON.stringify(imjin));
  check('이름의 뜻이 기본 체험 첫 화면(세 나라 비교)에서 보임', await page.isVisible('.sum-card--names .sum-card__name-note'));

  /* ---------- 3. 새 참여자는 안내를 다시 봄 ---------- */
  page.__dialogAnswer = true;
  await page.click('#flowProgress [data-new-participant]').catch(() => {});
  await page.evaluate(() => { if (!document.querySelector('.page--home.active')) startAsNewParticipant(); });
  await page.waitForSelector('.page--home.active');
  await page.click('[data-quick-event="imjin"]');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(200);
  check('새 참여자로 시작하면 다음 학생은 안내를 다시 봄', await guideOpen(page));
  check('안내·이름 뜻 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await mobile.close();

  /* ---------- 4. 휴대폰 360px: 어느 화면도 페이지가 넓어지지 않음 · 탭 줄바꿈 · 기술 용어 ---------- */
  const small = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  page = await mockPage(small);
  await page.goto(base + 'index.html');
  const wide = [];
  const look = async name => { await page.waitForTimeout(350); if (!(await fitsPhone(page, 360))) wide.push(name + ':' + (await page.evaluate(() => window.innerWidth))); };
  await look('home');
  await page.click('[data-quick-event="imjin"]'); await page.waitForSelector('.page--detail.active'); await look('세 나라 비교');
  const quickText = await page.$eval('.page--detail', el => el.innerText);
  check('기본 체험 화면에 기술 용어(NLP·TF-IDF·Supabase)가 보이지 않음', !/NLP|TF-IDF|Supabase|코사인/.test(quickText));
  await page.click('[data-step-main="q1"]'); await look('관점 고르기');
  for (let i = 0; i < 3; i++) { await page.click('#choiceStep [data-choice-option]'); await page.click('[data-step-main="q2"]'); await page.waitForTimeout(250); }
  await look('한 줄 소감');
  await page.fill('#reflectInput', '이름 하나에도 시선이 담겨 있다');
  await page.click('[data-step-main="q3"]'); await page.waitForSelector('.page--card.active'); await look('카드');
  await page.evaluate(() => { navigateTo('detail'); setExploreMode('deep'); gotoStep(2); });
  for (const t of ['compare', 'fourth', 'ai', 'keywords', 'sources', 'shared', 'memory']) {
    await page.evaluate(t => switchTab(t), t);
    if (t === 'ai') await page.click('#aiAnalyzeBtn');
    await look('심화-' + t);
  }
  check('휴대폰 360px: 기본 체험·카드·심화 탭 7개 모두 화면이 넓어지지 않음 (빈자리 표 포함)', wide.length === 0, wide.join(', '));
  const tabs = await page.$$eval('.tabs .tab', els => els.map(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
  check('심화 탭 7개가 줄바꿈되어 모두 화면 안에 (반쯤 잘린 탭 없음)', tabs.length === 7 && tabs.every(Boolean));
  await page.evaluate(() => switchTab('ai'));
  const aiText = await page.$eval('[data-tab-content="ai"] .ai-box__intro', el => el.innerText);
  check('분석 탭 첫머리는 쉬운 말, 기술 이름은 "분석 방법 자세히"를 열어야 보임', !/TF-IDF|NLP/.test(aiText) && /단어를 세어/.test(aiText) &&
    /TF-IDF/.test(await page.$eval('.method-note', el => el.textContent)) && !(await page.$eval('.method-note', el => el.open)));

  /* ---------- 5. 닉네임 이유별 안내 ---------- */
  await page.evaluate(() => switchTab('shared'));
  const tryNick = async (nick) => {
    await page.fill('#userName', nick);
    await page.fill('#userNarrative', '세 나라가 함께 읽을 수 있는 문장을 만들고 싶다.');
    await page.check('#publishConsent').catch(() => {});
    await page.click('#submitNarrative');
    await page.waitForTimeout(200);
    return page.$eval('#submitStatus', el => el.textContent);
  };
  const before = (await page.evaluate(() => window.__mockDb.read().shared_expressions.length));
  check('닉네임 "운영자" → 운영자 행세 안내', /운영자·관리자처럼 보이는 닉네임/.test(await tryNick('운영자')));
  check('닉네임 비하어 → 욕설·비하 안내', /낮추는 말은 닉네임으로 쓸 수 없어요/.test(await tryNick('쪽바리')));
  check('닉네임 학교 이름 → 학교 안내', /학교 이름을 넣을 수 없어요/.test(await tryNick('서울고등학교 민지')));
  check('막힌 닉네임은 하나도 등록되지 않음', (await page.evaluate(() => window.__mockDb.read().shared_expressions.length)) === before);
  check('휴대폰 360px 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await small.close();

  /* ---------- 6. 첫 화면: 목적 한 줄 · 왜 Shared Memory인가 · 지금까지 쌓인 기록(실제 집계) ---------- */
  const seedRecord = p => p.evaluate(() => {
    const raw = window.__mockDb.read();
    for (let i = 0; i < 12; i++) raw.shared_expressions.push({ id: 700 + i, event_key: 'imjin', author_name: '익명', content: '문장 ' + i, created_at: new Date().toISOString() });
    for (let i = 0; i < 30; i++) raw.participation_pings.push({ event_key: 'imjin', participant_key: 'seed-p' + i, created_at: new Date().toISOString() });
    sessionStorage.setItem('__mock_db', JSON.stringify(raw));
  });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await mockPage(phone);
  await page.goto(base + 'index.html');
  await seedRecord(page);
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('whyLive').hidden);
  const inView = sel => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
  check('휴대폰 첫 화면(스크롤 없이): 목적 한 줄과 사건 카드 두 장이 함께 보임', await inView('.hero__mission') && await inView('[data-quick-event="imjin"]') && await inView('[data-quick-event="zainichi"]'));
  check('목적 한 줄: "공동의 기억을 쌓아 가는 참여형 역사 아카이브"', /공동의 기억을 쌓아 가는 참여형 역사 아카이브/.test(await page.textContent('.hero__mission')));
  const rows = await page.$$eval('.why__row dt', els => els.map(e => e.textContent));
  check('사건 카드 아래 "왜 Shared Memory인가": 문제 · 방법 · 결과', JSON.stringify(rows) === '["문제","방법","결과"]' &&
    await page.$eval('.why', el => el.getBoundingClientRect().top > document.querySelector('[data-quick-event="zainichi"]').getBoundingClientRect().bottom));
  check('결과 줄에 실제 공개 문장 수 (가짜 DB 12개)', /공개된 문장 12개/.test(await page.textContent('#whyLive')));
  check('휴대폰에서는 참여자 수 한 줄 그대로, 기록 상자는 숨김', /현재 30명/.test(await page.textContent('#participantCount')) && !(await page.isVisible('#heroRecord')));
  check('옛 소개 카드(01·02·03)는 없고 링크는 "왜" 상자 안으로', !(await page.$('.intro__card')) && (await page.$$eval('.why__links a', els => els.length)) === 3);
  await phone.close();

  const pc = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await mockPage(pc);
  await page.goto(base + 'index.html');
  await seedRecord(page);
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('heroRecord').hidden);
  check('PC: 예시 카드 아래 "지금까지 쌓인 기록" — 30명 참여 · 공개된 문장 12개, 스크롤 없이 보임',
    /30\s*명 참여/.test(await page.textContent('#heroRecord')) && /12\s*개의 공개된 문장/.test(await page.textContent('#heroRecord')) && await inView('#heroRecord'));
  check('PC: 참여자 수는 기록 상자에만 (왼쪽 줄 중복 숨김)', !(await page.isVisible('#participantCount')));
  check('PC 첫 화면에서 사건 카드가 스크롤 없이 보임', await inView('[data-quick-event="imjin"]') && await inView('[data-quick-event="zainichi"]'));
  await page.click('#heroRecord [data-hero-archive]');
  await page.waitForSelector('.page--archive.active');
  check('"아카이브에서 읽어 보기" → Shared Archive', await page.isVisible('.page--archive.active'));
  check('첫 화면 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await pc.close();

  // 집계를 불러오지 못하면 숫자를 지어내지 않고 숨김
  const off = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await mockPage(off);
  await page.route(/vendor\/supabase/, r => r.fulfill({ contentType: 'text/javascript', body: 'window.supabase = undefined;' }));
  await page.goto(base + 'index.html');
  await page.waitForTimeout(800);
  check('집계를 불러오지 못하면 기록 상자·결과 줄 숫자를 숨김', !(await page.isVisible('#heroRecord')) && !(await page.isVisible('#whyLive')));
  await off.close();
});
