/* '③ 질문하는 AI' 테스트 — 실행: npm test
   · 함수 순수 부분(supabase/functions/ask-ai/core.mjs): 입력 검증 · system prompt · 응답 정규화(근거 id 대조)
   · 화면 순수 부분(ask-ai.js): 상태기 · 답 검사
   · 데이터: fourth-narrator-data.js의 dialogue가 사건마다 3개이고 근거 id가 실재 · data.json이 빌드 결과와 같음
   · 배선: index.html 컨테이너·스크립트 순서 · 비밀 키 없음 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const core = require('../supabase/functions/ask-ai/core.mjs');
const AskAi = require('../ask-ai.js');
const data = require('../supabase/functions/ask-ai/data.json');
const fourth = require('../fourth-narrator-data.js');
const eventsData = require('../events-data.js');
const sources = require('../sources-data.js');
const aiData = require('../ai-narratives-data.js');

const imjin = data.events.imjin;
const history1 = [{ role: 'assistant', content: imjin.dialogue[0].q }, { role: 'user', content: '일본어 답변은 ‘보냈다’고 썼어요.' }];
const history2 = history1.concat([{ role: 'assistant', content: '반응\n\n두 번째 질문' }, { role: 'user', content: '중국어 답변에 백성이 없었어요.' }]);

/* ---------- 데이터 ---------- */

test('dialogue: 모든 사건에 미리 써 둔 질문 3개, 근거 id는 사이트 자료에 실재한다', () => {
  eventsData.forEach(e => {
    const d = fourth.dialogue[e.id];
    assert.ok(Array.isArray(d) && d.length === 3, `${e.id}: 질문 3개 필요`);
    d.forEach((item, i) => {
      assert.ok(typeof item.q === 'string' && item.q.trim().length >= 10, `${e.id}[${i}] 질문 문장`);
      assert.ok(Array.isArray(item.evidence) && item.evidence.length >= 1, `${e.id}[${i}] 근거 1개 이상`);
      item.evidence.forEach(ev => assert.ok(core.isValidEvidence(data.events[e.id], ev), `${e.id}[${i}] 근거 없음: ${ev.kind}:${ev.id}`));
      assert.ok(!/편향|틀렸|옳|정답/.test(item.q), `${e.id}[${i}] 판정형 낱말 금지`);
    });
    assert.ok(/[?？]/.test(d[0].q) && /[?？]/.test(d[1].q), `${e.id}[0]·[1]은 질문`);
    assert.ok(!/[?？]/.test(d[2].q), `${e.id}[2]는 더 답할 수 없는 자리라 질문이 아닌 마무리 글`);
  });
});

test('data.json은 tools/build-ask-ai-data.mjs 결과와 같다 (원천 데이터를 바꾸면 다시 생성해 커밋)', async () => {
  const tool = await import('../tools/build-ask-ai-data.mjs');
  const built = tool.serialize(tool.build());
  const onDisk = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'ask-ai', 'data.json'), 'utf8');
  assert.equal(onDisk, built, 'node tools/build-ask-ai-data.mjs 를 실행하세요');
});

test('data.json: 사건마다 세 나라 서술·AI 답변 9건(한국어 텍스트)·사료·관찰·dialogue가 들어 있다', () => {
  eventsData.forEach(e => {
    const ev = data.events[e.id];
    assert.ok(ev, e.id);
    ['korea', 'japan', 'china'].forEach(k => assert.equal(ev.narratives[k].text, e[k].text));
    assert.equal(ev.ai.length, aiData.records.filter(r => r.eventId === e.id).length);
    ev.ai.forEach(r => {
      assert.match(r.id, /^(ko|ja|zh)-[1-3]$/);
      assert.ok(r.textKo.length > 50, `${e.id}/${r.id} 한국어 텍스트`);
      if (r.lang === 'ko') assert.equal(r.originalHead, null); else assert.ok(r.originalHead.length <= 200 && r.originalHead.length > 0);
    });
    assert.equal(ev.sources.length, sources.filter(s => s.eventId === e.id).length);
    assert.ok(ev.sources.every(s => s.id && s.title && !('url' in s)), '사료는 메타만');
    assert.deepEqual(ev.dialogue, fourth.dialogue[e.id]);
  });
});

/* ---------- core.mjs ---------- */

