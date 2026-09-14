-- Exclusão definitiva: incremental, sem apagar dados ou recriar tabelas.
begin;

do $$
declare
  personal_tables constant text[] := array['profiles','categories','transactions','recurrences','budgets'];
  table_name text;
  table_oid oid;
  owner_att smallint;
  auth_att smallint;
  existing_fk record;
  found_fk boolean;
  unexpected text;
begin
  -- Não adivinhar propriedade de tabelas adicionadas fora destas migrações,
  -- incluindo convites sem user_id e dependências indiretas por FK.
  select string_agg(distinct n.nspname || '.' || c.relname, ', ')
    into unexpected
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p')
     and not (c.relname = any(personal_tables))
     and (c.relname ~* '(invit|convite)' or exists (
       select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped
     ) or exists (
       select 1 from pg_constraint fk
       join pg_class parent on parent.oid=fk.confrelid
       join pg_namespace pn on pn.oid=parent.relnamespace
       where fk.conrelid=c.oid and fk.contype='f' and
         ((pn.nspname='auth' and parent.relname='users') or
          (pn.nspname='public' and parent.relname=any(personal_tables)))
     ));
  if unexpected is not null then
    raise exception 'Revise a propriedade e a exclusão das tabelas adicionais antes de aplicar: %', unexpected;
  end if;

  select attnum into strict auth_att from pg_attribute
    where attrelid='auth.users'::regclass and attname='id' and not attisdropped;
  foreach table_name in array personal_tables loop
    table_oid := to_regclass(format('public.%I', table_name));
    if table_oid is null then raise exception 'Tabela ausente: %. Aplique 001, 002 e 003 primeiro.', table_name; end if;
    select attnum into strict owner_att from pg_attribute
      where attrelid=table_oid and attname='user_id' and not attisdropped;
    found_fk := false;
    for existing_fk in select conname, confdeltype, convalidated from pg_constraint
      where conrelid=table_oid and confrelid='auth.users'::regclass and contype='f'
        and conkey=array[owner_att] and confkey=array[auth_att]
    loop
      found_fk := true;
      if existing_fk.confdeltype <> 'c' then
        execute format('alter table public.%I drop constraint %I', table_name, existing_fk.conname);
        execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade', table_name, existing_fk.conname);
      elsif not existing_fk.convalidated then
        execute format('alter table public.%I validate constraint %I', table_name, existing_fk.conname);
      end if;
    end loop;
    if not found_fk then
      -- O PostgreSQL escolhe o nome; não supomos nomes de constraints existentes.
      execute format('alter table public.%I add foreign key (user_id) references auth.users(id) on delete cascade', table_name);
    end if;
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Apenas inventário. Objetos são removidos pela API Storage, nunca por DELETE SQL.
-- A API pública do Storage não lista recursivamente por proprietário entre buckets.
create or replace function public.account_owned_storage_objects(p_user_id uuid)
returns table(bucket_id text, name text)
language plpgsql security invoker set search_path = ''
as $$
declare
  has_owner_id boolean;
  has_owner boolean;
  ownership text;
begin
  if p_user_id is null then raise exception 'Proprietário obrigatório'; end if;
  if to_regclass('storage.objects') is null then return; end if;
  select exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner_id' and not attisdropped),
         exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner' and not attisdropped)
    into has_owner_id, has_owner;
  if has_owner_id and has_owner then
    ownership := 'coalesce(nullif(o.owner_id::text, ''''), o.owner::text)';
  elsif has_owner_id then ownership := 'o.owner_id::text';
  elsif has_owner then ownership := 'o.owner::text';
  else raise exception 'Storage sem coluna de proprietário reconhecida; exclusão interrompida';
  end if;
  return query execute format(
    'select o.bucket_id::text, o.name::text from storage.objects o where %s = $1::text order by o.bucket_id, o.name limit 500', ownership
  ) using p_user_id;
end $$;
revoke all on function public.account_owned_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.account_owned_storage_objects(uuid) to service_role;
comment on function public.account_owned_storage_objects(uuid) is
  'Inventário administrativo de objetos pelo proprietário validado no backend. Remover pela API Storage antes de auth.admin.deleteUser. Não usar prefixos de nome como prova de propriedade.';

commit;
