begin;

-- No financial schema is documented in this repository. Stop safely on a name
-- collision rather than modifying or replacing an unknown existing table.
do $$
begin
  if to_regclass('public.profiles') is not null or to_regclass('public.categories') is not null
    or to_regclass('public.transactions') is not null or to_regclass('public.recurrences') is not null
    or to_regclass('public.budgets') is not null then
    raise exception 'Financial tables already exist. Compare their schema before applying this migration; no data was changed.';
  end if;
end $$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  name text not null default '' check (char_length(name) <= 60),
  timezone text not null default 'America/Sao_Paulo',
  currency text not null default 'BRL' check (currency = 'BRL'),
  locale text not null default 'pt-BR' check (locale = 'pt-BR'),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null check (type in ('income','expense')),
  color text not null default '#137968' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  default_key text,
  created_at timestamptz not null default now(),
  unique (user_id,id,type),
  unique (user_id,default_key)
);
create unique index categories_name_unique on public.categories(user_id,type,lower(btrim(name)));

create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  category_id uuid not null,
  type text not null check (type in ('income','expense')),
  amount bigint not null check (amount between 1 and 99999999999),
  description text not null default '' check (char_length(description) <= 200),
  expense_kind text check ((type = 'income' and expense_kind is null) or (type = 'expense' and expense_kind is not null and expense_kind in ('fixed','variable'))),
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_month date not null check (extract(day from start_month) = 1 and start_month between date '2000-01-01' and date '2100-12-01'),
  end_month date check (extract(day from end_month) = 1 and end_month >= start_month and end_month <= date '2100-12-01'),
  effective_month date not null check (extract(day from effective_month) = 1 and effective_month between date '2000-01-01' and date '2100-12-01'),
  active boolean not null default true,
  setup_key text check (setup_key in ('income','fixed')),
  revisions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id,id,type),
  unique (user_id,setup_key),
  foreign key (user_id,category_id,type) references public.categories(user_id,id,type)
);
create index recurrences_user_period on public.recurrences(user_id,start_month,end_month) where active;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  category_id uuid not null,
  type text not null check (type in ('income','expense')),
  amount bigint not null check (amount between 1 and 99999999999),
  description text not null default '' check (char_length(description) <= 200),
  date date not null check (date between date '2000-01-01' and date '2100-12-31'),
  status text not null default 'realized' check (status in ('planned','realized')),
  expense_kind text check ((type = 'income' and expense_kind is null) or (type = 'expense' and expense_kind is not null and expense_kind in ('fixed','variable'))),
  recurrence_id uuid,
  occurrence_month date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (user_id,category_id,type) references public.categories(user_id,id,type),
  foreign key (user_id,recurrence_id,type) references public.recurrences(user_id,id,type),
  check ((recurrence_id is null and occurrence_month is null) or
    (recurrence_id is not null and occurrence_month is not null and extract(day from occurrence_month) = 1 and occurrence_month between date '2000-01-01' and date '2100-12-01')),
  unique (user_id,recurrence_id,occurrence_month)
);
create index transactions_user_date on public.transactions(user_id,date,id) where deleted_at is null;
create index transactions_user_category on public.transactions(user_id,category_id);
create index transactions_user_status on public.transactions(user_id,status,date);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  month date not null check (extract(day from month) = 1 and month between date '2000-01-01' and date '2100-12-01'),
  category_id uuid,
  type text not null default 'expense' check (type = 'expense'),
  amount bigint not null check (amount between 0 and 99999999999),
  foreign key (user_id,category_id,type) references public.categories(user_id,id,type),
  unique nulls not distinct (user_id,month,category_id)
);

-- An immutable owner is enforced independently of the application and RLS.
create function public.finance_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Owner cannot be changed' using errcode = '23514';
  end if;
  if TG_TABLE_NAME <> 'profiles' then
    if TG_OP = 'UPDATE' and new.id is distinct from old.id then
      raise exception 'Record ID cannot be changed' using errcode = '23514';
    end if;
  end if;
  if TG_TABLE_NAME = 'profiles' then
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
      raise exception 'Invalid timezone' using errcode = '23514';
    end if;
  elsif TG_TABLE_NAME = 'categories' then
    if TG_OP = 'UPDATE' and (new.type is distinct from old.type or new.default_key is distinct from old.default_key) then
      raise exception 'Category type and initialization key cannot be changed' using errcode = '23514';
    end if;
  else
    if new.category_id is not null and (TG_OP = 'INSERT' or new.category_id is distinct from old.category_id) then
      if not exists (select 1 from public.categories where id = new.category_id and user_id = new.user_id and active and type = new.type) then
        raise exception 'Invalid or archived category' using errcode = '23514';
      end if;
    end if;
    if TG_TABLE_NAME = 'transactions' and TG_OP = 'UPDATE' then
      if new.recurrence_id is distinct from old.recurrence_id or new.occurrence_month is distinct from old.occurrence_month then
        raise exception 'Occurrence identity cannot be changed' using errcode = '23514';
      end if;
    end if;
    if TG_TABLE_NAME = 'recurrences' and TG_OP = 'UPDATE' then
      if new.revisions is distinct from old.revisions then
        raise exception 'Rule revisions are managed by the database' using errcode = '23514';
      end if;
      if new.type is distinct from old.type or new.setup_key is distinct from old.setup_key then
        raise exception 'Recurrence type and initialization key cannot be changed' using errcode = '23514';
      end if;
      if new.effective_month < (select date_trunc('month',now() at time zone timezone)::date from public.profiles where user_id = new.user_id) then
        raise exception 'Recurrence changes must apply to the current month or later' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.finance_guard() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles','categories','transactions','recurrences','budgets'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update on public.%I to authenticated',t);
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',t);
    execute format('create policy own_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
    execute format('create trigger finance_guard before insert or update on public.%I for each row execute function public.finance_guard()',t);
  end loop;
end $$;
grant delete on public.transactions,public.budgets to authenticated;
create policy own_delete on public.transactions for delete to authenticated using (user_id = (select auth.uid()));
create policy own_delete on public.budgets for delete to authenticated using (user_id = (select auth.uid()));
-- Profiles cannot be deleted through the Data API; categories and rules are archived.
commit;
