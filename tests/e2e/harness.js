/* 브라우저 E2E 공통 실행기 (Playwright)
   종료 코드 — 실행되지 않은 테스트가 성공처럼 보이지 않도록 구분합니다.
     0 = 실제로 브라우저에서 실행되어 모든 확인 항목이 통과
     1 = 실패 (확인 항목 실패 · 실행 중 오류 · 확인 항목 0개)
     2 = 실행하지 못함(SKIPPED) — Playwright 또는 브라우저를 찾지 못함
         (E2E_ALLOW_SKIP=1 이면 0으로 끝나지만 출력에는 SKIPPED로 남습니다)
   마지막 줄에 기계가 읽을 수 있는 결과를 출력합니다: E2E_RESULT {...}
   환경 변수: PLAYWRIGHT_MODULE(모듈 경로), CHROMIUM_PATH(브라우저 실행 파일), E2E_ALLOW_SKIP */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function finish(name, status, info) {
  const result = Object.assign({ name, status }, info || {});
  console.log(`\nE2E_RESULT ${JSON.stringify(result)}`);
  if (status === 'PASS') process.exit(0);
  if (status === 'SKIPPED') process.exit(process.env.E2E_ALLOW_SKIP === '1' ? 0 : 2);
  process.exit(1);
}

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  for (const c of candidates) {
    try {
      const mod = require(c);
      let version = 'unknown';
      try { version = require(path.join(path.dirname(require.resolve(c)), 'package.json')).version; } catch (e) { /* 버전 정보 없음 */ }
      return { mod, version, from: c };
    } catch (e) { /* 다음 후보 */ }
  }
  return null;
}

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/**
 * 가짜 Supabase를 쓰는 페이지 (실제 DB 접속 없음).
 * 같은 주소 밖 요청은 모두 막고, supabase-js 요청(CDN 또는 vendor 파일)만 mock-supabase.js로 바꿉니다.
 * Playwright는 나중에 등록한 route를 먼저 적용하므로 차단 규칙을 먼저 등록합니다.
 */
async function mockPage(context, base, opts) {
  const page = await context.newPage();
  // 기본 체험 첫 진입의 진행 안내(대화 상자)는 다른 테스트의 클릭을 가리므로 건너뜁니다. 안내 자체는 { guide: true }로 확인.
  if (!(opts && opts.guide)) await page.addInitScript(() => { window.__SM_SKIP_GUIDE = true; });
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  page.on('dialog', d => (page.__dialogAnswer === false ? d.dismiss() : d.accept()));
  await page.route(url => !url.href.startsWith(base), r => r.abort());
  await page.route(/supabase-js|vendor\/supabase/, r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  return page;
}

/** 이 창에서 "같은 학생이 이어서 참여"를 이미 고른 상태로 만듭니다 (선택 창이 없는 버전에서는 아무 영향 없음). */
function presetContinueScript() {
  return () => {
    try { sessionStorage.setItem('sm_session_choice', JSON.stringify({ choice: 'continue', at: Date.now() })); } catch (e) { /* 무시 */ }
  };
}

async function run(name, body) {
  const started = new Date();
  const pw = loadPlaywright();
  if (!pw) {
    console.log(`SKIPPED: ${name} — Playwright 모듈을 찾을 수 없어 테스트를 실행하지 않았습니다.`);
    console.log('  설치: npm i -D playwright && npx playwright install chromium   (또는 PLAYWRIGHT_MODULE=<경로>)');
    finish(name, 'SKIPPED', { reason: 'playwright-not-found' });
  }
  let browser;
  try {
    const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
    browser = await pw.mod.chromium.launch(opts);
  } catch (e) {
    console.log(`SKIPPED: ${name} — Chromium 브라우저를 실행할 수 없어 테스트를 실행하지 않았습니다.`);
    console.log(`  원인: ${String(e.message).split('\n')[0]}`);
    console.log('  설치: npx playwright install --with-deps chromium   (또는 CHROMIUM_PATH=<실행 파일>)');
    finish(name, 'SKIPPED', { reason: 'browser-launch-failed' });
  }
  const evidence = {
    playwright: pw.version,
    browser: `chromium ${browser.version()}`,
    executable: (() => { try { return pw.mod.chromium.executablePath(); } catch (e) { return process.env.CHROMIUM_PATH || 'unknown'; } })(),
    node: process.version,
    started: started.toISOString()
  };
  console.log(`[${name}] Playwright ${evidence.playwright} · ${evidence.browser} · ${evidence.executable} · Node ${evidence.node} · ${evidence.started}`);

  const results = [];
  const check = (label, cond, detail) => {
    results.push({ label, ok: !!cond });
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${!cond && detail ? ' — ' + detail : ''}`);
  };
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  let error = null;
  try {
    await body({ browser, base, check, mockPage: (ctx, opts) => mockPage(ctx, base, opts), presetContinue: presetContinueScript() });
  } catch (e) {
    error = e;
    console.error(`실행 오류: ${e && e.stack ? e.stack : e}`);
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  const failed = results.filter(r => !r.ok).length;
  const info = Object.assign({}, evidence, {
    passed: results.length - failed,
    total: results.length,
    durationMs: Date.now() - started.getTime(),
    error: error ? String(error.message || error).split('\n')[0] : undefined
  });
  console.log(`\n${info.passed}/${info.total} 통과`);
  const status = error || failed || results.length === 0 ? 'FAIL' : 'PASS';
  if (results.length === 0 && !error) console.log('확인 항목이 하나도 실행되지 않았습니다 → 실패로 처리합니다.');
  finish(name, status, info);
}

module.exports = { run, ROOT };
