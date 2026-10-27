# ③ 질문하는 AI — 배포·운영 런북 (운영자용)

사이트의 심화 탐구 → 네 번째 서술자 탭 맨 아래 **‘③ 질문하는 AI’**는 학생이 ‘시작’을 누른 뒤 쓴 답을 Supabase Edge Function `ask-ai`를 거쳐 Anthropic API(`claude-opus-5-5`)로 보내고, 짧은 반응·근거 칩·다음 질문을 받습니다(최대 2회). **API 키는 Supabase secret에만** 두고, 브라우저·저장소에는 없습니다. 함수가 없거나 꺼져 있거나 실패하면 사이트는 **미리 써 둔 질문으로 끝까지 진행**하므로, 배포 전·후·장애 중 어느 때도 흐름이 끊기지 않습니다.

이 문서의 명령은 모두 **Claude Code의 Supabase MCP**(`.claude/settings.json`에서 `ask` 권한 — 실행 전에 확인을 받음)로 실행합니다. 대시보드에서 직접 해도 됩니다.

## 0. 들어 있는 파일

| 파일 | 역할 |
|---|---|
| `supabase/functions/ask-ai/index.ts` | Deno 핸들러 — Origin 검사, 한도 기록·검사(서비스 롤), 모델 호출, 응답 정리 |
| `supabase/functions/ask-ai/core.mjs` | 순수 부분(입력 검증·system prompt·JSON 스키마·근거 id 대조). `npm test`가 검사 |
| `supabase/functions/ask-ai/data.json` | 함수가 근거로 쓰는 사이트 자료(세 나라 서술·AI 답변 9건·사료·관찰·사전 질문). `node tools/build-ask-ai-data.mjs`로 생성 |
| `supabase/2026-10-ask-ai-limit.sql` | 한도 기록 테이블 `ask_ai_calls`(IP 해시·시각만) + anon 권한 회수 + 7일 정리 함수 |
| `ask-ai.js` · `fourth-narrator-data.js`의 `dialogue` | 화면·상태기 · 미리 써 둔 질문(사건마다 3개, **2026-10-26 초안 — 확정 필요**) |

## 1. 배포 순서 (처음 한 번)

1. **SQL 적용** — MCP `apply_migration`(name: `ask_ai_limit`)에 `supabase/2026-10-ask-ai-limit.sql` 내용을 넣어 실행. 여러 번 실행해도 안전합니다.
   확인: `list_tables`에 `ask_ai_calls`가 보이고, `get_advisors`(security)에 이 테이블 경고가 없음.
