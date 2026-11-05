-- QUOX - Finanças: tabela de cadastros e regras de acesso.
-- Cole este arquivo inteiro em Supabase > SQL Editor > New query > Run.

create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  email text,
  telefone text,
  consentimento_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

-- Cada pessoa enxerga e altera somente o próprio cadastro.
create policy "ler o proprio cadastro" on public.perfis
  for select using (auth.uid() = id);
create policy "criar o proprio cadastro" on public.perfis
  for insert with check (auth.uid() = id);
create policy "atualizar o proprio cadastro" on public.perfis
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Cria o cadastro automaticamente quando a conta é criada (e-mail ou Google).
create or replace function public.novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email, nome, telefone, consentimento_em)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    nullif(new.raw_user_meta_data->>'telefone', ''),
    nullif(new.raw_user_meta_data->>'consentimento_em', '')::timestamptz
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.novo_usuario();

-- Para ver todos os cadastros (como administrador), use: Table Editor > perfis,
-- ou rode: select nome, email, telefone, criado_em from public.perfis order by criado_em desc;