test('validateInput: 정상 입력(turn 1·2)은 통과하고 history를 다듬는다', () => {
  const r1 = core.validateInput({ eventId: 'imjin', turn: 1, history: history1 }, data);
  assert.equal(r1.error, undefined);
  assert.equal(r1.history.length, 2);
  const r2 = core.validateInput({ eventId: 'imjin', turn: 2, history: history2.map(m => ({ ...m, content: '  ' + m.content + ' ' })) }, data);
  assert.equal(r2.error, undefined);
  assert.equal(r2.history[3].content, '중국어 답변에 백성이 없었어요.');
});

test('validateInput: 잘못된 eventId · turn 3 · history 4개 초과 · 역할 순서 · 빈 답 · 600자 초과는 400(error)', () => {
  const bad = [
    { eventId: 'nope', turn: 1, history: history1 },
    { eventId: 'imjin', turn: 3, history: history2 },
    { eventId: 'imjin', turn: 2, history: history2.concat([{ role: 'assistant', content: 'x' }]) },
    { eventId: 'imjin', turn: 1, history: history2 },
    { eventId: 'imjin', turn: 1, history: [history1[1], history1[0]] },
    { eventId: 'imjin', turn: 1, history: [history1[0], { role: 'user', content: '   ' }] },
    { eventId: 'imjin', turn: 1, history: [history1[0], { role: 'user', content: '가'.repeat(601) }] },
    { eventId: 'imjin', turn: 1, history: [history1[0], { role: 'user', content: 42 }] },
    null, [], 'x'
  ];
  bad.forEach((b, i) => assert.ok(typeof core.validateInput(b, data).error === 'string', `case ${i}`));
});

test('validateInput: 프로토타입 키(constructor 등)는 사건 id로 통과하지 않는다', () => {
  ['constructor', '__proto__', 'toString', 'hasOwnProperty'].forEach(k => assert.match(core.validateInput({ eventId: k, turn: 1, history: history1 }, data).error, /알 수 없는 사건/));
});

test('validateInput: history[0]은 그 사건의 미리 써 둔 첫 질문이어야 한다', () => {
  assert.match(core.validateInput({ eventId: 'imjin', turn: 1, history: [{ role: 'assistant', content: '다른 첫 질문' }, history1[1]] }, data).error, /첫 질문/);
  assert.match(core.validateInput({ eventId: 'hiroshima', turn: 1, history: history1 }, data).error, /첫 질문/);
});

test('validateInput: 학생 메시지에 이메일·전화번호가 있으면 400 (클라이언트와 같은 패턴)', () => {
  assert.match(core.validateInput({ eventId: 'imjin', turn: 1, history: [history1[0], { role: 'user', content: '제 메일은 kim@school.ac.kr' }] }, data).error, /이메일·전화번호/);
  assert.match(core.validateInput({ eventId: 'imjin', turn: 1, history: [history1[0], { role: 'user', content: '010-1234-5678로 연락' }] }, data).error, /이메일·전화번호/);
  assert.equal(String(core.PII.email), String(AskAi.PII.email));
  assert.equal(String(core.PII.phone), String(AskAi.PII.phone));
});

test('limitStatus: 기록 뒤에 세므로 limit까지는 통과, limit+1부터 429, 조회 실패·count 없음은 503', () => {
  const L = { perIp: 30, perDay: 1000 };
  const ok = n => ({ count: n, error: null });
  assert.equal(core.limitStatus(ok(29), ok(999), L), null);
  assert.equal(core.limitStatus(ok(30), ok(1000), L), null);
  assert.equal(core.limitStatus(ok(31), ok(1), L), 429);
  assert.equal(core.limitStatus(ok(1), ok(1001), L), 429);
  assert.equal(core.limitStatus({ count: null, error: { message: 'relation does not exist' } }, ok(1), L), 503);
  assert.equal(core.limitStatus(ok(1), { count: null, error: null }, L), 503);
  assert.equal(core.limitStatus(undefined, ok(1), L), 503);
});

test('isAllowedOrigin: 배포 주소·localhost만 허용, 없거나 다른 출처·경로 붙은 것은 403 대상', () => {
  ['https://oseungye.github.io', 'http://localhost:8000', 'http://127.0.0.1:5500', 'http://localhost'].forEach(o => assert.equal(core.isAllowedOrigin(o), true, o));
  ['', null, undefined, 'https://oseungye.github.io/', 'https://evil.example', 'http://oseungye.github.io', 'https://oseungye.github.io.evil.example', 'https://ohseungwan.github.io'].forEach(o => assert.equal(core.isAllowedOrigin(o), false, String(o)));
});

test('buildMessages: user로 시작하고 학생 글은 그대로', () => {
  const m = core.buildMessages(history1);
  assert.equal(m[0].role, 'user');
  assert.deepEqual(m.slice(1), history1);
});