2. **secret 등록** — MCP `create_edge_function_secret`로
   - `ANTHROPIC_API_KEY` = (Anthropic 콘솔에서 만든 키. 채팅·파일·커밋에 붙이지 말고 MCP 입력에만)
   - `ASK_AI_ENABLED` = `true` (끌 때 `false`)
   - `ASK_AI_IP_SALT` = 아무 긴 임의 문자열 (선택이지만 권장 — 한도 기록의 IP 해시에 섞어 원래 IP를 되짚기 어렵게 함)
   `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 함수에 자동으로 넣어 주므로 등록하지 않습니다.
3. **함수 배포** — 배포 전 로컬 확인: `deno check --node-modules-dir=none supabase/functions/ask-ai/index.ts` (생긴 `deno.lock`은 지워도 됨 — MCP 배포가 읽지 않음). 그다음 MCP `deploy_edge_function`(name: `ask-ai`, entrypoint `index.ts`)에 `index.ts`·`core.mjs`·`data.json` 세 파일을 함께 올립니다.
   - 사이트는 **publishable 키**(`sb_publishable_…`)로 부르므로 함수의 **Verify JWT는 꺼야** 합니다(대시보드 → Edge Functions → ask-ai → Details → “Verify JWT with legacy secret” 끔). 켜져 있으면 브라우저가 401을 받고 사이트는 폴백으로만 동작합니다. 출처 검사·한도는 함수 안에서 합니다.
4. **curl 확인** (키 없이 — Origin 헤더가 없으면 403이 정상입니다)
   ```bash
   URL=https://qidaaofhfqliwtnqipkp.supabase.co/functions/v1/ask-ai
   KEY=sb_publishable_eHYYDHSkRHyE7dGkMyVX7Q_FADlbe5C      # supabase-config.js의 공개 키
   # 허용 Origin + 정상 입력 → 200 {"reply":...,"question":...,"evidence":[...]} 또는 {"fallback":true}
   curl -s "$URL" -H "apikey: $KEY" -H "Origin: https://oseungye.github.io" -H "content-type: application/json" \
     -d '{"eventId":"imjin","turn":1,"history":[{"role":"assistant","content":"AI의 일본어 답변에서 전쟁을 시작한 문장의 주어와 동사는 무엇이었나요?"},{"role":"user","content":"일본어 답변은 군대를 보냈다고 썼어요."}]}'
   # 틀린 입력 → 400 {"error":"..."}   / Origin 없음 → 403   / ASK_AI_ENABLED=false → 503
   curl -s -o /dev/null -w '%{http_code}\n' "$URL" -H "apikey: $KEY" -H "Origin: https://oseungye.github.io" -d '{"eventId":"x"}'
   ```
5. **사이트에서 확인** — 배포 URL → 임진왜란 → 심화 탐구 → STEP 2 ‘AI는 어떻게 말할까?’ 탭 맨 아래. 시작 → 답 → 칩 클릭(서술 카드·AI 카드·사료 카드로 이동) → 답 → 마무리. 시크릿 창과 휴대폰에서도 한 번.

## 2. 끄는 법 · 다시 켜는 법

- **잠시 끄기**: secret `ASK_AI_ENABLED` = `false` → 함수가 503 → 사이트는 “AI가 응답하지 않아 준비한 질문으로 이어갑니다”와 사전 질문으로 진행. 다시 켤 때 `true`. (secret 변경은 함수 재배포 없이 바로 적용되지만 몇 초~1분 걸릴 수 있음)
- **완전히 끄기**: 대시보드에서 함수 `ask-ai` 삭제(또는 Anthropic 콘솔에서 키 폐기). 사이트는 그대로 폴백으로 동작하므로 사이트 재배포는 필요 없습니다.
- 사이트에서 블록 자체를 없애려면 `index.html`의 `<div id="askAi">`를 지우면 됩니다(`ask-ai.js`는 컨테이너가 없으면 아무 일도 하지 않음).

## 3. 한도·비용

| 항목 | 값 | 어디서 바꾸나 |
|---|---|---|
| IP당 | 시간당 300회 (한 공인 IP를 공유하는 교실 기준 150명분) | `index.ts` `PER_IP_PER_HOUR` |
| 전체 | 하루 1,000회 | `index.ts` `PER_DAY` |
| 한 대화 | 최대 2회 호출, 답 600자, 반응 300자 | `core.mjs` |
| `max_tokens` | 1500 | `index.ts` |
| 함수 제한 시간 | 모델 12초 (브라우저가 15초에 끊으므로 그보다 짧게) | `index.ts` `MODEL_TIMEOUT_MS` · `supabase-config.js` 15초 |

- 호출당 입력은 사건 자료 전문(세 나라 서술 + AI 답변 9건 + 사료)이라 약 10k 토큰, 출력은 수백 토큰. 하루 1,000회 상한이면 그 이상은 들지 않습니다. 실제 단가는 Anthropic 콘솔(Usage)에서 확인하세요.
- 한도를 넘으면 429 → 사이트는 폴백. 한도 기록은 시각과 IP 해시만이며(원문은 저장하지 않음 — `ASK_AI_IP_SALT` 설정 권장) 7일 뒤 정리됩니다(함수가 가끔 `ask_ai_calls_cleanup()`을 부름). 이 사이트는 학생 답·모델 응답을 어디에도 저장·로그하지 않습니다(함수에 `console.log` 없음 — 테스트가 검사). 다만 학생 답은 Anthropic API로 전송되어 그 쪽 정책에 따라 처리됩니다 — 화면 안내 문구: “이 사이트는 답을 저장하지 않습니다. 답은 AI 서비스(Anthropic)로 전송되어 그 쪽 정책에 따라 처리됩니다. 이름·개인정보는 쓰지 마세요.”
- **운영자 확인 항목**: 중학생 대상이므로 Anthropic 이용 정책(미성년자 관련 조항)과 개인정보보호법(14세 미만 아동 정보 처리) 적용 여부를 확인한 뒤 켜세요.

## 4. 장애 대응

| 증상 | 확인 | 대응 |
|---|---|---|
| 항상 “준비한 질문으로 이어갑니다” | 브라우저 개발자 도구 → Network → `functions/v1/ask-ai` 상태 코드 | 401: Verify JWT 끔 · 403: Origin(배포 주소가 `https://oseungye.github.io`인지) · 429: 한도 · 503: `ASK_AI_ENABLED` 또는 SQL 미적용(`ask_ai_calls` 없음) · 502: Anthropic 응답 없음·키 오류(Edge Function Logs 확인) |
| `{"fallback":true}`만 옴 | 모델 거절 또는 근거 없는 답 | 정상 동작(근거 없는 답은 보여 주지 않음). 반복되면 `core.mjs` system prompt 점검 |
| 비용이 예상보다 큼 | Anthropic 콘솔 Usage · `select count(*) from ask_ai_calls where called_at > now() - interval '1 day'`(SQL Editor, 운영자만) | `PER_DAY`를 낮춰 재배포 또는 `ASK_AI_ENABLED=false` |

## 5. 사전 질문·문구 바꾸기

- 사전 질문: `fourth-narrator-data.js`의 `dialogue`(사건마다 3개 — [0] 첫 질문, [1] 폴백 두 번째 질문, [2] 폴백 마무리 글(질문이 아닌 서술문)). 함수는 history[0]이 [0]과 같은지 검사하므로, [0]을 바꾸면 사이트와 함수를 함께 배포해야 합니다. 근거 id는 사이트 자료에 있어야 하며 `npm test`가 검사합니다.
- 바꾼 뒤 `node tools/build-ask-ai-data.mjs`로 `data.json`을 다시 만들고(테스트가 동기화를 검사) 함수를 **재배포**해야 함수도 새 자료를 씁니다. 사이트 쪽 문구는 GitHub Pages 배포로 반영됩니다.
- 수집 기록(`ai-narratives-data.js`)·서술(`events-data.js`)·사료(`sources-data.js`)를 바꿨을 때도 같은 두 단계(빌드 → 재배포)가 필요합니다.
