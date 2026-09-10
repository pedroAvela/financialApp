begin;

create function public.initialize_finance() returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.profiles(user_id,name) values(auth.uid(),left(coalesce(auth.jwt()->'user_metadata'->>'name',''),60)) on conflict do nothing;
  insert into public.categories(user_id,name,type,color,default_key)
  select auth.uid(),v.name,v.type,v.color,v.key from (values
    ('Moradia','expense','#137968','housing'),('Alimentação','expense','#65a897','food'),
    ('Transporte','expense','#a8c8b7','transport'),('Lazer','expense','#d4b77f','leisure'),
    ('Saúde','expense','#8997b1','health'),('Outros','expense','#bfaba1','other'),
    ('Salário','income','#137968','salary'),('Trabalho extra','income','#65a897','freelance')
  ) as v(name,type,color,key) on conflict do nothing;
end $$;

-- Only this Auth trigger needs elevated rights. It has no public execute grant,
-- takes the ID from NEW and never processes a caller-supplied owner.
create function public.finance_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id,name) values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),60)) on conflict do nothing;
  insert into public.categories(user_id,name,type,color,default_key)
  select new.id,v.name,v.type,v.color,v.key from (values
    ('Moradia','expense','#137968','housing'),('Alimentação','expense','#65a897','food'),
    ('Transporte','expense','#a8c8b7','transport'),('Lazer','expense','#d4b77f','leisure'),
    ('Saúde','expense','#8997b1','health'),('Outros','expense','#bfaba1','other'),
    ('Salário','income','#137968','salary'),('Trabalho extra','income','#65a897','freelance')
  ) as v(name,type,color,key) on conflict do nothing;
  return new;
end $$;
revoke all on function public.finance_new_user() from public,anon,authenticated;
create trigger finance_user_created after insert on auth.users for each row execute function public.finance_new_user();

-- Existing Auth users: preserve all existing preferences and category identities.
insert into public.profiles(user_id,name)
select id,left(coalesce(raw_user_meta_data->>'name',''),60) from auth.users on conflict do nothing;
insert into public.categories(user_id,name,type,color,default_key)
select u.id,v.name,v.type,v.color,v.key from auth.users u cross join (values
  ('Moradia','expense','#137968','housing'),('Alimentação','expense','#65a897','food'),
  ('Transporte','expense','#a8c8b7','transport'),('Lazer','expense','#d4b77f','leisure'),
  ('Saúde','expense','#8997b1','health'),('Outros','expense','#bfaba1','other'),
  ('Salário','income','#137968','salary'),('Trabalho extra','income','#65a897','freelance')
) as v(name,type,color,key) on conflict do nothing;

create function public.finance_due_date(p_month date,p_day integer) returns date
language sql immutable security invoker set search_path = '' as $$
  select p_month + (least(p_day,extract(day from (p_month + interval '1 month - 1 day'))::integer) - 1);
$$;

-- Keep rule versions so a future-dated edit does not change an earlier month
-- that has not been opened/generated yet. Only this trigger can write revisions.
create function public.finance_rule_revision() returns trigger language plpgsql security invoker set search_path = '' as $$
declare previous jsonb;
begin
  if TG_OP = 'INSERT' then
    new.revisions = jsonb_build_array((to_jsonb(new) - 'revisions') || jsonb_build_object('effective_month',new.start_month));
  else
    select coalesce(jsonb_agg(value),'[]'::jsonb) into previous from jsonb_array_elements(old.revisions)
    where (value->>'effective_month')::date < new.effective_month;
    new.revisions = previous || jsonb_build_array(to_jsonb(new) - 'revisions');
  end if;
  return new;
end $$;
create trigger finance_rule_revision before insert or update on public.recurrences for each row execute function public.finance_rule_revision();
revoke all on function public.finance_rule_revision() from public,anon,authenticated;

create function public.generate_occurrences(p_month date) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_month is null or extract(day from p_month) <> 1 or p_month not between date '2000-01-01' and date '2100-12-01' then
    raise exception 'Invalid calendar month' using errcode = '23514';
  end if;
  -- Serialize generation with rule edits; the unique key is the final concurrency guard.
  -- Lock profile first, matching setup/budget lock order and avoiding deadlocks.
  perform user_id from public.profiles where user_id = auth.uid() for update;
  perform id from public.recurrences where user_id = auth.uid() order by id for update;
  insert into public.transactions(user_id,category_id,type,amount,description,date,status,expense_kind,recurrence_id,occurrence_month)
  select r.user_id,v.category_id,v.type,v.amount,v.description,public.finance_due_date(p_month,v.day_of_month),
    'planned',v.expense_kind,r.id,p_month
  from public.recurrences r
  cross join lateral (select value from jsonb_array_elements(r.revisions) where (value->>'effective_month')::date <= p_month order by (value->>'effective_month')::date desc limit 1) revision
  cross join lateral jsonb_populate_record(null::public.recurrences,revision.value) v
  join public.categories c on c.user_id = r.user_id and c.id = v.category_id
  where r.user_id = auth.uid() and v.active and c.active and p_month >= v.start_month and (v.end_month is null or p_month <= v.end_month)
  on conflict (user_id,recurrence_id,occurrence_month) do nothing;
