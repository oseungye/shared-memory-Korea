/* 홍보 영상 1단계: 실제 사이트를 휴대폰 크기(400x660, 2.7배 = 1080px 폭)로 열어 '기본 체험' 동선을 단계별로 shots2/에 캡처합니다.
   첫 화면 큰 사건 카드 → 세 나라 비교 → 객관식 관점 고르기 → 한 줄 소감 → My Memory Card.
   가짜 Supabase(tests/e2e/mock-supabase.js)를 써서 실제 DB에 접속하지 않고, 입력 문장은 모두 예시입니다. 통계 동의는 켜지 않습니다.
   실행: node tools/promo/capture.js → node tools/promo/render.js (ffmpeg 필요) */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const MOCK = fs.readFileSync(ROOT + '/tests/e2e/mock-supabase.js', 'utf8');
const OUT = path.join(__dirname, 'shots2');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const REFLECT = '이름 하나에도 각 나라가 이 전쟁을 보는 눈이 담겨 있다는 게 새로웠다.';
const PICKS = ['many_names', 'alliance', null];   // null = 그 질문의 첫 번째 선택지

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 660 }, deviceScaleFactor: 2.7, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.route(u => !u.href.startsWith(base) && !/fonts\.(googleapis|gstatic)\.com/.test(u.href), r => r.abort());
  await page.route(/supabase-js|vendor\/supabase/, r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  const boxes = {};
  const rect = sel => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const shot = async name => { await page.mouse.move(2, 2); await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot', name); };
  const scrollTo = async (sel, offset = 0) => { await page.evaluate(([s, o]) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o); }, [sel, offset]); await page.waitForTimeout(400); };

  // 1. 첫 화면: 큰 사건 카드 두 장
  await page.goto(base + 'index.html');
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1200);
  await shot('00-home-top');
  await scrollTo('.quick-picks', 150);
  await shot('01-home-picks');
  boxes.imjin = await rect('[data-quick-event="imjin"]');
  await page.click('[data-quick-event="imjin"]');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(700);

  // 2. STEP 1 · 세 나라 비교
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await shot('02-step1-top');
  const n = await page.$$eval('#narrativesGrid > *', els => els.length);
  for (let i = 0; i < Math.min(3, n); i++) {
    await page.evaluate(i => { const el = document.querySelectorAll('#narrativesGrid > *')[i]; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); }, i);
    await shot('03-narr-' + (i + 1));
  }
  boxes.q1btn = await rect('[data-step-main="q1"]');
  await page.click('[data-step-main="q1"]');
  await page.waitForTimeout(500);

  // 3. STEP 2 · 객관식 관점 고르기 (질문 1~3)
  for (let q = 0; q < 3; q++) {
    await scrollTo('#choicePrompt', 64);
    await shot(`04-q${q + 1}-empty`);
    const opts = await page.$$eval('#choiceStep [data-choice-option]', els => els.map(e => e.dataset.choiceOption));
    const id = PICKS[q] && opts.includes(PICKS[q]) ? PICKS[q] : opts[0];
    await page.$eval(`[data-choice-option="${id}"]`, el => el.click());   // 화면을 움직이지 않고 누르기
    boxes['opt' + q] = await rect(`[data-choice-option="${id}"]`);
    await shot(`05-q${q + 1}-picked`);
    boxes['next' + q] = await rect('[data-step-main="q2"]');
    await page.click('[data-step-main="q2"]');
    await page.waitForTimeout(500);
  }

  // 4. STEP 3 · 한 줄 소감 (통계 동의는 켜지 않음)
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
  await scrollTo('#reflectRecap', 64);
  for (const [i, len] of [[0, 0], [1, 12], [2, 24], [3, REFLECT.length]]) {
    await page.fill('#reflectInput', REFLECT.slice(0, len));
    await shot('06-type-' + i);
  }
  boxes.make = await rect('[data-step-main="q3"]');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForTimeout(900);

  // 5. My Memory Card
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('07-card-page');
  await page.$eval('#memoryCard', el => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.locator('#memoryCard').screenshot({ path: path.join(OUT, '08-card.png') });
  const db = await page.evaluate(() => window.__mockDb.read());
  console.log('서버 저장(가짜 DB):', db.exploration_choices.length, db.shared_expressions.length);
  fs.writeFileSync(path.join(OUT, 'boxes.json'), JSON.stringify(boxes, null, 1));
  console.log(boxes);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