test('buildSystemPrompt: 세 나라 서술·AI 답변 9건·사료·관찰 전문과 규칙(판정·역할극 금지, 자료 밖 확인 불가)을 담는다', () => {
  const p1 = core.buildSystemPrompt(imjin, 1);
  ['korea', 'japan', 'china'].forEach(k => assert.ok(p1.includes(imjin.narratives[k].text), k));
  imjin.ai.forEach(r => assert.ok(p1.includes(`[ai:${r.id}]`) && p1.includes(r.textKo.slice(0, 40)), r.id));
  imjin.sources.forEach(s => assert.ok(p1.includes(`[source:${s.id}]`), s.id));
  imjin.observations.forEach(o => assert.ok(p1.includes(o)));
  assert.match(p1, /### 편집자가 고른 핵심 빈자리/);
  imjin.keyGaps.forEach(g => assert.ok(p1.includes(g.note), 'keyGaps note'));
  assert.doesNotMatch(core.buildSystemPrompt(Object.assign({}, imjin, { keyGaps: [] }), 1), /핵심 빈자리/);
  assert.match(p1, /확인할 수 없다/);
  assert.match(p1, /판정하지 않습니다/);
  assert.match(p1, /연기하지 않습니다/);
  assert.match(p1, /대신 써 주거나/);
  assert.match(p1, /첫 번째 답/);
  assert.match(core.buildSystemPrompt(imjin, 2), /question은 null/);
});

test('SCHEMA: structured output 요건 (additionalProperties:false · required 전부)', () => {
  assert.equal(core.SCHEMA.additionalProperties, false);
  assert.deepEqual(core.SCHEMA.required.slice().sort(), ['evidence', 'question', 'reply']);
  assert.equal(core.SCHEMA.properties.evidence.items.additionalProperties, false);
  assert.deepEqual(core.SCHEMA.properties.evidence.items.properties.kind.enum, ['narrative', 'ai', 'source']);
});

test('normalizeReply: 없는 근거 id는 버리고 중복은 합치며, 300자 초과 reply는 자른다', () => {
  const out = core.normalizeReply(JSON.stringify({
    reply: '가'.repeat(400),
    question: '다음 질문',
    evidence: [
      { kind: 'ai', id: 'ja-1' }, { kind: 'ai', id: 'ja-1' }, { kind: 'ai', id: 'ja-9' },
      { kind: 'narrative', id: 'japan' }, { kind: 'narrative', id: 'usa' },
      { kind: 'source', id: 'imjin-sillok-01' }, { kind: 'source', id: 'hiroshima-ussbs-01' }, { kind: 'web', id: 'x' }, null
    ]
  }), imjin, 1);
  assert.equal(out.reply.length, 300);
  assert.equal(out.question, '다음 질문');
  assert.deepEqual(out.evidence, [{ kind: 'ai', id: 'ja-1' }, { kind: 'narrative', id: 'japan' }, { kind: 'source', id: 'imjin-sillok-01' }]);
});

test('normalizeReply: turn 2면 question은 null, turn 1에 질문이 비면 null(클라이언트가 사전 질문 사용)', () => {
  const body = JSON.stringify({ reply: '마무리', question: '또 질문', evidence: [{ kind: 'narrative', id: 'korea' }] });
  assert.equal(core.normalizeReply(body, imjin, 2).question, null);
  assert.equal(core.normalizeReply(JSON.stringify({ reply: '반응', question: null, evidence: [{ kind: 'narrative', id: 'korea' }] }), imjin, 1).question, null);
});

test('normalizeReply: JSON 아님 · reply 비어 있음 · 유효 근거 0개 → fallback (근거 없는 답은 보여 주지 않음)', () => {
  assert.deepEqual(core.normalizeReply('죄송하지만 답할 수 없습니다', imjin, 1), { fallback: true });
  assert.deepEqual(core.normalizeReply(JSON.stringify({ reply: '  ', question: 'q', evidence: [{ kind: 'narrative', id: 'korea' }] }), imjin, 1), { fallback: true });
  assert.deepEqual(core.normalizeReply(JSON.stringify({ reply: '반응', question: 'q', evidence: [{ kind: 'ai', id: 'en-1' }] }), imjin, 1), { fallback: true });
  assert.deepEqual(core.normalizeReply('[]', imjin, 1), { fallback: true });
});

/* ---------- ask-ai.js ---------- */

test('nextState: idle → q1 → wait1 → q2 → wait2 → done, 정해지지 않은 전이는 머문다', () => {
  const steps = ['idle', 'start', 'q1', 'submit', 'wait1', 'reply', 'q2', 'submit', 'wait2', 'reply', 'done'];
  for (let i = 0; i + 2 < steps.length; i += 2) assert.equal(AskAi.nextState(steps[i], steps[i + 1]), steps[i + 2]);
  assert.equal(AskAi.nextState('done', 'submit'), 'done');
  assert.equal(AskAi.nextState('wait1', 'submit'), 'wait1');
  assert.equal(AskAi.nextState('idle', 'reply'), 'idle');
});

test('validateAnswer: 빈 답·600자 초과·이메일·전화번호는 보내지 않고, 연도가 든 보통 답은 통과', () => {
  assert.equal(AskAi.validateAnswer('   ').ok, false);
  assert.equal(AskAi.validateAnswer('가'.repeat(601)).ok, false);
  assert.match(AskAi.validateAnswer('가'.repeat(601)).message, /600자/);
  assert.equal(AskAi.validateAnswer('저는 kim@school.ac.kr 입니다').ok, false);
  assert.equal(AskAi.validateAnswer('연락처 010-1234-5678').ok, false);
  assert.equal(AskAi.validateAnswer('02 123 4567로 전화').ok, false);
  const ok = AskAi.validateAnswer('  1592년부터 1598년까지 일본군이 조선에 왔고, 명나라가 참전했어요. ');
  assert.deepEqual(ok, { ok: true, text: '1592년부터 1598년까지 일본군이 조선에 왔고, 명나라가 참전했어요.' });
  assert.equal(AskAi.validateAnswer('가'.repeat(600)).ok, true);
  assert.equal(AskAi.MAX_ANSWER, core.MAX_ANSWER);
});

/* ---------- 배선·보안 ---------- */

test('index.html: #askAi 컨테이너는 네 번째 서술자 탭 안, ask-ai.js는 supabase-config.js 뒤·script.js 앞', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const fourthTab = html.slice(html.indexOf('data-tab-content="fourth"'), html.indexOf('data-tab-content="ai"'));
  assert.match(fourthTab, /id="askAi"/);
  assert.match(fourthTab, /id="memoryGaps"[\s\S]*id="askAi"/);
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
  const at = srcs.indexOf('./ask-ai.js');
  assert.ok(at > srcs.indexOf('./supabase-config.js') && at < srcs.indexOf('./script.js'), srcs.join(', '));
  // 안내 문구는 ask-ai.js가 그립니다
  assert.equal(AskAi.NOTICE, '이 사이트는 답을 저장하지 않습니다. 답은 AI 서비스(Anthropic)로 전송되어 그 쪽 정책에 따라 처리됩니다. 이름·개인정보는 쓰지 마세요.');
});

