// 슬라이드 10·11용 실제 화면 캡처 — 가짜 Supabase(tests/e2e/mock-supabase.js), 실제 DB 접속·저장 없음
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('/home/user/shared-memory-Korea/node_modules/playwright');
const ROOT = '/home/user/shared-memory-Korea';
const MOCK = fs.readFileSync(ROOT + '/tests/e2e/mock-supabase.js', 'utf8');
const OUT = path.join(__dirname, 'raw');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net\/gh\/orioncactus|hangeul\.pstatic\.net/;

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  const blocked = new Set();
  await page.route(u => !u.href.startsWith(base) && !FONT_HOSTS.test(u.href), r => { blocked.add(new URL(r.request().url()).host); r.abort(); });
  await page.route(/supabase-js|vendor\/supabase/, r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  const el = async (sel, name) => {
    await page.mouse.move(1, 1); await page.waitForTimeout(300);
    const loc = page.locator(sel).first(); await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await loc.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot', name, sel);
  };
  const dumpKids = async (sel, prefix) => {
    const info = await page.$$eval(sel + ' > *', els => els.map((e, i) => ({ i, cls: e.className, h: Math.round(e.getBoundingClientRect().height), text: e.innerText.slice(0, 90).replace(/\n/g, ' / ') })));
    console.log(JSON.stringify(info, null, 1));
    const kids = await page.$$(sel + ' > *');
    for (let i = 0; i < kids.length; i++) {
      const h = await kids[i].evaluate(e => e.getBoundingClientRect().height);
      if (h > 20) await kids[i].screenshot({ path: path.join(OUT, `${prefix}-${String(i).padStart(2, '0')}.png`) });
    }
  };

  await page.goto(base + 'index.html#/e/imjin');
  await page.waitForSelector('#flowProgress');
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);   // 진행 안내 상자 닫기
  if (await page.$eval('.page--detail', e => e.dataset.mode) === 'quick') await page.click('[data-deep-switch="2"]');
  await page.waitForTimeout(500);
  if (await page.$('#flowProgress [data-step-goto="2"]')) await page.click('#flowProgress [data-step-goto="2"]');
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: '#stepCta,.step-cta{display:none!important}' });   // 화면 아래 고정 버튼이 캡처를 가리지 않게
  console.log('mode/step', await page.$eval('.page--detail', e => e.dataset.mode + ':' + e.dataset.step));

  // 슬라이드 10: 세 나라 서술 + 공통점·차이점
  await el('#narrativesGrid', 'compare-narratives');
  const cards = await page.$$('#narrativesGrid > *');
  for (let i = 0; i < cards.length; i++) await cards[i].screenshot({ path: path.join(OUT, `compare-card-${i + 1}.png`) });
  if (await page.isVisible('#hlLegend')) await el('#hlLegend', 'compare-legend');
  await el('#compareSummary', 'compare-summary');
  await dumpKids('#compareSummary', 'compare-sum');

  // 어떻게 다를까? (단어로 비교)
  await page.click('.tab[data-tab="ai"]'); await page.waitForTimeout(700);
  await el('#aiGlance', 'nlp-glance');
  await dumpKids('#aiGlance', 'nlp-glance');
  await page.click('#aiAnalyzeBtn'); await page.waitForTimeout(1500);
  await el('#aiResult', 'nlp-result-full');
  await dumpKids('#aiResult', 'nlp-part');

  // 슬라이드 11: 네 번째 서술자
  await page.click('.tab[data-tab="fourth"]'); await page.waitForTimeout(900);
  await el('#fourthNarrator', 'fourth-narrator');
  await dumpKids('#fourthNarrator', 'fourth-part');
  await el('#memoryGaps', 'fourth-gaps');

  const db = await page.evaluate(() => window.__mockDb && window.__mockDb.read());
  console.log('가짜 DB 쓰기:', db ? Object.entries(db).map(([k, v]) => k + '=' + (Array.isArray(v) ? v.length : '?')).join(' ') : 'none');
  console.log('막은 외부 요청:', [...blocked].join(', '));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
