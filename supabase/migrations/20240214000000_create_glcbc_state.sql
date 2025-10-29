create table if not exists public.glcbc_state (
  slug text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.glcbc_state enable row level security;

create policy "Solo miembros autenticados pueden ver" on public.glcbc_state
  for select using (auth.role() = 'authenticated');

create policy "Solo miembros autenticados pueden escribir" on public.glcbc_state
  for insert with check (auth.role() = 'authenticated');

create policy "Solo miembros autenticados pueden actualizar" on public.glcbc_state
  for update using (auth.role() = 'authenticated');