end $$;

create function public.finance_recurrence_changed() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Realized entries and explicitly removed occurrences are historical snapshots.
  update public.transactions set amount = new.amount, category_id = new.category_id,
    description = new.description, expense_kind = new.expense_kind,
    date = public.finance_due_date(occurrence_month,new.day_of_month)
  where user_id = new.user_id and recurrence_id = new.id and status = 'planned' and deleted_at is null
    and occurrence_month >= new.effective_month and occurrence_month >= new.start_month
    and (new.end_month is null or occurrence_month <= new.end_month) and new.active;
  -- Remove only future unconfirmed projections outside the edited rule. Explicit
  -- user deletions remain tombstones, preventing regeneration on refresh.
  delete from public.transactions where user_id = new.user_id and recurrence_id = new.id
    and status = 'planned' and deleted_at is null and occurrence_month >= new.effective_month
    and (not new.active or occurrence_month < new.start_month or (new.end_month is not null and occurrence_month > new.end_month));
  return new;
end $$;
create trigger recurrence_changed after update on public.recurrences for each row execute function public.finance_recurrence_changed();
revoke all on function public.finance_recurrence_changed() from public,anon,authenticated;

create function public.save_budget(p_month date,p_category uuid,p_amount bigint) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_month is null or extract(day from p_month) <> 1 or p_month not between date '2000-01-01' and date '2100-12-01' then raise exception 'Invalid month' using errcode = '23514'; end if;
  if p_amount is null then
    delete from public.budgets where user_id = auth.uid() and month = p_month and category_id is not distinct from p_category;
  else
    -- Serialize per user so editing an existing archived category budget does
    -- not have to pass through the active-category INSERT guard.
    perform user_id from public.profiles where user_id = auth.uid() for update;
    update public.budgets set amount = p_amount where user_id = auth.uid() and month = p_month and category_id is not distinct from p_category;
    if not found then
      insert into public.budgets(user_id,month,category_id,amount) values(auth.uid(),p_month,p_category,p_amount);
    end if;
  end if;
end $$;

-- Atomic, repeatable initial setup. Dedicated setup_key values keep the two
-- optional base rules stable when the user revisits this form.
create function public.save_initial_setup(p_month date,p_income bigint,p_fixed bigint,p_budget bigint,p_income_category uuid,p_fixed_category uuid,p_day integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_month date;
begin
  perform public.initialize_finance();
  select date_trunc('month',now() at time zone timezone)::date into current_month from public.profiles where user_id = auth.uid() for update;
  if p_month < current_month then raise exception 'Setup must apply to current month or later' using errcode = '23514'; end if;
  if p_income is null or p_fixed is null or p_day is null or p_income < 0 or p_fixed < 0 or p_income > 99999999999 or p_fixed > 99999999999 or p_day not between 1 and 31 then raise exception 'Invalid setup values' using errcode = '23514'; end if;
  perform public.save_budget(p_month,null,p_budget);
  if p_income > 0 then
    insert into public.recurrences(user_id,category_id,type,amount,description,expense_kind,day_of_month,start_month,effective_month,setup_key)
    values(auth.uid(),p_income_category,'income',p_income,'Renda mensal',null,p_day,p_month,p_month,'income')
    on conflict(user_id,setup_key) do update set category_id=excluded.category_id,amount=excluded.amount,day_of_month=excluded.day_of_month,effective_month=p_month,active=true;
  else
    update public.recurrences set active=false,effective_month=p_month where user_id=auth.uid() and setup_key='income';
  end if;
  if p_fixed > 0 then
    insert into public.recurrences(user_id,category_id,type,amount,description,expense_kind,day_of_month,start_month,effective_month,setup_key)
    values(auth.uid(),p_fixed_category,'expense',p_fixed,'Despesas fixas mensais','fixed',p_day,p_month,p_month,'fixed')
    on conflict(user_id,setup_key) do update set category_id=excluded.category_id,amount=excluded.amount,day_of_month=excluded.day_of_month,effective_month=p_month,active=true;
  else
    update public.recurrences set active=false,effective_month=p_month where user_id=auth.uid() and setup_key='fixed';
  end if;
  update public.profiles set onboarding_completed=true where user_id=auth.uid();
  perform public.generate_occurrences(p_month);
end $$;

revoke all on function public.initialize_finance(),public.generate_occurrences(date),public.finance_due_date(date,integer),public.save_budget(date,uuid,bigint),public.save_initial_setup(date,bigint,bigint,bigint,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.initialize_finance(),public.generate_occurrences(date),public.finance_due_date(date,integer),public.save_budget(date,uuid,bigint),public.save_initial_setup(date,bigint,bigint,bigint,uuid,uuid,integer) to authenticated;
commit;