test('script.js: 네 번째 서술자 탭을 그릴 때 AskAi.mount, 사건을 열 때 AskAi.reset', () => {
  const js = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  assert.match(js, /AskAi\.mount\(event\)/);
  assert.match(js, /AskAi\.reset\(\)/);
});

test('함수·도구·SQL·문서에 API 키·service_role 값이 없다', () => {
  const files = [
    'ask-ai.js', 'tools/build-ask-ai-data.mjs', 'supabase/functions/ask-ai/index.ts', 'supabase/functions/ask-ai/core.mjs',
    'supabase/functions/ask-ai/data.json', 'supabase/2026-10-ask-ai-limit.sql', 'docs/ask-ai-runbook.md'
  ];
  files.forEach(f => {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(text, /sk-ant-[A-Za-z0-9_-]{10,}/, f);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, `${f}: JWT 모양`);
    assert.doesNotMatch(text, /sb_secret_[A-Za-z0-9_]+/, f);
  });
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/ask-ai/index.ts'), 'utf8');
  assert.doesNotMatch(fn, /console\.log\(/, '모델 응답·학생 답을 로그에 남기지 않음');
  assert.match(fn, /claude-opus-5-5/);
  assert.match(fn, /server-side-fallback-2026-07-01/);
  assert.match(fn, /effort: 'low'/);
  assert.doesNotMatch(fn, /\b(temperature|top_p|thinking)\s*:/);
});

test('SQL: ask_ai_calls는 anon 권한 전부 회수, RLS, 7일 정리 함수', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/2026-10-ask-ai-limit.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.ask_ai_calls/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.ask_ai_calls from public, anon, authenticated/);
  assert.match(sql, /interval '7 days'/);
  assert.doesNotMatch(sql, /grant .* to anon/);
});
