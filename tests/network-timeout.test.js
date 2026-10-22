/* 네트워크 응답이 오지 않을 때 — 실행: npm test
   · 행사장·교실 와이파이에서 Supabase 응답이 멈추면 '등록 중...'·'불러오는 중'에 영원히 머물렀습니다.
   · supabase-config.js의 제한 시간(fetchWithTimeout)이 요청을 멈추고, shared-store.js가 안내 문구를 돌려주는지 확인합니다.
   · 실제 vendor supabase-js + 응답하지 않는 가짜 fetch (실제 DB 접속 없음). 시간은 짧게 줄여서 실행합니다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const LIB = fs.readFileSync(path.join(ROOT, 'vendor', 'supabase-js', 'supabase.js'), 'utf8');
const CONFIG = fs.readFileSync(path.join(ROOT, 'supabase-config.js'), 'utf8');

global.self = global.self || {};
require('../shared-store.js');
const Store = global.self.SharedStore;

/** 응답하지 않는 서버. 요청이 멈추면(abort) 브라우저처럼 AbortError로 끝납니다. */
function hangingFetch(requests) {
  return (url, init) => new Promise((resolve, reject) => {
    requests.push(String(url));
    const signal = init && init.signal;
    if (signal) signal.addEventListener('abort', () => {
      const e = new Error('The operation was aborted.');
      e.name = 'AbortError';
      reject(e);
    });
  });
}

/** 브라우저처럼 supabase-config.js를 실행해 만든 db 클라이언트 (제한 시간만 짧게) */
function configuredClient(fetchImpl) {
  const sandbox = {
    window: {},
    fetch: fetchImpl,
    setTimeout: (fn) => setTimeout(fn, 20),
    clearTimeout,
    setInterval: (...args) => { const t = setInterval(...args); t.unref(); return t; },   // 인증 자동 갱신 타이머가 테스트를 붙잡지 않도록
    clearInterval,
    WebSocket, TextEncoder, TextDecoder, atob, btoa, queueMicrotask,
    AbortController, Headers, Request, Response, URL, URLSearchParams, Promise, Error, Object, console
  };
  vm.createContext(sandbox);
  vm.runInContext(LIB, sandbox, { filename: 'vendor/supabase-js/supabase.js' });
  sandbox.window.supabase = sandbox.supabase;
  vm.runInContext(CONFIG, sandbox, { filename: 'supabase-config.js' });
  return vm.runInContext('({ db, SUPABASE_TIMEOUT_MS })', sandbox);
}

test('supabase-config.js: 모든 요청에 제한 시간(15초 이하)을 둔다', () => {
  const { db, SUPABASE_TIMEOUT_MS } = configuredClient(hangingFetch([]));
  assert.ok(db && typeof db.from === 'function');
  assert.ok(SUPABASE_TIMEOUT_MS > 0 && SUPABASE_TIMEOUT_MS <= 15000, String(SUPABASE_TIMEOUT_MS));
});

test('응답이 없으면 등록이 멈추지 않고, 이미 저장됐을 수 있다고 안내한다', async () => {
  const requests = [];
  global.db = configuredClient(hangingFetch(requests)).db;
  try {
    const res = await Store.insertExpression({ eventKey: 'imjin', content: '임진왜란은 조선과 명, 일본이 얽힌 전쟁이었다.', lang: 'ko' });
    assert.equal(res.ok, false);
    assert.match(res.error, /서버 응답이 늦어/);
    assert.match(res.error, /목록/);                 // 다시 등록하기 전에 목록을 확인하도록
    assert.equal(requests.length, 1);                // 시간 초과는 '컬럼 없음'으로 오인해 다시 보내지 않음
  } finally { delete global.db; }
});

test('응답이 없으면 불러오기가 오류 안내로 끝나고, 테이블로 다시 묻지 않는다', async () => {
  const requests = [];
  global.db = configuredClient(hangingFetch(requests)).db;
  try {
    const res = await Store.loadExpressions('imjin');
    assert.deepEqual(res.data, []);
    assert.match(res.error, /서버 응답이 늦어/);
    assert.equal(requests.length, 1);
    assert.match(requests[0], /rpc\/public_expressions/);
    const summary = await Store.fetchParticipationSummary();
    assert.equal(summary.available, false);           // 참여자 수 문구는 숨김
  } finally { delete global.db; }
});

test('정상 응답은 제한 시간의 영향을 받지 않는다', async () => {
  const { db } = configuredClient(async () => new Response(JSON.stringify([{ id: 7, event_key: 'imjin', content: '문장', created_at: '2026-10-20T00:00:00Z' }]), { status: 200, headers: { 'content-type': 'application/json' } }));
  global.db = db;
  try {
    const res = await Store.loadExpressions('imjin');
    assert.equal(res.error, null);
    assert.equal(res.data.length, 1);
  } finally { delete global.db; }
});
