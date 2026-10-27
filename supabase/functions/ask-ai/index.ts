/* ============================================================
   Shared Memory Project — Supabase Edge Function `ask-ai`
   '③ 질문하는 AI' — 브라우저 대신 Anthropic API를 부릅니다. 키(ANTHROPIC_API_KEY)는 Supabase secret에만 있습니다.
   ============================================================
   · 입력:  POST { eventId, turn: 1|2, history: [{role, content}] }  (검증은 core.mjs)
   · 출력:  200 { reply, question, evidence }  |  200 { fallback: true }(모델 거절·근거 없음)
            400 { error }(입력 오류) · 403(허용되지 않은 Origin) · 429(한도 초과) · 503(끔·한도 확인 실패) · 502(모델 응답 없음)
            → 클라이언트(ask-ai.js)는 200 reply 외에는 모두 미리 써 둔 질문으로 넘어갑니다.
   · 한도:  IP당 시간당 300회 · 전체 하루 1,000회. ask_ai_calls(ip_hash, called_at)에 서비스 롤로 기록 (SQL: supabase/2026-10-ask-ai-limit.sql).
            IP 원문은 저장하지 않습니다(ASK_AI_IP_SALT로 솔트한 SHA-256 — 솔트 설정 권장. 솔트가 없으면 해시만으로는 보호가 약합니다).
   · 저장·로그 없음: 학생 답과 모델 응답은 어디에도 남기지 않습니다 (console.log 금지).
   · 끄기:  secret ASK_AI_ENABLED=false → 503 → 사이트는 폴백으로 끝까지 진행.
   · 배포:  docs/ask-ai-runbook.md
   ============================================================ */
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import data from './data.json' with { type: 'json' };
import { SCHEMA, buildMessages, buildSystemPrompt, isAllowedOrigin, limitStatus, normalizeReply, validateInput } from './core.mjs';

const MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const PER_IP_PER_HOUR = 300;   // 교실·행사장은 한 공인 IP를 수십 명이 공유 (한 대화 = 2회)
const PER_DAY = 1000;
const MODEL_TIMEOUT_MS = 12_000;   // 브라우저는 15초(supabase-config.js)에 끊으므로 그보다 짧게 — 늦은 응답은 과금만 되고 버려짐

function corsHeaders(origin: string) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'vary': 'origin',
  };
}

function json(status: number, body: unknown, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (!isAllowedOrigin(origin)) return json(403, { error: '허용되지 않은 출처입니다' }, '');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { error: 'POST만 받습니다' }, origin);
  if (/^(false|0|off|no)$/i.test((Deno.env.get('ASK_AI_ENABLED') || '').trim())) return json(503, { error: '질문하는 AI를 잠시 멈췄습니다' }, origin);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json(503, { error: 'AI 키가 설정되지 않았습니다' }, origin);

  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: '요청 본문이 JSON이 아닙니다' }, origin); }
  const input = validateInput(body, data);
  if (input.error) return json(400, { error: input.error }, origin);
  const event = data.events[input.eventId as keyof typeof data.events];

  // 한도 기록·검사 (서비스 롤 — anon은 이 테이블을 읽거나 쓸 수 없음). 먼저 기록하고 나서 세므로 동시 요청도 한도를 넘지 못합니다.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // x-forwarded-for의 마지막 값(프록시가 붙인 것 — 앞쪽 값은 클라이언트가 위조 가능)
  const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ipHash = await sha256((Deno.env.get('ASK_AI_IP_SALT') || '') + (xff[xff.length - 1] || 'unknown'));
  const logged = await sb.from('ask_ai_calls').insert({ ip_hash: ipHash });
  if (logged.error) return json(503, { error: '호출을 기록할 수 없습니다' }, origin);
  const now = Date.now();
  const [perIp, perDay] = await Promise.all([
    sb.from('ask_ai_calls').select('*', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('called_at', new Date(now - 3_600_000).toISOString()),
    sb.from('ask_ai_calls').select('*', { count: 'exact', head: true }).gte('called_at', new Date(now - 86_400_000).toISOString()),
  ]);
  const limit = limitStatus(perIp, perDay, { perIp: PER_IP_PER_HOUR, perDay: PER_DAY });
  if (limit) return json(limit, { error: limit === 429 ? '호출 한도를 넘었습니다' : '호출 한도를 확인할 수 없습니다' }, origin);
  if (Math.random() < 0.02) await sb.rpc('ask_ai_calls_cleanup');   // 7일 지난 기록 정리 (가끔 한 번)

  // 모델 호출 — thinking·temperature·top_p는 보내지 않습니다 (Opus 5.5는 400). 응답은 저장·로그하지 않습니다.
  const client = new Anthropic({ timeout: MODEL_TIMEOUT_MS, maxRetries: 0 });
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1500,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // system prompt는 사건·turn마다 같으므로 프롬프트 캐시에 올립니다(약 10k 토큰)
      system: [{ type: 'text', text: buildSystemPrompt(event, input.turn), cache_control: { type: 'ephemeral' } }],
      messages: buildMessages(input.history) as Anthropic.Beta.BetaMessageParam[],
    });
  } catch {
    return json(502, { error: 'AI 서비스가 응답하지 않았습니다' }, origin);
  }
  if (res.stop_reason === 'refusal') return json(200, { fallback: true }, origin);
  const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
  return json(200, normalizeReply(text, event, input.turn), origin);
});
