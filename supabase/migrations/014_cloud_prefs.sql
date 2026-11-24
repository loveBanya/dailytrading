-- PC·폰 공통 설정 클라우드 동기화 (localStorage 미러)
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- 이미 실행했어도 스키마 캐시에 없으면 아래 NOTIFY 까지 다시 돌리면 됩니다.

create table if not exists public.app_cloud_prefs (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create index if not exists app_cloud_prefs_updated_idx
  on public.app_cloud_prefs (updated_at desc);

alter table public.app_cloud_prefs enable row level security;

drop policy if exists "Allow public read app_cloud_prefs" on public.app_cloud_prefs;
drop policy if exists "Allow public write app_cloud_prefs" on public.app_cloud_prefs;
drop policy if exists "Allow public update app_cloud_prefs" on public.app_cloud_prefs;
drop policy if exists "Allow public delete app_cloud_prefs" on public.app_cloud_prefs;

create policy "Allow public read app_cloud_prefs"
  on public.app_cloud_prefs for select using (true);

create policy "Allow public write app_cloud_prefs"
  on public.app_cloud_prefs for insert with check (true);

create policy "Allow public update app_cloud_prefs"
  on public.app_cloud_prefs for update using (true) with check (true);

create policy "Allow public delete app_cloud_prefs"
  on public.app_cloud_prefs for delete using (true);

-- PostgREST 스키마 캐시 즉시 갱신 (이 줄이 없으면 API가 테이블을 못 찾을 수 있음)
notify pgrst, 'reload schema';
