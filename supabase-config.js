// Supabase 공개(publishable) 키 — 브라우저용 공개 키입니다. 데이터 보호는 RLS 정책이 담당합니다.
// service_role 키나 비밀 키는 절대 이 파일(브라우저 코드)에 넣지 마세요.
const SUPABASE_URL =
  "https://qidaaofhfqliwtnqipkp.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_eHYYDHSkRHyE7dGkMyVX7Q_FADlbe5C";

// supabase-js는 vendor/supabase-js/supabase.js(저장소 내 보관, 버전 고정)에서 불러옵니다.
// 그래도 불러오지 못한 경우에는 페이지의 나머지 기능이 동작하도록 null로 둡니다.
// 행사장·교실 와이파이에서 응답이 오지 않으면 '등록 중...'·'불러오는 중'에 멈추지 않도록
// 모든 요청에 제한 시간을 둡니다. 시간이 지나면 요청을 멈추고 shared-store.js가 안내 문구를 보여줍니다.
const SUPABASE_TIMEOUT_MS = 15000;

function fetchWithTimeout(input, init) {
  const options = init || {};
  const controller = new AbortController();
  const outer = options.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }
  // 응답 본문을 읽는 동안에도 멈출 수 있도록 타이머는 지우지 않습니다(이미 끝난 요청에는 영향 없음).
  setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  return fetch(input, Object.assign({}, options, { signal: controller.signal })).catch(e => {
    if (controller.signal.aborted && !(outer && outer.aborted)) {
      const timeout = new Error('request timeout');
      timeout.name = 'TimeoutError';
      throw timeout;
    }
    throw e;
  });
}

const db = (window.supabase && typeof window.supabase.createClient === 'function')
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { global: { fetch: fetchWithTimeout } })
  : null;
