-- Apply AFTER 001-005. Makes the month read path lock-free and bounded.
-- No tables, rows or existing grants are removed.
begin;

-- Occurrences due in one month under the rule version in effect for it.
-- Shared by the read-only fast path and the locked generation below.
create function public.finance_due_occurrences(p_month date)
returns table(recurrence_id uuid,category_id uuid,type text,amount bigint,description text,day_of_month integer,expense_kind text)
language sql stable security invoker set search_path = '' as $$
  select r.id,v.category_id,v.type,v.amount,v.description,v.day_of_month,v.expense_kind
  from public.recurrences r
  cross join lateral (select value from jsonb_array_elements(r.revisions) where (value->>'effective_month')::date <= p_month order by (value->>'effective_month')::date desc limit 1) revision
  cross join lateral jsonb_populate_record(null::public.recurrences,revision.value) v
  join public.categories c on c.user_id = r.user_id and c.id = v.category_id
  where r.user_id = auth.uid() and v.active and c.active and p_month >= v.start_month and (v.end_month is null or p_month <= v.end_month);
$$;
revoke all on function public.finance_due_occurrences(date) from public,anon,authenticated;
grant execute on function public.finance_due_occurrences(date) to authenticated;

create or replace function public.generate_occurrences(p_month date) returns void language plpgsql security invoker set search_path = '' as $$
declare local_today date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_month is null or extract(day from p_month) <> 1 or p_month not between date '2000-01-01' and date '2100-12-01' then
    raise exception 'Invalid calendar month' using errcode = '23514';
  end if;
  select (now() at time zone timezone)::date into local_today from public.profiles where user_id = auth.uid();
  -- Projections stop 24 months ahead: browsing further never writes rows.
  if local_today is null or p_month > (date_trunc('month',local_today) + interval '24 months')::date then return; end if;
  -- Fast path: an already generated and settled month needs no writes or locks.
  if not exists(select 1 from public.transactions where user_id = auth.uid() and auto_realize and status = 'planned' and deleted_at is null
      and date >= p_month and date < p_month + interval '1 month' and date <= local_today)
    and not exists(select 1 from public.finance_due_occurrences(p_month) d where not exists(
      select 1 from public.transactions t where t.user_id = auth.uid() and t.recurrence_id = d.recurrence_id and t.occurrence_month = p_month)) then
    return;
  end if;
  -- Serialize generation with rule edits; the unique key is the final concurrency guard.
  -- Lock profile first, matching setup/budget lock order and avoiding deadlocks.
  perform user_id from public.profiles where user_id = auth.uid() for update;
  perform id from public.recurrences where user_id = auth.uid() order by id for update;
  update public.transactions set status = 'realized'
    where user_id = auth.uid() and auto_realize and status = 'planned' and deleted_at is null
      and date >= p_month and date < p_month + interval '1 month' and date <= local_today;
  insert into public.transactions(user_id,category_id,type,amount,description,date,status,expense_kind,recurrence_id,occurrence_month,auto_realize)
  select auth.uid(),d.category_id,d.type,d.amount,d.description,public.finance_due_date(p_month,d.day_of_month),
    case when d.type = 'income' and public.finance_due_date(p_month,d.day_of_month) <= local_today then 'realized' else 'planned' end,
    d.expense_kind,d.recurrence_id,p_month,(d.type = 'income')
  from public.finance_due_occurrences(p_month) d
  on conflict (user_id,recurrence_id,occurrence_month) do nothing;
end $$;
revoke all on function public.generate_occurrences(date) from public,anon;
grant execute on function public.generate_occurrences(date) to authenticated;

-- Plan list without shipping every installment row; RLS of both tables applies.
create view public.installment_plan_summaries with (security_invoker = true) as
  select p.*,(count(t.id) filter (where t.status = 'realized'))::integer as paid_count
  from public.installment_plans p
  left join public.transactions t on t.user_id = p.user_id and t.installment_plan_id = p.id
  group by p.id;
revoke all on public.installment_plan_summaries from public,anon,authenticated;
grant select on public.installment_plan_summaries to authenticated;

commit;
