/* 네 번째 서술자 · 기억의 빈자리 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/fourth-narrator.e2e.js   (전체: npm run test:e2e)
   AI 기록이 없을 때 '기록 전'과 질문 원문만 표시 · 세 나라만으로 빈자리 계산 · 비교 탭에서 이동 ·
   기록이 있을 때 답변 카드·회차 버튼·참고 번역·형식이 틀린 기록 제외 · HTML 이스케이프 · 모바일 화면
   · 1)·2)는 ai-narratives-data.js 응답을 테스트 안에서만 바꿔(빈 기록 / 가짜 FAKE_ 기록) 기록 유무와 상관없이 같은 조건으로 확인합니다.
   · 4)는 저장소의 실제 기록(2026-10-22 수집 54건)을 그대로 불러와 화면에 반영되는지 확인합니다. */
'use strict';
const { run } = require('./harness');

// 테스트 전용: 기록이 하나도 없는 상태 (수집 전)
const EMPTY_AI_FILE = 'const aiNarrativesData = { questionsVersion: fourthNarratorData.questionsVersion, records: [] };';

// 테스트 전용 기록: 일본어 3회(형식 맞음) + 중국어 1회(질문이 바뀐 기록 → 화면에서 빠져야 함)
const FAKE_AI_FILE = `
const aiNarrativesData = {
  questionsVersion: fourthNarratorData.questionsVersion,
  records: [1, 2, 3].map(run => ({
    eventId: 'hiroshima', lang: 'ja', run,
    prompt: fourthNarratorData.questions.hiroshima.ja,
    answer: 'FAKE_テスト回答' + run + (run === 1
      ? ' 朝鮮人も被害を受けた。<b>太字</b>\\n\\n## 見出し\\n- **強調<img src=x onerror="window.__xss=1">**\\n- 二つ目'
      : ' 多くの市民が被害を受けた。'),
    translationKo: 'FAKE_참고 번역 ' + run,
    model: 'test-model', collectedAt: '2026-10-22T00:00:00Z', params: {}
  })).concat([{
    eventId: 'hiroshima', lang: 'zh', run: 1, prompt: '바뀐 질문',
    answer: 'FAKE_被篡改的记录', translationKo: null,
    model: 'test-model', collectedAt: '2026-10-22T00:00:00Z', params: {}
  }])
};`;

