-- Rode no Supabase: SQL Editor > New query > cole tudo > Run.
-- Uma linha por usuário, com todo o estado do app em JSON. RLS garante que cada um só vê a própria.
create table if not exists public.finance_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.finance_state enable row level security;

drop policy if exists "dono le" on public.finance_state;
drop policy if exists "dono insere" on public.finance_state;
drop policy if exists "dono atualiza" on public.finance_state;
drop policy if exists "dono apaga" on public.finance_state;

create policy "dono le"      on public.finance_state for select using (auth.uid() = user_id);
create policy "dono insere"  on public.finance_state for insert with check (auth.uid() = user_id);
create policy "dono atualiza" on public.finance_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dono apaga"   on public.finance_state for delete using (auth.uid() = user_id);
