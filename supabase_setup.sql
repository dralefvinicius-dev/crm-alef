-- CRM Jurídico — Dr. Alef Vinicius Silva dos Santos
-- Execute este SQL no Supabase > SQL Editor

create table leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  wa text,
  email text,
  cidade text default 'Parauapebas',
  prof text,
  assunto text not null,
  area text,
  fase text default 'Novo Lead',
  temp text default 'Morno',
  origem text,
  prox_acao date,
  consulta date,
  obs text,
  ultimo_contato date default current_date,
  criado_em timestamptz default now()
);

create table historico (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  lead_nome text,
  tipo text,
  data date default current_date,
  texto text not null,
  resultado text,
  criado_em timestamptz default now()
);

-- Habilitar acesso público (ajuste RLS conforme necessário)
alter table leads enable row level security;
alter table historico enable row level security;

create policy "acesso total leads" on leads for all using (true) with check (true);
create policy "acesso total historico" on historico for all using (true) with check (true);