run('fourth-narrator', async ({ browser, base, check, mockPage, presetContinue }) => {
  async function openFourth(context, eventId, aiFile) {
    const page = await mockPage(context);
    if (aiFile) await page.route(/ai-narratives-data\.js/, r => r.fulfill({ contentType: 'text/javascript', body: aiFile }));
    await page.goto(base + 'index.html#/e/' + eventId);
    await page.waitForSelector('#flowProgress [data-step-goto="2"]');
    // 임진왜란·재일조선인은 QR로 들어오면 기본 체험으로 열립니다 → 화면의 '심화 탐구' 링크로 AI 서술이 있는 탐구로 전환
    if (await page.$eval('.page--detail', el => el.dataset.mode) === 'quick') await page.click('[data-deep-switch="2"]');
    await page.click('#flowProgress [data-step-goto="2"]');
    return page;
  }

  // 1) 기록 없음 (수집 전 상태를 테스트 안에서 재현)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(presetContinue);
  const page = await openFourth(ctx, 'hiroshima', EMPTY_AI_FILE);
  check('비교 탭에 네 번째 서술자 안내 버튼', await page.isVisible('[data-tab-content="compare"] .fourth-cta'));
  await page.click('[data-tab-content="compare"] .fourth-cta');
  check('안내 버튼으로 네 번째 서술자 탭 열림', await page.isVisible('[data-tab-content="fourth"].active'));
  check('탐구 단계는 STEP 2 유지', await page.$eval('.page--detail', el => el.dataset.step) === '2');
  check('기록이 없으면 "기록 전" 안내', /아직 기록 전/.test(await page.textContent('#fourthNarrator')));
  check('AI 답변 카드는 없음 (답변을 지어 넣지 않음)', !(await page.$('#fourthNarrator .fourth-card')));
  check('세 언어 질문 원문 표시', (await page.$$eval('#fourthNarrator .fourth-q', els => els.length)) === 3);
  const heads = await page.$$eval('#memoryGaps thead th', els => els.map(e => e.textContent.trim()));
  check('빈자리 표는 세 나라만 비교', heads.join('|') === '요소|한국 측|일본 측|중국 측', heads.join('|'));
  const victims = await page.$$eval('#memoryGaps tbody tr', rows => {
    const r = rows.find(x => /조선인 피해자/.test(x.querySelector('th').textContent));
    return r ? [...r.querySelectorAll('td')].map(td => td.className.replace('gap-cell ', '')) : null;
  });
  check('조선인 피해자: 일본 측 요약이 빈자리', victims && victims.join(',') === 'gap-cell--present,gap-cell--gap,gap-cell--present', String(victims));
  check('빈자리 요약 문장에 일본 측·조선인 피해자', /일본 측에는 ‘조선인 피해자’/.test(await page.textContent('#memoryGaps .gap-summary')));
  check('계산 방법과 한계 안내', /왜곡이나 의도를 뜻하지 않습니다/.test(await page.textContent('#memoryGaps')));
  await page.click('.tab[data-tab="compare"]');
  await page.click('.tab[data-tab="fourth"]');
  check('탭 메뉴로도 열림', await page.isVisible('#memoryGaps .gap-table'));
  check('페이지 오류 없음 (기록 없음)', page.__errors.length === 0, page.__errors.join(' / '));
  await ctx.close();

  // 2) 기록이 있을 때 (테스트 전용 가짜 기록)
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addInitScript(presetContinue);
  const page2 = await mockPage(ctx2);
  await page2.route(/ai-narratives-data\.js/, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_AI_FILE }));
  await page2.goto(base + 'index.html#/e/hiroshima');
  await page2.waitForSelector('#flowProgress [data-step-goto="2"]');
  await page2.click('#flowProgress [data-step-goto="2"]');
  await page2.click('.tab[data-tab="fourth"]');
  const cards = await page2.$$eval('#fourthNarrator .fourth-card .fourth-card__title', els => els.map(e => e.textContent.trim()));
  check('형식이 맞는 일본어 기록만 카드로 표시 (질문이 바뀐 중국어 기록 제외)', cards.join('|') === 'AI · 일본어로 물었을 때', cards.join('|'));
  check('회차 버튼 3개', (await page2.$$eval('#fourthNarrator [data-ai-run]', els => els.length)) === 3);
  const answer1 = await page2.$eval('#fourthNarrator .fourth-card__answer', el => el.innerHTML);
  check('답변은 HTML로 해석하지 않음', answer1.includes('&lt;b&gt;') && !(await page2.$('#fourthNarrator .fourth-card__answer b')), answer1);
  check('Markdown 굵게·목록·제목 안의 HTML도 글자로만 표시', !(await page2.$('#fourthNarrator img')) && answer1.includes('&lt;img') &&
    !(await page2.evaluate(() => window.__xss)), answer1);
  const md = await page2.$eval('#fourthNarrator .fourth-card__answer', el => ({
    text: el.textContent, h: el.querySelectorAll('.md-h').length, li: el.querySelectorAll('ul > li').length, strong: el.querySelectorAll('li strong').length
  }));
  check('Markdown 기호 대신 제목·목록·굵게로 표시 (##·** 기호 없음)', md.h === 1 && md.li === 2 && md.strong === 1 && !/##|\*\*/.test(md.text), JSON.stringify(md));
  await page2.click('#fourthNarrator [data-ai-run="2"]');
  check('회차를 바꾸면 그 답변 표시', /FAKE_テスト回答2/.test(await page2.textContent('#fourthNarrator .fourth-card__answer')));
  check('바꾼 회차 버튼이 눌린 상태', await page2.$eval('#fourthNarrator [data-ai-run="2"]', el => el.getAttribute('aria-pressed')) === 'true');
  check('한국어 참고 번역 (AI 번역) 표시', /FAKE_참고 번역 2/.test(await page2.textContent('#fourthNarrator .fourth-card__translation')));
  check('모델·수집일 표시', /모델 test-model/.test(await page2.textContent('#fourthNarrator .fourth-card__meta')));
  const heads2 = await page2.$$eval('#memoryGaps thead th', els => els.map(e => e.textContent.trim()));
  check('빈자리 표에 AI(일본어) 열 추가, 중국어 열 없음', heads2.join('|') === '요소|한국 측|일본 측|중국 측|AI · 일본어', heads2.join('|'));
  const aiCell = await page2.$$eval('#memoryGaps tbody tr', rows => {
    const r = rows.find(x => /조선인 피해자/.test(x.querySelector('th').textContent));
    const td = r.querySelectorAll('td')[3];
    return { cls: td.className, text: td.textContent };
  });
  check('3회 중 1회만 나온 요소는 없음으로 보고 횟수 표시', /gap-cell--gap/.test(aiCell.cls) && /1\/3/.test(aiCell.text), JSON.stringify(aiCell));
  check('페이지 오류 없음 (기록 있음)', page2.__errors.length === 0, page2.__errors.join(' / '));
  await ctx2.close();

  // 4) 실제 기록 (2026-10-22 수집, 6개 사건 × 3개 언어 × 3회 = 54건)
  const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx4.addInitScript(presetContinue);
  const page4 = await openFourth(ctx4, 'imjin');
  await page4.click('.tab[data-tab="fourth"]');
  const realCards = await page4.$$eval('#fourthNarrator .fourth-card .fourth-card__title', els => els.map(e => e.textContent.trim()));
  check('실제 기록: 세 언어 카드 표시', realCards.join('|') === 'AI · 한국어로 물었을 때|AI · 일본어로 물었을 때|AI · 중국어로 물었을 때', realCards.join('|'));
  check('실제 기록: 언어마다 회차 버튼 3개', (await page4.$$eval('#fourthNarrator [data-ai-run]', els => els.length)) === 9);
  check('실제 기록: 일본어·중국어 카드에만 참고 번역', (await page4.$$eval('#fourthNarrator .fourth-card__translation', els => els.length)) === 2);
  check('실제 기록: 모델 표시', /claude-opus-5-5/.test(await page4.textContent('#fourthNarrator .fourth-card__meta')));
  check('실제 기록: "기록 전" 안내 없음', !/아직 기록 전/.test(await page4.textContent('#fourthNarrator')));
  const realMd = await page4.$$eval('#fourthNarrator .fourth-card__answer, #fourthNarrator .fourth-card__translation .md', els => els.map(e => e.textContent));
  check('실제 기록: 답변·번역에 Markdown 기호(##, **)가 그대로 보이지 않음', realMd.length === 5 && realMd.every(t => !/^#{1,6}\s|\*\*/m.test(t)), realMd.filter(t => /\*\*|^#/m.test(t)).length + '건');
  const firstNames = await page4.$$eval('#fourthNarrator .fourth-card', els => els.map(e => e.querySelector('.narrative-card__keywords').textContent.replace(/\s+/g, ' ').trim()));
  check('실제 기록: 가장 먼저 쓴 이름 (한 임진왜란 · 일 文禄・慶長の役 · 중 万历朝鲜之役)', /임진왜란 3회 중 3회/.test(firstNames[0]) && /文禄・慶長の役 3회 중 3회/.test(firstNames[1]) && /万历朝鲜之役·战争.*3회 중 3회/.test(firstNames[2]), firstNames.join(' | '));
  check('실제 기록: 편집자 관찰 표시', (await page4.$$eval('#fourthNarrator .fourth-observe li', els => els.length)) >= 2);
  check('실제 기록: 핵심 빈자리 강조 (중국어 민간·백성, 일본어 국제·동아시아)', (await page4.$$eval('#memoryGaps .gap-summary__item--key', els => els.length)) === 2);
  const realHeads = await page4.$$eval('#memoryGaps thead th', els => els.map(e => e.textContent.trim()));
  check('실제 기록: 빈자리 표에 AI 세 언어 열', realHeads.join('|') === '요소|한국 측|일본 측|중국 측|AI · 한국어|AI · 일본어|AI · 중국어', realHeads.join('|'));
  const cellOf = (pg, label, col) => pg.$$eval('#memoryGaps tbody tr', (rows, [label, col]) => {
    const r = rows.find(x => x.querySelector('th').textContent.trim() === label);
    const td = r && r.querySelectorAll('td')[col];
    return td ? { cls: td.className, text: td.textContent } : null;
  }, [label, col]);
  const ming = await cellOf(page4, '명나라의 참전', 4);
  check('실제 기록: 일본어 AI의 명나라 참전(明の援軍)은 빈자리가 아님', ming && /gap-cell--present/.test(ming.cls) && /3\/3/.test(ming.text), JSON.stringify(ming));
  await page4.goto(base + 'index.html#/e/hiroshima');
  await page4.waitForSelector('#flowProgress [data-step-goto="2"]');
  await page4.click('#flowProgress [data-step-goto="2"]');
  await page4.click('.tab[data-tab="fourth"]');
  const victimsZh = await cellOf(page4, '조선인 피해자', 5);
  check('실제 기록: 중국어 AI의 조선인 피해자(朝鲜半岛)는 빈자리가 아님', victimsZh && /gap-cell--present/.test(victimsZh.cls) && /3\/3/.test(victimsZh.text), JSON.stringify(victimsZh));
  check('페이지 오류 없음 (실제 기록)', page4.__errors.length === 0, page4.__errors.join(' / '));
  await ctx4.close();

  // 3) 모바일
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx3.addInitScript(presetContinue);
  const page3 = await openFourth(ctx3, 'imjin');
  await page3.click('.tab[data-tab="fourth"]');
  check('모바일에서 빈자리 표 표시', await page3.isVisible('#memoryGaps .gap-table'));
  const shownCards = () => page3.$$eval('#fourthNarrator .fourth-card', els => els.filter(e => e.offsetParent !== null).map(e => e.dataset.aiCard));
  check('모바일: 언어 카드는 하나씩 (처음엔 한국어)', (await shownCards()).join(',') === 'ko', (await shownCards()).join(','));
  await page3.click('#fourthNarrator [data-ai-show="zh"]');
  check('모바일: 언어 버튼으로 중국어 카드로 바꿈', (await shownCards()).join(',') === 'zh' && await page3.isVisible('#fourthNarrator [data-ai-card="zh"] .fourth-card__translation'));
  await page3.click('#fourthNarrator [data-ai-card="zh"] [data-ai-run="3"]');
  check('모바일: 회차를 바꿔도 고른 언어 유지', (await shownCards()).join(',') === 'zh' &&
    await page3.$eval('#fourthNarrator [data-ai-card="zh"] [data-ai-run="3"]', el => el.getAttribute('aria-pressed')) === 'true');
  const overflow = await page3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('모바일 폭에서 가로 넘침 없음 (표는 상자 안에서만 스크롤)', overflow <= 1, `넘침 ${overflow}px`);
  check('페이지 오류 없음 (모바일)', page3.__errors.length === 0, page3.__errors.join(' / '));
  await ctx3.close();
});
