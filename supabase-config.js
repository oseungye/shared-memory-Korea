// Supabase 공개(publishable) 키 — 브라우저용 공개 키입니다. 데이터 보호는 RLS 정책이 담당합니다.
// service_role 키나 비밀 키는 절대 이 파일(브라우저 코드)에 넣지 마세요.
const SUPABASE_URL =
  "https://qidaaofhfqliwtnqipkp.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_eHYYDHSkRHyE7dGkMyVX7Q_FADlbe5C";

// CDN이 막혀 supabase-js를 불러오지 못해도 페이지의 나머지 기능은 동작하도록 null로 둡니다.
const db = (window.supabase && typeof window.supabase.createClient === 'function')
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
