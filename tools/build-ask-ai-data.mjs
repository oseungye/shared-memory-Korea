#!/usr/bin/env node
/* ============================================================
   Shared Memory Project — tools/build-ask-ai-data.mjs
   '③ 질문하는 AI' Edge Function(supabase/functions/ask-ai)이 근거로 쓰는 data.json을 사이트 데이터에서 만듭니다.
   ============================================================
   · 원천: events-data.js(세 나라 요약 서술) · ai-narratives-data.js(AI 답변 기록) · sources-data.js(사료 메타)
           · fourth-narrator-data.js(observations · keyGaps · dialogue)
   · 함수는 이 파일에 있는 자료만 근거로 쓰고, 근거 칩 id도 이 파일에 있는 것만 통과시킵니다.
   · 실행: node tools/build-ask-ai-data.mjs   (API 호출 없음 · 비밀 키 없음)
   · 원천 데이터를 바꾸면 다시 실행해 커밋하세요. tests/ask-ai.test.js가 결과가 같은지 검사합니다.
   ============================================================ */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'supabase', 'functions', 'ask-ai', 'data.json');

const LANGS = ['ko', 'ja', 'zh'];
const ORIGINAL_HEAD = 200;          // 일본어·중국어 답변은 한국어 참고 번역을 쓰고, 원문은 앞부분만 둡니다(이름·동사 확인용)

export function build() {
  const events = require(path.join(ROOT, 'events-data.js'));
  const ai = require(path.join(ROOT, 'ai-narratives-data.js'));
  const sources = require(path.join(ROOT, 'sources-data.js'));
  const fourth = require(path.join(ROOT, 'fourth-narrator-data.js'));

  const out = { questionsVersion: fourth.questionsVersion, events: {} };
  events.forEach(e => {
    const records = ai.records
      .filter(r => r.eventId === e.id && LANGS.includes(r.lang))
      .sort((a, b) => LANGS.indexOf(a.lang) - LANGS.indexOf(b.lang) || a.run - b.run);
    out.events[e.id] = {
      title: e.title,
      titleJP: e.titleJP,
      titleCN: e.titleCN,
      era: e.era,
      question: e.question,
      narratives: {
        korea: { title: e.korea.title, text: e.korea.text },
        japan: { title: e.japan.title, text: e.japan.text },
        china: { title: e.china.title, text: e.china.text }
      },
      aiQuestions: fourth.questions[e.id] || {},
      ai: records.map(r => ({
        id: `${r.lang}-${r.run}`,
        lang: r.lang,
        run: r.run,
        model: r.model,
        textKo: r.lang === 'ko' ? r.answer : (r.translationKo || ''),
        originalHead: r.lang === 'ko' ? null : String(r.answer || '').slice(0, ORIGINAL_HEAD)
      })),
      sources: sources.filter(s => s.eventId === e.id).map(s => ({
        id: s.id, title: s.title, creator: s.creator, year: s.year, perspective: s.perspective, description: s.description
      })),
      observations: (fourth.observations || {})[e.id] || [],
      keyGaps: (fourth.keyGaps || {})[e.id] || [],
      dialogue: (fourth.dialogue || {})[e.id] || []
    };
  });
  return out;
}

export function serialize(data) { return JSON.stringify(data, null, 2) + '\n'; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = serialize(build());
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`${path.relative(ROOT, OUT)} 생성 (${Buffer.byteLength(text)} bytes)`);
}
