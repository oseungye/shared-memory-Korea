/* Supabase JS 저장소 내 보관(vendor) 테스트 — 실행: npm test
   · 실제 vendor 파일을 불러와 shared-store.js와 함께 동작하는지 가짜 HTTP(fetch)로 확인합니다. (실제 DB 접속 없음) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'supabase-js');
const VERSION = JSON.parse(fs.readFileSync(path.join(VENDOR_DIR, 'VERSION.json'), 'utf8'));
const LIB = fs.readFileSync(path.join(VENDOR_DIR, 'supabase.js'));
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

global.self = global.self || {};
require('../shared-store.js');
const Store = global.self.SharedStore;

// 브라우저에서처럼 전역 `supabase`를 만듭니다.
vm.runInThisContext(LIB.toString('utf8'), { filename: 'vendor/supabase-js/supabase.js' });

test('vendor 파일: 정확한 2.x 버전으로 고정되어 있고 기록된 해시와 일치한다 (변조·교체 감지)', () => {
  assert.equal(VERSION.package, '@supabase/supabase-js');
  assert.match(VERSION.version, /^2\.\d+\.\d+$/);
  assert.equal(VERSION.license, 'MIT');
  assert.match(VERSION.npmIntegrity, /^sha512-/);
  assert.equal(crypto.createHash('sha256').update(LIB).digest('hex'), VERSION.fileSha256);
  const license = fs.readFileSync(path.join(VENDOR_DIR, 'LICENSE'), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Supabase/);
});

test('index.html: 외부 CDN 스크립트 없이 vendor 파일을 supabase-config.js보다 먼저 불러온다', () => {
  const srcs = [...HTML.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.every(s => !/^https?:\/\//.test(s) && !s.startsWith('//')), srcs.join(', '));
  const vendorAt = srcs.indexOf('./vendor/supabase-js/supabase.js');
  assert.ok(vendorAt >= 0);
  assert.ok(vendorAt < srcs.indexOf('./supabase-config.js'));
  assert.ok(!/cdn\.jsdelivr\.net\/npm\/@supabase/.test(HTML));
});

test('프론트엔드 파일에 비밀 키·service_role JWT가 없고, 공개(publishable) 키만 쓴다', () => {
  const files = fs.readdirSync(ROOT).filter(f => /\.(js|html)$/.test(f));
  files.forEach(f => {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(text, /sb_secret_[A-Za-z0-9_]+/, f);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, f);   // JWT (anon/service_role 레거시 키)
  });
  const config = fs.readFileSync(path.join(ROOT, 'supabase-config.js'), 'utf8');
  assert.match(config, /"sb_publishable_[A-Za-z0-9_]+"/);
});

test('vendor 라이브러리가 브라우저 전역 supabase.createClient를 제공한다', () => {
  assert.equal(typeof global.supabase, 'object');
  assert.equal(typeof global.supabase.createClient, 'function');
  const c = global.supabase.createClient('https://example.supabase.co', 'sb_publishable_test');
  assert.equal(typeof c.from, 'function');
  assert.equal(typeof c.rpc, 'function');
});

/** 가짜 HTTP 응답으로 실제 supabase-js 클라이언트를 만듭니다. */
function clientWith(handler) {
  const requests = [];
  const fetch = async (url, init) => {
    const req = { url: String(url), method: (init && init.method) || 'GET', body: init && init.body ? JSON.parse(init.body) : null, headers: new Headers(init && init.headers) };
    requests.push(req);
    const out = handler(req);
    if (out instanceof Error) throw out;
    return new Response(out.body == null ? '' : JSON.stringify(out.body), { status: out.status || 200, headers: { 'content-type': 'application/json' } });
  };
  const client = global.supabase.createClient('https://example.supabase.co', 'sb_publishable_test', { global: { fetch } });
  return { client, requests };
}

