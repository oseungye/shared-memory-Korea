#!/usr/bin/env node
/* ============================================================
   Shared Memory Project — tools/collect-ai-narratives.mjs
   '네 번째 서술자' AI 답변 수집 스크립트 (Anthropic Claude API)
   ============================================================
   · fourth-narrator-data.js의 질문을 사건 × 언어(ko·ja·zh) × 회차로 묻고, 답변을 ai-narratives-data.js에 기록합니다.
   · 매번 새 대화로 묻습니다. 시스템 프롬프트 없이, 모델 기본 설정 그대로 묻습니다 (학생이 실제로 묻는 상황과 가깝게).
   · 일본어·중국어 답변은 같은 모델로 한국어 참고 번역을 따로 만들어 함께 저장합니다 (화면에 'AI 번역'으로 표시).
   · 이미 기록된 (사건, 언어, 회차)는 건너뜁니다. 한 건 받을 때마다 파일에 바로 저장하므로 중간에 멈춰도 이어서 실행할 수 있습니다.
   · 답변 원문은 고치지 않습니다. 거절(refusal)·길이 초과 답변은 기록하지 않고 알려 줍니다.

   API 키: 환경 변수 ANTHROPIC_API_KEY (Claude Code 클라우드 환경 설정 또는 로컬 셸에서 설정).
          키를 코드·파일·채팅에 붙여 넣지 마세요.

   사용법
     node tools/collect-ai-narratives.mjs --dry-run                       # 무엇을 몇 번 물을지 미리 보기 (API 호출 없음)
     node tools/collect-ai-narratives.mjs --events=imjin,hiroshima        # 임진왜란·히로시마만
     node tools/collect-ai-narratives.mjs                                  # 전체 (6개 사건 × 3개 언어 × 3회)
   옵션
     --events=a,b    사건 id (기본: imjin,hiroshima,zainichi,culture,tribute,modern)
     --langs=ko,ja   질문 언어 (기본: ko,ja,zh)
     --runs=3        언어마다 묻는 횟수 (기본: 3)
     --no-translate  참고 번역을 만들지 않음
     --dry-run       계획만 출력
   ============================================================ */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'ai-narratives-data.js');
const fourth = require(path.join(ROOT, 'fourth-narrator-data.js'));
const NA = require(path.join(ROOT, 'narrator-analysis.js'));

const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16000;
// 안전 분류기가 요청을 거절하면 서버가 권장 대체 모델로 다시 실행합니다. 대체 모델이 답했으면 기록에 표시합니다.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const EVENT_ORDER = ['imjin', 'hiroshima', 'zainichi', 'culture', 'tribute', 'modern'];
const TRANSLATE_PROMPT = '다음 글을 자연스러운 한국어로 번역해 주세요. 내용을 더하거나 빼지 말고, 번역문만 출력하세요.\n\n';

function parseArgs(argv) {
  const opts = { events: EVENT_ORDER.slice(), langs: NA.AI_LANGS.slice(), runs: 3, translate: true, dryRun: false };
  argv.forEach(arg => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (k === 'events') opts.events = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'langs') opts.langs = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'runs') opts.runs = Number(v);
    else if (k === 'no-translate') opts.translate = false;
    else if (k === 'dry-run') opts.dryRun = true;
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  });
  opts.events.forEach(e => { if (!fourth.questions[e]) throw new Error(`질문이 없는 사건: ${e}`); });
  opts.langs.forEach(l => { if (NA.AI_LANGS.indexOf(l) < 0) throw new Error(`지원하지 않는 언어: ${l}`); });
  if (!(Number.isInteger(opts.runs) && opts.runs >= 1 && opts.runs <= 10)) throw new Error('--runs는 1~10');
  return opts;
}

function loadExisting() {
  delete require.cache[require.resolve(DATA_FILE)];
  const data = require(DATA_FILE);
  return { questionsVersion: data.questionsVersion, records: Array.isArray(data.records) ? data.records.slice() : [] };
}

