/* ============================================================
   Shared Memory Project — supabase/functions/ask-ai/core.mjs
   '③ 질문하는 AI' 함수의 순수 부분: 입력 검증 · system prompt 조립 · 응답 JSON 스키마 · 응답 정규화
   · Deno(index.ts)와 Node 단위 테스트(tests/ask-ai.test.js)가 같은 파일을 씁니다 — 네트워크·환경 변수 없음.
   · data.json(tools/build-ask-ai-data.mjs 생성)에 있는 자료만 근거로 쓰고, 그 밖의 근거 id는 버립니다.
   ============================================================ */

export const NARRATIVE_IDS = ['korea', 'japan', 'china'];
export const NARRATIVE_LABEL = { korea: '한국 측 요약 서술', japan: '일본 측 요약 서술', china: '중국 측 요약 서술' };
export const LANG_LABEL = { ko: '한국어', ja: '일본어', zh: '중국어' };
export const MAX_ANSWER = 600;      // 학생 답 한 번의 최대 글자 수 (클라이언트도 같은 값으로 먼저 검사)
export const MAX_REPLY = 300;       // AI 반응 문장 최대 글자 수
export const MAX_QUESTION = 200;
export const MAX_HISTORY = 4;       // 질문1 · 답1 · 반응+질문2 · 답2
// 개인정보 패턴 — ask-ai.js의 PII와 같아야 합니다(테스트가 검사). 클라이언트가 먼저 막고, 함수가 다시 막습니다.
export const PII = { email: /[\w.+-]+@[\w-]+\.[\w.-]+/, phone: /(^|\D)0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(\D|$)/ };

// 허용 출처: 배포 사이트 + 로컬 개발 서버. 그 밖(또는 Origin 없음)은 403. (index.ts가 씀, 테스트 가능하도록 여기에)
const ALLOWED_ORIGIN = /^(https:\/\/oseungye\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
export function isAllowedOrigin(origin) { return typeof origin === 'string' && ALLOWED_ORIGIN.test(origin); }

/** 모델이 반드시 이 모양으로만 답하게 하는 JSON 스키마 (structured output) */
export const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: '학생 답에 대한 짧은 반응 (한국어, 2문장 이내, 300자 이내). 판정·점수 없음.' },
    question: { type: ['string', 'null'], description: '다음 질문 1개 (turn 1) 또는 null (turn 2, 마무리)' },
    evidence: {
      type: 'array',
      description: '반응의 근거가 되는 사이트 자료 id. 1개 이상.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['narrative', 'ai', 'source'] },
          id: { type: 'string' }
        },
        required: ['kind', 'id'],
        additionalProperties: false
      }
    }
  },
  required: ['reply', 'question', 'evidence'],
  additionalProperties: false
};

/**
 * 요청 본문을 검사합니다. 틀리면 { error } (→ 400), 맞으면 { eventId, turn, history }.
 * history는 [질문1(assistant), 답1(user)] 또는 [질문1, 답1, 반응+질문2(assistant), 답2(user)] — 길이가 turn*2.
 */
export function validateInput(body, data) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '요청 본문이 JSON 객체가 아닙니다' };
  const event = data && data.events && typeof body.eventId === 'string' && Object.hasOwn(data.events, body.eventId) ? data.events[body.eventId] : null;
  if (!event) return { error: '알 수 없는 사건 id입니다' };
  const turn = body.turn;
  if (turn !== 1 && turn !== 2) return { error: 'turn은 1 또는 2여야 합니다 (대화는 두 번만)' };
  const history = body.history;
  if (!Array.isArray(history) || history.length > MAX_HISTORY || history.length !== turn * 2) {
    return { error: `history는 ${turn * 2}개의 메시지여야 합니다` };
  }
  const clean = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    const role = i % 2 === 0 ? 'assistant' : 'user';
    if (!m || m.role !== role || typeof m.content !== 'string') return { error: `history[${i}]는 ${role} 메시지여야 합니다` };
    const content = m.content.trim();
    const max = role === 'user' ? MAX_ANSWER : MAX_REPLY + MAX_QUESTION + 10;
    if (!content) return { error: `history[${i}]가 비어 있습니다` };
    if (content.length > max) return { error: `history[${i}]가 ${max}자를 넘습니다` };
    if (role === 'user' && (PII.email.test(content) || PII.phone.test(content))) return { error: `history[${i}]에 이메일·전화번호가 들어 있습니다` };
    clean.push({ role, content });
  }
  // 첫 질문은 항상 미리 써 둔 것 — 다른 문장이 끼어들면(프롬프트 조작) 거절
  const firstQ = event.dialogue && event.dialogue[0] ? String(event.dialogue[0].q).trim() : '';
  if (!firstQ || clean[0].content !== firstQ) return { error: 'history[0]은 이 사건의 미리 써 둔 첫 질문이어야 합니다' };
  return { eventId: body.eventId, turn, history: clean };
}

