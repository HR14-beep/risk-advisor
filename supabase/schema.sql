-- 리스크관리제언 저장소 표 만들기 (DESIGN.md §5.2, PLAN 작업 8)
-- Supabase 대시보드 → SQL Editor에 이 파일 내용을 붙여 넣고 Run을 누른다. 여러 번 실행해도 괜찮다.

-- 지표 값: 수집하거나 직접 입력한 값의 기록. 지우지 않고 쌓아 5년 임계점 계산과 직전 대비 비교에 쓴다.
-- 가중합 지표는 구성값 번호(예: macro_financial.kospi)로 따로 쌓는다.
create table if not exists indicator_values (
  id bigint generated always as identity primary key,
  indicator_id text not null,                 -- 지표 번호 또는 구성값 번호
  value double precision,                     -- 수집에 실패한 기록은 비어 있다
  reference double precision,                 -- 기준값(목표값·담보가치 등). 해당 지표만
  value_date date not null,                   -- 기준일
  collection_method text not null check (collection_method in ('auto', 'manual')),
  collected_at timestamptz not null default now(),
  success boolean not null default true,
  -- 같은 지표·기준일 값은 하나만 둔다 (다시 수집하거나 고쳐 입력하면 덮어쓴다)
  unique (indicator_id, value_date),
  check (success = false or value is not null)
);

-- 보고서: 같은 달에 여러 개(1차, 2차…)가 있을 수 있다
create table if not exists reports (
  id bigint generated always as identity primary key,
  report_month text not null check (report_month ~ '^\d{4}-\d{2}$'), -- 예: 2026-10
  round integer not null check (round >= 1),                          -- 차수
  overall_level text check (overall_level in ('crisis', 'warning', 'caution', 'normal')), -- 담당자 선택
  created_at timestamptz not null default now(),
  saved_at timestamptz,
  unique (report_month, round)
);

-- 보고서 섹션: 분류별 내용. AI 초안과 담당자 수정본을 따로 보관한다
create table if not exists report_sections (
  id bigint generated always as identity primary key,
  report_id bigint not null references reports (id) on delete cascade,
  category text not null check (category in ('macro', 'early-warning', 'crisis-response')),
  ai_draft text,
  edited_text text,
  is_edited boolean not null default false,  -- [고침] 표시
  unique (report_id, category)
);

-- 로그인이 없으므로 브라우저용 공개 키로는 아무것도 읽고 쓰지 못하게 막는다.
-- 앱은 서버에서만 서버용 키(SUPABASE_SERVICE_ROLE_KEY)로 접근하며, 이 키는 이 제한을 받지 않는다.
alter table indicator_values enable row level security;
alter table reports enable row level security;
alter table report_sections enable row level security;