/** 파일 머리말(설명 주석)은 그대로 두고 데이터 부분만 다시 씁니다. */
function writeData(questionsVersion, records) {
  const src = fs.readFileSync(DATA_FILE, 'utf8');
  const at = src.indexOf('const aiNarrativesData');
  if (at < 0) throw new Error('ai-narratives-data.js 형식을 알 수 없습니다');
  const order = r => [EVENT_ORDER.indexOf(r.eventId), NA.AI_LANGS.indexOf(r.lang), r.run];
  const sorted = records.slice().sort((a, b) => {
    const x = order(a), y = order(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  const body = `const aiNarrativesData = ${JSON.stringify({ questionsVersion, records: sorted }, null, 2)};

// Node 테스트 환경에서 불러올 수 있도록 내보냅니다 (브라우저에서는 무시됨)
if (typeof module === 'object' && module.exports) module.exports = aiNarrativesData;
`;
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, src.slice(0, at) + body);
  fs.renameSync(tmp, DATA_FILE);
}

function plan(opts, existing) {
  const has = new Set(existing.map(r => `${r.eventId}|${r.lang}|${r.run}`));
  const todo = [];
  opts.events.forEach(eventId => opts.langs.forEach(lang => {
    for (let run = 1; run <= opts.runs; run++) {
      if (!has.has(`${eventId}|${lang}|${run}`)) todo.push({ eventId, lang, run });
    }
  }));
  return todo;
}

function textOf(res) {
  return (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

async function ask(client, prompt) {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }]
  });
  const servedByFallback = (res.usage && Array.isArray(res.usage.iterations) ? res.usage.iterations : [])
    .some(e => e.type === 'fallback_message');
  return { res, text: textOf(res), servedByFallback };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const existing = loadExisting();
  if (existing.records.length && existing.questionsVersion && existing.questionsVersion !== fourth.questionsVersion) {
    console.error(`기록의 질문 버전(${existing.questionsVersion})과 지금 질문 버전(${fourth.questionsVersion})이 다릅니다.`);
    console.error('질문이 바뀐 답변을 섞지 않도록 멈춥니다. 기존 기록을 따로 보관한 뒤 records를 비우고 다시 실행하세요.');
    process.exit(1);
  }
  const todo = plan(opts, existing.records);
  const calls = todo.length + (opts.translate ? todo.filter(t => t.lang !== 'ko').length : 0);
  console.log(`모델 ${MODEL} · 질문 버전 ${fourth.questionsVersion}`);
  console.log(`이미 기록됨 ${existing.records.length}건 · 새로 물을 답변 ${todo.length}건 · API 호출 약 ${calls}회`);
  todo.forEach(t => console.log(`  - ${t.eventId} / ${t.lang} / ${t.run}회차`));
  if (opts.dryRun || !todo.length) return;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error('\nANTHROPIC_API_KEY가 없습니다. 클라우드 환경 설정(환경 메뉴 → Edit)이나 셸 환경 변수로 키를 등록한 뒤 새 세션에서 실행하세요.');
    console.error('키를 코드·파일·채팅에 붙여 넣지 마세요.');
    process.exit(1);
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const records = existing.records;
  let saved = 0;

  for (const t of todo) {
    const prompt = fourth.questions[t.eventId][t.lang];
    const label = `${t.eventId}/${t.lang}/${t.run}`;
    try {
      const q = await ask(client, prompt);
      if (q.res.stop_reason === 'refusal') {
        const cat = q.res.stop_details && q.res.stop_details.category;
        console.warn(`  ! ${label}: 거절됨${cat ? ` (${cat})` : ''} — 기록하지 않음`);
        continue;
      }
      if (q.res.stop_reason === 'max_tokens' || !q.text) {
        console.warn(`  ! ${label}: 답변이 끊기거나 비어 있음 (${q.res.stop_reason}) — 기록하지 않음`);
        continue;
      }
      let translationKo = null;
      let translationModel = null;
      if (opts.translate && t.lang !== 'ko') {
        const tr = await ask(client, TRANSLATE_PROMPT + q.text);
        if (tr.res.stop_reason === 'end_turn' && tr.text) {
          translationKo = tr.text;
          translationModel = tr.res.model;
        } else {
          console.warn(`  ! ${label}: 참고 번역을 만들지 못함 (${tr.res.stop_reason}) — 원문만 기록`);
        }
      }
      const rec = {
        eventId: t.eventId,
        lang: t.lang,
        run: t.run,
        prompt,
        answer: q.text,
        translationKo,
        model: q.res.model,
        requestedModel: MODEL,
        servedByFallback: q.servedByFallback,
        translationModel,
        collectedAt: new Date().toISOString(),
        params: {
          maxTokens: MAX_TOKENS, system: null, thinking: '기본값', effort: '기본값', newConversation: true,
          // 2026-10-22 첫 수집(54건) 뒤 추가한 기록 — 그 54건도 같은 설정으로 수집했습니다 (README 3-6절)
          fallbacks: 'default', fallbackBeta: FALLBACK_BETA,
          translationPrompt: translationKo ? TRANSLATE_PROMPT.trim() : null
        }
      };
      const problems = NA.validateRecord(rec, fourth.questions);
      if (problems.length) {
        console.warn(`  ! ${label}: 형식 문제 (${problems.join(', ')}) — 기록하지 않음`);
        continue;
      }
      records.push(rec);
      writeData(fourth.questionsVersion, records);
      saved++;
      console.log(`  ✓ ${label} 저장${q.servedByFallback ? ` (대체 모델 ${q.res.model}이 답함)` : ''}`);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        console.error(`\n키 인증 실패: 키가 올바른지 확인하세요. (${saved}건 저장 후 멈춤)`);
      } else if (e instanceof Anthropic.RateLimitError) {
        console.error(`\n사용 한도에 걸렸습니다. 잠시 뒤 같은 명령으로 이어서 실행하세요. (${saved}건 저장 후 멈춤)`);
      } else if (e instanceof Anthropic.APIError) {
        console.error(`\nAPI 오류 ${e.status}: ${e.message} (${saved}건 저장 후 멈춤)`);
      } else {
        console.error(`\n오류: ${e && e.message ? e.message : e} (${saved}건 저장 후 멈춤)`);
      }
      process.exit(1);
    }
  }
  console.log(`\n완료: ${saved}건 새로 저장 · 전체 ${records.length}건 → ai-narratives-data.js`);
  console.log('다음: npm test로 기록 형식을 확인하고, 답변을 읽어 fourth-narrator-data.js의 observations·keyGaps를 채우세요.');
}

main().catch(e => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
