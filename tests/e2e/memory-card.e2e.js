/* QR 5분 탐구 · My Memory Card — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/memory-card.e2e.js   (전체: npm run test:e2e)
   사건별 QR 링크 진입 · 잘못된 링크 · 모바일 흐름 · 탐구 전/후 기록 정확성 · 공개 없이 카드 받기 ·
   발견 최대 3개 · 이미지(PNG) 저장 · 긴 문장 · 인쇄 화면 · 공개 동의 분리 · 공개 후에도 카드 · 새 참여자 초기화 · QR 시트 */
'use strict';
const fs = require('node:fs');
const { run } = require('./harness');

const insertCount = page => page.evaluate(() => window.__mockDb.read().shared_expressions.length);
const pngSize = buf => ({ png: buf.slice(1, 4).toString() === 'PNG', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function downloadPng(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-card-action="png"]')]);
  const file = await dl.path();
  return { name: dl.suggestedFilename(), info: pngSize(fs.readFileSync(file)) };
}

/** QR 링크는 기본 체험으로 열립니다. 탐구 전 문장이 있는 심화 탐구는 화면의 '심화 탐구' 링크 → 진행 표시 STEP 1로 갑니다. */
async function toDeepBefore(page) {
  if (await page.$eval('.page--detail', el => el.dataset.mode) === 'quick') {
    await page.click('[data-deep-switch="2"]');
    await page.click('#flowProgress [data-step-goto="1"]');
  }
  await page.waitForSelector('#beforeInput');
}

run('memory-card', async ({ browser, base, check, mockPage }) => {
  /* ---------- 1. 휴대폰에서 QR 링크로 바로 진입 → 카드까지 (공개 없이) ---------- */
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, hasTouch: true, isMobile: true });
  let page = await mockPage(mobile);
  await page.goto(base + 'index.html#/e/zainichi');
  await page.waitForSelector('.page--detail.active');
  check('QR 링크(#/e/zainichi)로 첫 화면 없이 사건 화면이 바로 열림', await page.$eval('.detail__title', el => el.textContent.trim()) === '재일조선인');
  check('사건 화면에 역사적 질문 표시', /누구의 역사로/.test(await page.$eval('.detail__question', el => el.textContent)));
  check('주소에 사건 링크 유지', await page.evaluate(() => location.hash) === '#/e/zainichi');
  await page.reload();
  check('새로고침하면 예전처럼 첫 화면에서 시작 (공용 기기에서 앞 사람의 사건이 저절로 열리지 않음)', await page.isVisible('.page--home.active') && await page.evaluate(() => location.hash === ''));
  await page.goto(base + 'index.html#/e/zainichi');
  await page.waitForSelector('.page--detail.active');
  check('모바일: 가로 스크롤 없음 (사건 화면)', await noHScroll(page));
  await toDeepBefore(page);

  const BEFORE = '잘 모르지만 <일본>에 사는 한국 사람들';
  const AFTER = '재일조선인은 식민지 지배와 전후 일본 사회 속에서 형성된 공동체이며, 차별과 국적 문제를 함께 기억해야 한다.';
  await page.fill('#beforeInput', BEFORE);
  await page.click('[data-before-action="save"]');
  await page.evaluate(() => document.getElementById('narrativesGrid').scrollIntoView());
  await page.waitForFunction(() => flow && flow.viewedCompare, null, { timeout: 12000 });
  check('국가별 서술을 실제로 본 뒤 진행 표시의 STEP 2(세 나라 비교) 완료', await page.$eval('#flowProgress .flow-progress__step:nth-child(2)', el => el.classList.contains('is-done')));
  await page.click('.tab[data-tab="sources"]');

  await page.click('.tab[data-tab="shared"]');
  await page.click('#makeCardButton');
  check('탐구 후 문장 없이 카드를 만들면 안내만 하고 넘어가지 않음', /탐구 후 나의 한 문장/.test(await page.$eval('#cardStatus', el => el.textContent)) && await page.isVisible('.page--detail.active'));
  await page.fill('#userNarrative', AFTER);
  await page.click('#makeCardButton');
  await page.waitForSelector('.page--card.active');
  check('카드 화면으로 이동', await page.isVisible('#memoryCard .memory-card__title'));
  const beforeText = await page.$eval('.memory-card__quote--before', el => el.textContent);
  const afterText = await page.$eval('.memory-card__quote--after', el => el.textContent);
  check('탐구 전 문장이 입력 그대로 표시 (특수문자 포함, HTML로 해석하지 않음)', beforeText === `“${BEFORE}”`, beforeText);
  check('탐구 후 문장이 입력 그대로 표시', afterText === `“${AFTER}”`, afterText);
  check('카드에 사건·역사적 질문·브랜드 표시', /재일조선인/.test(await page.$eval('.memory-card__title', el => el.textContent)) &&
    await page.isVisible('.memory-card__question') && /Shared Memory/.test(await page.$eval('.memory-card__foot', el => el.textContent)));
  const stamps = await page.$$eval('.memory-card__stamps li', els => els.map(e => e.classList.contains('is-done')));
  check('탐구 기록 도장: 실제로 한 단계만 표시 (서술 O · 분석 X · 사료 O · 공개 X)', JSON.stringify(stamps) === JSON.stringify([true, false, true, false]), JSON.stringify(stamps));
  const added = await page.$eval('.memory-card__change', el => el.textContent).catch(() => '');
  // 안내 문구(하단 "정답이나 점수를 뜻하지 않습니다")를 뺀 카드 본문에 평가 표현이 없어야 합니다.
  const cardBody = await page.$eval('#memoryCard', el => { const c = el.cloneNode(true); c.querySelector('.memory-card__foot')?.remove(); return c.textContent; });
  const afterWords = await page.evaluate(() => [...new Set(SharedMemoryAnalyzer.compareBeforeAfter(
    document.querySelector('.memory-card__quote--before').textContent, document.querySelector('.memory-card__quote--after').textContent).addedConcepts)]);
  check('생각의 변화는 실제 새로 쓴 단어로만 표시 (평가 문구 없음)', /새로 쓴 말/.test(added) && !/향상|성장|발전했|점수|정답|우수/.test(cardBody) &&
    afterWords.slice(0, 3).every(w => added.includes(w)), added);
  const fifth = await page.$eval('.memory-card__fifth', el => el.textContent).catch(() => '');
  check('다섯 번째 서술자: 내 문장이 채운 빈자리(차별 — 일본 측 서술에는 없던 요소) 표시', /차별 — 일본 측 서술에는 없던 요소/.test(fifth.replace(/\s+/g, ' ')), fifth);
  check('공개 등록 없이 카드를 받음 (서버 저장 0건)', (await insertCount(page)) === 0);
  check('카드 내용이 저장소에 남지 않음 (sm_card 키 없음)', await page.evaluate(() => !Object.keys(localStorage).some(k => /card/i.test(k))));

  // 발견한 관점 · 질문
  const options = await page.$$eval('[data-discovery]', els => els.map(e => e.dataset.discovery));
  check('발견 후보가 사건 데이터·NLP 결과에서 만들어짐 (이름 차이 + 국가별 표현)', options.includes('names') && options.some(o => o.startsWith('distinct-')), options.join(','));
  await page.click('[data-discovery="names"]');
  await page.click(`[data-discovery="${options.find(o => o.startsWith('distinct-'))}"]`);
  await page.fill('#customDiscovery', '같은 사람들을 부르는 이름도 시대마다 다르다');
  await page.waitForTimeout(350);
  const disabled = await page.$$eval('[data-discovery][disabled]', els => els.length);
  check('발견은 최대 3개 (나머지 후보 비활성)', disabled === options.length - 2, `disabled=${disabled}`);
  await page.fill('#myQuestion', '일본 교과서에는 실제로 어떻게 쓰여 있을까?');
  await page.waitForTimeout(350);
  const found = await page.$$eval('.memory-card__list li', els => els.map(e => e.textContent));
  check('카드에 고른 발견 3개 표시', found.length === 3 && found[2] === '같은 사람들을 부르는 이름도 시대마다 다르다', JSON.stringify(found));
  check('카드에 남은 질문 표시', /어떻게 쓰여 있을까/.test(await page.$eval('.memory-card__ask-text', el => el.textContent)));
  check('모바일: 가로 스크롤 없음 (카드 화면)', await noHScroll(page));

  const png = await downloadPng(page);
  check('이미지로 저장: PNG 파일 1080px 폭, 4:5 이상 높이', png.info.png && png.info.width === 1080 && png.info.height >= 1350 && png.info.height <= 1920, JSON.stringify(png));
  check('저장 파일 이름에 사건 id · 디자인(기본: 고문서)', /^shared-memory-card-zainichi-\d{8}-archive\.png$/.test(png.name), png.name);

  // 카드 디자인 (아트 컬렉션) · 인스타 스토리
  const themes = await page.$$eval('[data-card-theme]', els => els.map(e => ({ id: e.dataset.cardTheme, on: e.getAttribute('aria-checked') })));
  check('카드 디자인 5종, 기본은 고문서 (하나만 선택)', themes.length === 5 && themes[0].id === 'archive' && themes[0].on === 'true' && themes.filter(t => t.on === 'true').length === 1, JSON.stringify(themes));
  check('화면 카드에 테마 그림이 그려짐', await page.$eval('#memoryCard', el => el.dataset.art === 'ready' && el.dataset.theme === 'archive'));
  await page.click('[data-card-theme="ukiyoe"]');
  check('디자인을 바꿔도 문장은 그대로', await page.$eval('#memoryCard', el => el.dataset.theme) === 'ukiyoe' &&
    await page.$eval('.memory-card__quote--after', el => el.textContent) === `“${AFTER}”` && (await page.$$eval('.memory-card__list li', els => els.length)) === 3);
  await page.focus('[data-card-theme="ukiyoe"]');
  await page.keyboard.press('ArrowRight');
  check('화살표 키로 디자인 고르기 (라디오 묶음)', await page.$eval('#memoryCard', el => el.dataset.theme) === 'sansu' && await page.evaluate(() => document.activeElement.dataset.cardTheme) === 'sansu');
  const themed = await downloadPng(page);
  check('고른 디자인으로 저장 (파일 이름에 디자인)', themed.info.width === 1080 && /^shared-memory-card-zainichi-\d{8}-sansu\.png$/.test(themed.name), themed.name);
  await page.click('[data-card-format="story"]');
  check('인스타 스토리: 미리보기 표시 · 저장 버튼 문구 바뀜', await page.isVisible('#storyCanvas') && !(await page.isVisible('#memoryCard')) &&
    /스토리 이미지 저장/.test(await page.textContent('[data-card-action="png"]')) && await page.isVisible('#cardStoryHint'));
  check('스토리 미리보기 대체 텍스트에 탐구 후 문장 전체', (await page.getAttribute('#storyCanvas', 'aria-label')).includes(AFTER));
  await page.evaluate(() => {
    window.__fontCalls = [];
    const orig = document.fonts.load.bind(document.fonts);
    document.fonts.load = (f, t) => { window.__fontCalls.push([f, t || '']); return orig(f, t); };
  });
  const story = await downloadPng(page);
  const fontCalls = await page.evaluate(() => window.__fontCalls);
  check('이미지 저장 전 테마 서체를 실제로 그릴 글자와 함께 불러옴 (청록산수: 고운바탕 문장 · Noto Serif SC 인장)',
    fontCalls.some(([f, t]) => /Gowun Batang/.test(f) && [...'재일조선인차별'].every(ch => t.includes(ch))) &&
    fontCalls.some(([f]) => /Noto Serif SC/.test(f)) && fontCalls.some(([f]) => /Pretendard/.test(f)), JSON.stringify(fontCalls.map(c => c[0].slice(0, 30))));
  check('스토리 이미지: 1080×1920 PNG (9:16)', story.info.png && story.info.width === 1080 && story.info.height === 1920, JSON.stringify(story));
  check('스토리 파일 이름', /^shared-memory-card-zainichi-\d{8}-sansu-story\.png$/.test(story.name), story.name);
  check('모바일: 가로 스크롤 없음 (스토리 미리보기)', await noHScroll(page));
  check('디자인 선택도 저장소에 남지 않음', await page.evaluate(() => !Object.keys(localStorage).some(k => /card|theme/i.test(k))));
  await page.click('[data-card-format="feed"]');
  check('카드(4:5)로 돌아오면 화면 카드 다시 표시', await page.isVisible('#memoryCard .memory-card__title') && !(await page.isVisible('#storyCanvas')));

  await page.emulateMedia({ media: 'print' });
  check('인쇄 화면: 카드만 보이고 메뉴·버튼·다듬기 숨김', await page.isVisible('#memoryCard') && !(await page.isVisible('.nav')) &&
    !(await page.isVisible('.card-builder')) && !(await page.isVisible('[data-card-action="png"]')));
  await page.emulateMedia({ media: 'screen' });

  /* ---------- 2. 공개는 별도 동의 · 공개 후에도 카드 ---------- */
  await page.click('[data-card-action="publish"]');
  await page.waitForSelector('.page--detail.active');
  const focused = await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'publishConsent', null, { timeout: 3000 }).then(() => true, () => false);
  check('카드에서 "공개하기"를 누르면 공개 동의 영역으로 이동 (동의 상자에 초점)', focused && !(await page.isChecked('#publishConsent')));
  await page.click('#submitNarrative');
  check('동의 없이 공개 등록하면 저장하지 않고 안내', (await insertCount(page)) === 0 && /동의 상자에 체크/.test(await page.$eval('#submitStatus', el => el.textContent)));
  await page.check('#publishConsent');
  await page.click('#submitNarrative');
  await page.waitForFunction(() => /등록되었습니다|실패/.test(document.getElementById('submitStatus').textContent));
  const db = await page.evaluate(() => window.__mockDb.read());
  const row = db.shared_expressions[0] || {};
  check('동의 후에만 공개 등록 (1건)', db.shared_expressions.length === 1);
  check('등록 내용 = 탐구 후 문장, before_content = 탐구 전 문장 (같은 체험에서 연결)', row.content === AFTER && row.before_content === BEFORE, JSON.stringify({ c: row.content, b: row.before_content }));
  check('발견·남은 질문은 서버로 보내지 않음', !JSON.stringify(row).includes('어떻게 쓰여 있을까') && !JSON.stringify(row).includes('시대마다 다르다'));
  check('등록 후 동의 상자는 다시 해제', !(await page.isChecked('#publishConsent')));
  check('등록 후 이 기기에서 탐구 전 문장 삭제 (공용 기기 보호 유지)', await page.evaluate(() => !localStorage.getItem('sm_before_zainichi')));
  await page.click('#makeCardButton');
  await page.waitForSelector('.page--card.active');
  check('공개 등록 뒤에도 같은 창에서 카드를 다시 만들 수 있음 (탐구 전·후 문장 유지)',
    await page.$eval('.memory-card__quote--before', el => el.textContent) === `“${BEFORE}”` &&
    await page.$eval('.memory-card__quote--after', el => el.textContent) === `“${AFTER}”`);
  check('공개 참여 도장 표시', await page.$eval('.memory-card__stamps li:nth-child(4)', el => el.classList.contains('is-done')));

  /* ---------- 3. 새 참여자로 시작 → 카드 지움 ---------- */
  page.__dialogAnswer = true;
  await page.click('.card-builder [data-new-participant]');
  await page.waitForSelector('.page--home.active');
  check('새 참여자로 시작하면 카드 화면·내용 지움', await page.$eval('#memoryCard', el => el.innerHTML.trim() === '') && !(await page.isVisible('.page--card.active')));
  check('새 참여자로 시작하면 사건 링크 주소도 지움', await page.evaluate(() => location.hash === ''));
  check('새 참여자로 시작하면 카드 디자인·형식도 기본값 (고문서 · 4:5)', await page.evaluate(() => cardState.theme === 'archive' && cardState.format === 'feed'));
  await page.evaluate(() => { location.hash = '#/e/zainichi'; });
  await page.waitForSelector('.page--detail.active');
  if (await page.isVisible('#participantGate')) await page.click('[data-gate-choice="continue"]');
  check('새 참여자는 STEP 1부터 시작 (탭은 STEP 2부터 보임)', await page.$eval('.page--detail', el => el.dataset.step) === '1' && !(await page.isVisible('.tab[data-tab="shared"]')));
  await page.click('#flowProgress [data-step-goto="3"]');   // 진행 표시로 STEP 3에 바로 이동 (단계 이동은 막지 않음)
  // QR은 기본 체험: 이 단계의 카드 버튼을 눌러도 앞사람의 선택·문장이 없으므로 카드를 만들지 않습니다.
  await page.click('#quickCardButton');
  check('다음 참여자는 이전 참여자의 문장으로 카드를 만들 수 없음', /카드에 담을 내용이 없어요/.test(await page.$eval('#cardStatus', el => el.textContent)) && !(await page.isVisible('.page--card.active')));
  check('모바일 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await mobile.close();

  /* ---------- 4. 잘못된 링크 · 긴 문장 · QR 시트 (데스크톱) ---------- */
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  page = await mockPage(desk);
  await page.goto(base + 'index.html#/e/not-an-event');
  check('없는 사건 링크는 첫 화면으로 (오류 없음)', await page.isVisible('.page--home.active') && page.__errors.length === 0);
  await page.goto(base + 'index.html?e=imjin');
  await page.waitForSelector('.page--detail.active');
  check('?e=imjin 형식 링크도 지원', await page.$eval('.detail__title', el => el.textContent.trim()) === '임진왜란');

  await toDeepBefore(page);
  const LONG_BEFORE = '탐구 전 '.repeat(120).trim();
  const LONG_AFTER = ('임진왜란은 동아시아 세 나라가 모두 관여한 국제 전쟁이었고 많은 사람이 피해를 입었다. ').repeat(14).trim().slice(0, 1000);
  await page.fill('#beforeInput', LONG_BEFORE);
  await page.click('[data-before-action="save"]');
  await page.click('.tab[data-tab="shared"]');
  await page.fill('#userNarrative', LONG_AFTER);
  await page.click('#makeCardButton');
  await page.waitForSelector('.page--card.active');
  const box = await page.$eval('#memoryCard', el => ({ w: el.scrollWidth, cw: el.clientWidth }));
  check('최대 길이(1000자) 문장도 카드 밖으로 넘치지 않음', box.w <= box.cw + 1, JSON.stringify(box));
  check('긴 문장은 작은 글자 단계 사용', await page.$eval('.memory-card__quote--after', el => el.classList.contains('tier-xlong')));
  check('화면 카드에는 문장 전체 표시 (자르지 않음)', (await page.$eval('.memory-card__quote--after', el => el.textContent)).length === LONG_AFTER.length + 2);
  const longPng = await downloadPng(page);
  check('긴 문장도 이미지 높이 1920px 이내', longPng.info.width === 1080 && longPng.info.height <= 1920, JSON.stringify(longPng.info));
  check('이미지에서 생략된 경우 안내', /일부 생략/.test(await page.$eval('#cardActionStatus', el => el.textContent)));

  await page.click('[data-card-action="back"]');
  await page.click('.nav__logo');
  await page.click('.intro__more a[data-page="qr"]');
  await page.waitForSelector('.page--qr.active');
  const qr = await page.$$eval('.qr-card', els => els.map(e => ({ svg: !!e.querySelector('svg path, svg rect'), link: e.querySelector('.qr-card__link').textContent })));
  check('QR 시트: 사건 6개 모두 QR 생성', qr.length === 6 && qr.every(q => q.svg), JSON.stringify(qr.map(q => q.svg)));
  check('QR 링크 = 사이트 주소 + #/e/사건', qr.every(q => q.link.startsWith(base + 'index.html#/e/')) && qr[0].link.endsWith('#/e/imjin'), qr[0] && qr[0].link);
  check('QR 시트는 외부 QR 서비스를 쓰지 않음 (이미지 요청 없음)', await page.$$eval('.qr-card img', els => els.length) === 0);
  await page.click('.qr-card [href="#/e/tribute"]');
  await page.waitForSelector('.page--detail.active');
  check('QR 시트의 "열어 보기"로 해당 사건 진입', await page.$eval('.detail__title', el => el.textContent.trim()) === '조공 관계');
  check('데스크톱 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await desk.close();
});
