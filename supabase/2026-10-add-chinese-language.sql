-- ============================================================
-- Shared Memory Project — 공동 표현 작성 언어에 중국어(zh) 추가
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- · 선택 사항입니다. shared_expressions.country_code 에는 원래 CHECK 제약이 없어,
--   이 SQL을 실행하기 전에도 'zh' 값이 그대로 저장됩니다.
--   이 SQL은 컬럼의 실제 의미(작성 언어)를 기록하고, 앞으로 들어올 값의 범위를 정리합니다.
-- · 추가(additive)만 합니다. 컬럼 이름을 바꾸거나 기존 행을 수정·삭제하지 않습니다.
--   (기존 'ko' / 'ja' / 'en' / 'unknown' / 기본값 'ETC' 행은 그대로 둡니다)
-- · 여러 번 실행해도 안전합니다 (duplicate_object 무시).
-- ============================================================

-- 1) 컬럼 설명: 이름은 country_code 이지만 '국가'가 아니라 '작성 언어'를 저장합니다 ----
comment on column public.shared_expressions.country_code is
  '공동 표현의 작성 언어: ko(한국어) | zh(중국어) | ja(일본어) | en(영어) | unknown(판별 불가·기존 데이터). '
  '이름과 달리 국가가 아니라 언어 코드입니다. 기본값 ETC는 언어 정보가 없던 기존 행 호환용입니다.';

-- 2) 입력값 제한 (NOT VALID: 기존 행은 검사하지 않고 새 행만 검사) --------------------
--    사이트는 ko / zh / ja / en / unknown 만 저장합니다. 기본값 ETC 와 null 도 허용해 둡니다.
do $$ begin
  alter table public.shared_expressions add constraint shared_expressions_lang_chk
    check (country_code is null or country_code in ('ko', 'zh', 'ja', 'en', 'unknown', 'ETC')) not valid;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