test('shared-store 호환: 불러오기는 public_expressions RPC로 요청하고 결과를 그대로 매핑한다', async () => {
  const { client, requests } = clientWith(req => req.url.includes('/rpc/public_expressions')
    ? { body: [{ id: 3, event_key: 'imjin', author_name: '익명', content: '전쟁', country_code: 'ko', age_group: null, age_group_suppressed: true }] }
    : { status: 404, body: { message: 'not found' } });
  global.db = client;
  try {
    const r = await Store.loadExpressions('imjin');
    assert.equal(r.error, null);
    assert.equal(r.source, 'rpc');
    assert.equal(r.data[0].text, '전쟁');
    assert.equal(r.data[0].ageSuppressed, true);
    assert.equal(requests[0].method, 'POST');
    assert.match(requests[0].url, /\/rest\/v1\/rpc\/public_expressions$/);
    assert.deepEqual(requests[0].body, { p_event_key: 'imjin', p_limit: Store.LOAD_LIMIT });
    assert.equal(requests[0].headers.get('apikey'), 'sb_publishable_test');
  } finally { delete global.db; }
});

test('shared-store 호환: 등록은 허용 컬럼만 columns로 보내고 id를 받아 참여자 키를 연결한다', async () => {
  const { client, requests } = clientWith(req => req.url.includes('/shared_expressions')
    ? { status: 201, body: [{ id: 42 }] }
    : { status: 201, body: null });
  global.db = client;
  try {
    const r = await Store.insertExpression({ eventKey: 'zainichi', content: '문장', lang: 'ko', ageGroup: '10s', milestones: { viewedCompare: true } });
    assert.equal(r.ok, true);
    assert.equal(r.id, 42);
    const insert = requests[0];
    assert.match(insert.url, /\/rest\/v1\/shared_expressions\?columns=/);
    assert.match(insert.url, /select=id/);
    const cols = decodeURIComponent(insert.url.match(/columns=([^&]+)/)[1]).replace(/"/g, '').split(',');
    assert.ok(!cols.includes('id') && !cols.includes('created_at'));       // DB가 허용하지 않는 컬럼은 보내지 않음
    assert.match(requests[1].url, /\/rest\/v1\/expression_participants/);
    assert.equal(requests[1].body[0].expression_id, 42);
  } finally { delete global.db; }
});

test('shared-store 호환: 공감 수·참여 현황·연령대 RPC', async () => {
  const { client } = clientWith(req => {
    if (req.url.includes('/rpc/empathy_counts')) return { body: [{ expression_id: 3, empathy_count: 2 }] };
    if (req.url.includes('/rpc/participation_summary')) return { body: [{ participants: 10, completed_participants: 6, expressions: 10 }] };
    if (req.url.includes('/rpc/participation_estimate')) return { body: [{ estimated: 0, counted_until: null }] };
    if (req.url.includes('/rpc/age_group_participants')) return { body: [{ age_group: '10s', participants: null }] };
    return { status: 404, body: {} };
  });
  global.db = client;
  try {
    assert.deepEqual((await Store.fetchEmpathyCounts('imjin')).counts, { 3: 2 });
    assert.equal((await Store.fetchParticipationSummary()).participants, 10);
    assert.deepEqual((await Store.fetchAgeGroupParticipants('imjin')).suppressed, ['10s']);
  } finally { delete global.db; }
});

test('네트워크 연결 실패 시 오류로 멈추지 않고 사용자 안내 문구를 돌려준다', async () => {
  const { client } = clientWith(() => new TypeError('Failed to fetch'));
  global.db = client;
  try {
    const list = await Store.loadExpressions('imjin');
    assert.deepEqual(list.data, []);
    assert.match(list.error, /네트워크에 연결할 수 없습니다/);
    const save = await Store.insertExpression({ eventKey: 'imjin', content: '문장', milestones: {} });
    assert.equal(save.ok, false);
    assert.match(save.error, /네트워크에 연결할 수 없습니다/);
    assert.equal((await Store.fetchParticipationSummary()).available, false);
  } finally { delete global.db; }
});
