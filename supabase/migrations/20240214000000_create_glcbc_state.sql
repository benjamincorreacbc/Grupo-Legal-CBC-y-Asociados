-- Tabla de estado JSON versionado por organización (slug)
create table if not exists public.glcbc_state (
  slug text not null,
  version int not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (slug)
);

alter table public.glcbc_state enable row level security;

-- Política RLS: usuarios autenticados pueden leer y escribir (se filtra por slug del lado servidor)
create policy "glcbc_state_select"
  on public.glcbc_state
  for select
  to authenticated
  using (true);

create policy "glcbc_state_write"
  on public.glcbc_state
  for insert
  to authenticated
  with check (true);

create policy "glcbc_state_update"
  on public.glcbc_state
  for update
  to authenticated
  using (true)
  with check (true);
