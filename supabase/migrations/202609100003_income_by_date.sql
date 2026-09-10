begin;

-- Existing installations apply only this incremental migration after 001/002.
alter table public.transactions add column auto_realize boolean not null default false;
alter table public.transactions add constraint automatic_income_only
  check (not auto_realize or (type = 'income' and recurrence_id is not null));

-- Legacy recurring income projections adopt the requested date-based behavior.
-- Existing manual transactions, realized records and deleted records are preserved.
update public.transactions set auto_realize = true
where type = 'income' and recurrence_id is not null and status = 'planned' and deleted_at is null;

create or replace function public.generate_occurrences(p_month date) returns void language plpgsql security invoker set search_path = '' as $$
declare local_today date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_month is null or extract(day from p_month) <> 1 or p_month not between date '2000-01-01' and date '2100-12-01' then
    raise exception 'Invalid calendar month' using errcode = '23514';
  end if;
  -- Serialize generation with rule edits; the unique key is the final concurrency guard.
  -- Lock profile first, matching setup/budget lock order and avoiding deadlocks.
  perform user_id from public.profiles where user_id = auth.uid() for update;
  perform id from public.recurrences where user_id = auth.uid() order by id for update;
  select (now() at time zone timezone)::date into local_today from public.profiles where user_id = auth.uid();
  update public.transactions set status = 'realized'
    where user_id = auth.uid() and auto_realize and status = 'planned' and deleted_at is null
      and date >= p_month and date < p_month + interval '1 month' and date <= local_today;
  insert into public.transactions(user_id,category_id,type,amount,description,date,status,expense_kind,recurrence_id,occurrence_month,auto_realize)
  select r.user_id,v.category_id,v.type,v.amount,v.description,public.finance_due_date(p_month,v.day_of_month),
    case when v.type = 'income' and public.finance_due_date(p_month,v.day_of_month) <= local_today then 'realized' else 'planned' end,
    v.expense_kind,r.id,p_month,(v.type = 'income')
  from public.recurrences r
  cross join lateral (select value from jsonb_array_elements(r.revisions) where (value->>'effective_month')::date <= p_month order by (value->>'effective_month')::date desc limit 1) revision
  cross join lateral jsonb_populate_record(null::public.recurrences,revision.value) v
  join public.categories c on c.user_id = r.user_id and c.id = v.category_id
  where r.user_id = auth.uid() and v.active and c.active and p_month >= v.start_month and (v.end_month is null or p_month <= v.end_month)
  on conflict (user_id,recurrence_id,occurrence_month) do nothing;
end $$;


-- Freeze due income before edits to its rule can alter historical projections.
create function public.finance_settle_income_before_rule_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.transactions set status = 'realized'
  where user_id = old.user_id and recurrence_id = old.id and auto_realize
    and status = 'planned' and deleted_at is null
    and date <= (select (now() at time zone timezone)::date from public.profiles where user_id = old.user_id);
  return new;
end $$;
create trigger finance_income_settle before update on public.recurrences
for each row execute function public.finance_settle_income_before_rule_change();
revoke all on function public.finance_settle_income_before_rule_change() from public,anon,authenticated;
revoke all on function public.generate_occurrences(date) from public,anon;
grant execute on function public.generate_occurrences(date) to authenticated;

commit;
