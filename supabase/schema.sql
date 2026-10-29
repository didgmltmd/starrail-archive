-- StarRail Archive: 친구 공유용 테이블
--
-- 실행 전에 꼭 켜 주세요:
--   Supabase 대시보드 > Authentication > Sign In / Providers > "Allow anonymous sign-ins" 켜기
--   (앱이 설치될 때마다 익명 계정을 하나 만들어서, 자기 데이터만 수정할 수 있게 합니다)
--
-- 공유되는 것은 게임 데이터(캐릭터, 광추, 성유물)뿐이고 HoYoLAB 로그인 정보는 저장하지 않습니다.

create table if not exists public.profiles (
  uid         text primary key,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname    text,
  level       int,
  avatar_id   text,
  signature   text,
  characters  jsonb not null,
  challenges  jsonb,
  updated_at  timestamptz not null default now()
);

-- 이미 테이블을 만든 경우를 위한 컬럼 추가 (엔드 컨텐츠 기록)
alter table public.profiles add column if not exists challenges jsonb;

alter table public.profiles enable row level security;

-- 누구나 읽기 가능 (친구 UID를 알면 볼 수 있음)
drop policy if exists "profiles readable by everyone" on public.profiles;
create policy "profiles readable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- 쓰기는 처음 공개한 설치본(owner)만 가능
drop policy if exists "owner can insert" on public.profiles;
create policy "owner can insert"
  on public.profiles for insert
  to authenticated
  with check (owner = auth.uid());

drop policy if exists "owner can update" on public.profiles;
create policy "owner can update"
  on public.profiles for update
  to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists "owner can delete" on public.profiles;
create policy "owner can delete"
  on public.profiles for delete
  to authenticated
  using (owner = auth.uid());
-- (update 정책의 with check 때문에 owner를 다른 사람으로 바꿀 수 없음)