/** Anthropic messages는 user로 시작해야 하므로 시작 알림을 앞에 둡니다 (학생 글은 그대로). */
export function buildMessages(history) {
  return [{ role: 'user', content: '(학생이 ‘질문하는 AI’를 시작했습니다. 첫 질문을 해 주세요.)' }].concat(history);
}

function sourceLine(s) {
  return `- [source:${s.id}] ${s.title} — ${s.creator || '작성 주체 미상'}, ${s.year || '연도 미상'}. ${s.description || ''}${s.perspective ? ` (관점·한계: ${s.perspective})` : ''}`;
}

/** 사건 자료 전문 + 규칙. 자료 밖 지식을 쓰지 않도록 자료를 모두 넣습니다. */
export function buildSystemPrompt(event, turn) {
  const narratives = NARRATIVE_IDS.map(k => `[narrative:${k}] ${NARRATIVE_LABEL[k]} — ${event.narratives[k].title}\n${event.narratives[k].text}`).join('\n\n');
  const ai = (event.ai || []).map(r => {
    const head = r.originalHead ? `\n(원문 앞부분: ${r.originalHead})` : '';
    return `[ai:${r.id}] AI(${r.model})에게 ${LANG_LABEL[r.lang]}로 물은 ${r.run}회차 답변${r.lang === 'ko' ? '' : ' — 한국어 참고 번역'}\n${r.textKo}${head}`;
  }).join('\n\n');
  const sources = (event.sources || []).map(sourceLine).join('\n');
  const observations = (event.observations || []).map(t => `- ${t}`).join('\n');
  const keyGaps = (event.keyGaps || []).map(g => `- ${g.note}`).filter(t => t.length > 2).join('\n');
  const keyGapsBlock = keyGaps ? `\n\n### 편집자가 고른 핵심 빈자리 (사람이 답변 원문에서 직접 센 사실 — 판정이 아님)\n${keyGaps}` : '';
  const turnRule = turn === 2
    ? '이번은 두 번째(마지막) 답입니다. reply에 짧은 마무리(학생이 스스로 말한 것을 사실형으로 되짚기)만 쓰고 question은 null로 두세요.'
    : '이번은 첫 번째 답입니다. reply에 짧은 반응을 쓰고, question에 자료 속 "주어·동사"나 "무엇이 빠졌나"를 스스로 찾게 하는 질문 1개를 쓰세요.';
  return `당신은 역사 비교 수업 사이트 Shared Memory의 '질문하는 AI'입니다. 중학생이 아래 자료(세 나라 요약 서술, AI 답변 기록, 사료 목록)를 읽은 뒤 당신의 질문에 답합니다. 당신의 일은 가르치거나 판정하는 것이 아니라, 학생이 "누가 주어였나, 무엇이 빠졌나"를 스스로 말하게 돕는 것입니다.

## 규칙 (반드시 지킵니다)
1. 한국어, 중학생 눈높이. reply는 2문장 이내·${MAX_REPLY}자 이내.
2. 근거는 아래 자료만 씁니다. evidence에는 아래 대괄호 안의 id만 넣습니다 (narrative:korea 처럼 kind와 id). 1개 이상 반드시 넣습니다.
3. 자료 밖의 사실·수치·인물을 묻거나 학생이 자료 밖 내용을 말하면 "이 사이트 자료로는 확인할 수 없다"고 말합니다. 추측으로 보충하지 않습니다.
4. 어떤 나라·서술·AI 답변도 "편향됐다", "틀렸다", "옳다"고 판정하지 않습니다. 점수·등급을 매기지 않습니다. 대신 "어디에 있고 어디에 없는지", "어떤 말을 썼는지"를 사실형으로 짚습니다.
5. 나라나 인물의 역할을 연기하지 않습니다 (예: "일본 입장에서 말하면…" 금지).
6. 학생의 문장을 대신 써 주거나 고쳐 주지 않습니다. 학생이 "대신 써 달라"고 하면 거절하고 질문으로 돌려보냅니다.
7. 학생이 이름·학교·연락처 같은 개인정보를 쓰면 그 부분은 언급하지 않고 넘어갑니다.
8. ${turnRule}

## 사건: ${event.title} (${event.era}) — 열린 질문: ${event.question || ''}

### 세 나라 요약 서술 (이 프로젝트 편집자가 쓴 요약 — 교과서 원문이 아님)
${narratives}

### AI 답변 기록 (같은 질문을 세 언어로 물은 기록 — 정답이 아니라 또 하나의 서술)
질문 원문(한국어): ${(event.aiQuestions || {}).ko || ''}
${ai}

### 사료 목록 (사료는 정답이 아니라 누군가 특정 위치에서 남긴 기록)
${sources || '- (이 사건에 연결된 사료가 없습니다)'}

### 편집자 관찰 (사람이 답변을 읽고 쓴 사실형 관찰 — 판정이 아님)
${observations || '- (없음)'}${keyGapsBlock}`;
}

