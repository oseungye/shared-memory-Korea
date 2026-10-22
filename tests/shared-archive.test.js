/* Shared Archive · 공개 게시물 관리 테스트 — 실행: npm test */
const test = require('node:test');
const assert = require('node:assert/strict');

global.self = global.self || {};
require('../shared-store.js');
const Store = global.self.SharedStore;
const Guide = require('../contribution-guide.js');

test('아카이브에는 공개 동의 분리 배포 이후 제안만 들어간다 (시범 제안 제외)', () => {
  assert.equal(Store.isArchivable({ id: 1, createdAt: '2026-10-08T03:00:00Z' }), false);
  assert.equal(Store.isArchivable({ id: 2, createdAt: '2026-10-16T12:59:59Z' }), false);
  assert.equal(Store.isArchivable({ id: 3, createdAt: Store.ARCHIVE_SINCE }), true);
  assert.equal(Store.isArchivable({ id: 4, createdAt: '2026-11-01T00:00:00Z' }), true);
  assert.equal(Store.isArchivable({ id: 5, createdAt: null }), false);
  assert.equal(Store.isArchivable({ id: 6, createdAt: 'not a date' }), false);
  assert.equal(Store.isArchivable(null), false);
});

test('숨김 목록의 제안은 아카이브와 목록 어디에도 나오지 않는다', async () => {
  // 배포 상태의 숨김 목록은 운영자가 확인한 정수 id만 (README '부적절 게시물 관리 방침')
  const deployed = Store.HIDDEN_EXPRESSION_IDS.slice();
  assert.ok(deployed.every(Number.isInteger), String(deployed));
  assert.deepEqual(deployed, [11, 14], '시범 운영 빈칸 잔존 제안 2건만 숨김');
  Store.HIDDEN_EXPRESSION_IDS.push(42);
  try {
    assert.equal(Store.isHidden(42), true);
    assert.equal(Store.isHidden('42'), true);
    assert.equal(Store.isArchivable({ id: 42, createdAt: '2026-11-01T00:00:00Z' }), false);
    global.db = { rpc: async () => ({ data: [
      { id: 41, event_key: 'imjin', content: '보임', created_at: '2026-11-01T00:00:00Z' },
      { id: 42, event_key: 'imjin', content: '숨김', created_at: '2026-11-01T00:00:00Z' }
    ], error: null }) };
    const r = await Store.loadExpressions('imjin');
    assert.deepEqual(r.data.map(x => x.id), [41]);
  } finally {
    Store.HIDDEN_EXPRESSION_IDS.splice(0, Store.HIDDEN_EXPRESSION_IDS.length, ...deployed);
    delete global.db;
  }
});

test('공개 문장의 링크·이메일·전화번호는 막고, 연도·날짜는 통과시킨다', () => {
  ['자세한 건 https://example.com', 'www.example.kr 참고', 'example.com 에서', 'me@test.org 로 연락',
    '010-1234-5678', '01012345678', '02 123 4567', '090-1234-5678'].forEach(t => {
    assert.equal(Guide.checkPublicText(t).ok, false, t);
  });
  ['1592년부터 1598년까지', '1945 1952 1965 1991', '1592.4.13 부산 상륙', '약 20 1592 1598',
    '日本侵略朝鲜，明朝出兵援助的战争。', 'Ming.Dynasty 와 조선', ''].forEach(t => {
    assert.equal(Guide.checkPublicText(t).ok, true, t);
  });
  assert.match(Guide.PUBLIC_TEXT_MESSAGE, /링크·이메일·전화번호/);
});
