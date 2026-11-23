-- PC·폰 공통 설정 클라우드 동기화 (localStorage 미러)
create table if not exists public.app_cloud_prefs (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create index if not exists app_cloud_prefs_updated_idx
  on public.app_cloud_prefs (updated_at desc);

alter table public.app_cloud_prefs enable row level security;

create policy "Allow public read app_cloud_prefs"
  on public.app_cloud_prefs for select using (true);