/**
 * 한도 판정. perIp·perDay는 supabase-js count 조회 결과({ count, error }) — 이번 호출을 먼저 기록한 뒤 세므로 "limit보다 많으면" 초과.
 * 조회에 실패하면 열어 두지 않고 503. 반환: 503 | 429 | null(통과)
 */
export function limitStatus(perIp, perDay, limits) {
  if (!perIp || !perDay || perIp.error || perDay.error || typeof perIp.count !== 'number' || typeof perDay.count !== 'number') return 503;
  if (perIp.count > limits.perIp || perDay.count > limits.perDay) return 429;
  return null;
}

/** 근거 id가 이 사건 자료에 있는지 */
export function isValidEvidence(event, e) {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string') return false;
  if (e.kind === 'narrative') return NARRATIVE_IDS.includes(e.id);
  if (e.kind === 'ai') return (event.ai || []).some(r => r.id === e.id);
  if (e.kind === 'source') return (event.sources || []).some(s => s.id === e.id);
  return false;
}

/**
 * 모델 출력(JSON 문자열)을 화면이 쓰는 모양으로 정리합니다.
 * JSON이 아니거나, reply가 비었거나, 유효한 근거가 하나도 없으면 { fallback: true } (근거 없는 답은 보여 주지 않음).
 */
export function normalizeReply(text, event, turn) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return { fallback: true }; }
  if (!parsed || typeof parsed !== 'object') return { fallback: true };
  const reply = String(parsed.reply || '').trim().slice(0, MAX_REPLY);
  const seen = new Set();
  const evidence = (Array.isArray(parsed.evidence) ? parsed.evidence : [])
    .filter(e => isValidEvidence(event, e))
    .map(e => ({ kind: e.kind, id: e.id }))
    .filter(e => { const k = e.kind + ':' + e.id; if (seen.has(k)) return false; seen.add(k); return true; });
  if (!reply || !evidence.length) return { fallback: true };
  const q = typeof parsed.question === 'string' ? parsed.question.trim().slice(0, MAX_QUESTION) : '';
  return { reply, question: turn === 2 || !q ? null : q, evidence };
}
