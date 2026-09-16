-- Apply AFTER 001, 002, 003 and 004. No existing rows/tables are removed.
begin;

-- Retain request keys even after deleting an unpaid plan. A delayed retry must
-- never recreate a purchase that the user already deleted. Removed by Auth cascade.
create table public.installment_requests (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  plan_id uuid not null unique,
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  created_at timestamptz not null default now(),
  primary key(user_id,client_request_id),
  unique(user_id,client_request_id,plan_id)
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  type text not null default 'expense' check (type = 'expense'),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  total_amount_cents bigint not null check (total_amount_cents between 2 and 99999999999),
  installment_count integer not null check (installment_count between 2 and 60 and total_amount_cents >= installment_count),
  purchase_date date not null check (purchase_date between date '2000-01-01' and date '2100-12-31'),
  first_due_date date not null check (first_due_date >= purchase_date and first_due_date <= date '2100-12-31'),
  payment_method text check (char_length(payment_method) between 1 and 60),
  expense_kind text not null default 'variable' check (expense_kind in ('fixed','variable')),
  status text not null default 'active' check (status in ('active','cancelled')),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,id),
  unique(user_id,client_request_id),
  foreign key(user_id,category_id,type) references public.categories(user_id,id,type),
  foreign key(user_id,client_request_id,id) references public.installment_requests(user_id,client_request_id,plan_id)
);
create index installment_plans_user_status on public.installment_plans(user_id,status,first_due_date);
create index installment_plans_category on public.installment_plans(user_id,category_id);

alter table public.transactions
  add column installment_plan_id uuid,
  add column installment_number integer,
  add column total_installments integer,
  add column due_date date,
  add column payment_date date,
  add column scheduled_amount_cents bigint,
  add constraint transaction_installment_owner foreign key(user_id,installment_plan_id)
    references public.installment_plans(user_id,id) on delete cascade,
  add constraint transaction_installment_unique unique(installment_plan_id,installment_number),
  add constraint transaction_installment_shape check (
    (installment_plan_id is null and installment_number is null and total_installments is null and due_date is null and payment_date is null and scheduled_amount_cents is null)
    or (installment_plan_id is not null and installment_number is not null and total_installments is not null
      and installment_number between 1 and total_installments and total_installments between 2 and 60
      and type='expense' and recurrence_id is null and not auto_realize
      and due_date is not null and due_date between date '2000-01-01' and date '2100-12-31'
      and scheduled_amount_cents is not null and scheduled_amount_cents between 1 and 99999999999
      and ((status='planned' and payment_date is null and date=due_date and amount=scheduled_amount_cents)
        or (status='realized' and payment_date is not null and date=payment_date and deleted_at is null)))
  );
create index transactions_installment_user on public.transactions(user_id,installment_plan_id,installment_number) where installment_plan_id is not null;
create index transactions_installment_due on public.transactions(user_id,due_date) where installment_plan_id is not null and status='planned' and deleted_at is null;

alter table public.installment_plans enable row level security;
alter table public.installment_requests enable row level security;
revoke all on public.installment_plans,public.installment_requests from public,anon,authenticated;
grant select,insert,update,delete on public.installment_plans to authenticated;
grant select,insert on public.installment_requests to authenticated;
create policy own_select on public.installment_plans for select to authenticated using(user_id=(select auth.uid()));
create policy own_insert on public.installment_plans for insert to authenticated with check(user_id=(select auth.uid()));
create policy own_update on public.installment_plans for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_delete on public.installment_plans for delete to authenticated using(user_id=(select auth.uid()));
create policy own_select on public.installment_requests for select to authenticated using(user_id=(select auth.uid()));
create policy own_insert on public.installment_requests for insert to authenticated with check(user_id=(select auth.uid()));
create trigger finance_guard before insert or update on public.installment_plans for each row execute function public.finance_guard();

create function public.installment_plan_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  -- Only referential cascades can nest this DELETE trigger. Auth deletion must
  -- remove paid history as well; a direct plan DELETE may never do so.
  if TG_OP='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if TG_OP='DELETE' then
    perform user_id from public.profiles where user_id=old.user_id for update;
    if exists(select 1 from public.transactions where user_id=old.user_id and installment_plan_id=old.id and status='realized') then
      raise exception 'Paid history cannot be deleted' using errcode='P1102';
    end if;
    return old;
  end if;
  perform user_id from public.profiles where user_id=new.user_id for update;
  if TG_OP='INSERT' then
    if new.status<>'active' then raise exception 'Invalid initial status' using errcode='23514'; end if;
  else
    if new.client_request_id is distinct from old.client_request_id or new.created_at is distinct from old.created_at then
      raise exception 'Request identity is immutable' using errcode='23514';
    end if;
    if old.status='cancelled' then raise exception 'Plan already cancelled' using errcode='P1102'; end if;
    if row(new.total_amount_cents,new.installment_count,new.purchase_date,new.first_due_date)
      is distinct from row(old.total_amount_cents,old.installment_count,old.purchase_date,old.first_due_date)
      and exists(select 1 from public.transactions where user_id=old.user_id and installment_plan_id=old.id and status='realized') then
      raise exception 'Paid plan cannot be regenerated' using errcode='P1102';
    end if;
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
create trigger installment_plan_guard before insert or update or delete on public.installment_plans for each row execute function public.installment_plan_guard();

create function public.installment_transaction_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare plan public.installment_plans; local_today date;
begin
  if TG_OP='DELETE' then
    if old.installment_plan_id is null or pg_trigger_depth()>1 then return old; end if;
    perform user_id from public.profiles where user_id=old.user_id for update;
    if old.status='realized' then raise exception 'Paid installment is immutable' using errcode='P1102'; end if;
    return old;
  end if;
  if TG_OP='UPDATE' then
    if row(new.installment_plan_id,new.installment_number,new.total_installments,new.due_date,new.scheduled_amount_cents)
      is distinct from row(old.installment_plan_id,old.installment_number,old.total_installments,old.due_date,old.scheduled_amount_cents) then
      raise exception 'Installment identity is immutable' using errcode='23514';
    end if;
  end if;
  if new.installment_plan_id is null then return new; end if;
  select (now() at time zone timezone)::date into local_today from public.profiles where user_id=new.user_id for update;
  select * into plan from public.installment_plans where user_id=new.user_id and id=new.installment_plan_id;
  if not found then raise exception 'Invalid plan owner' using errcode='23503'; end if;
  if TG_OP='INSERT' and (new.status<>'planned' or plan.status<>'active') then
    raise exception 'New installments must be planned' using errcode='23514';
  end if;
  if TG_OP='UPDATE' and (old.status='realized' or old.deleted_at is not null) and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'Paid or cancelled installment is immutable' using errcode='P1102';
  end if;
  if new.status='realized' then
    if plan.status<>'active' or new.payment_date<plan.purchase_date or new.payment_date>local_today then
      raise exception 'Invalid payment date or plan status' using errcode='23514';
    end if;
    if TG_OP='UPDATE' and row(new.description,new.category_id,new.expense_kind) is distinct from row(old.description,old.category_id,old.expense_kind) then
      raise exception 'Payment cannot rewrite purchase information' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger installment_transaction_guard before insert or update or delete on public.transactions for each row execute function public.installment_transaction_guard();

-- Deferred validation also protects direct Data API requests: a plan must have
-- its complete, exact schedule at COMMIT, including cancelled and paid rows.
create function public.installment_consistency() returns trigger
language plpgsql security invoker set search_path='' as $$
declare plan public.installment_plans; plan_id uuid; owner_id uuid; row_count integer; correct boolean;
begin
  if TG_TABLE_NAME='installment_plans' then
    plan_id=case when TG_OP='DELETE' then old.id else new.id end;
  else
    plan_id=case when TG_OP='DELETE' then old.installment_plan_id else new.installment_plan_id end;
  end if;
  if plan_id is null then return null; end if;
  owner_id=case when TG_OP='DELETE' then old.user_id else new.user_id end;
  select * into plan from public.installment_plans where id=plan_id and user_id=owner_id;
  if not found then return null; end if;
  select count(*), bool_and(
    t.total_installments=plan.installment_count and t.installment_number between 1 and plan.installment_count
    and t.scheduled_amount_cents=plan.total_amount_cents/plan.installment_count + case when t.installment_number=plan.installment_count then plan.total_amount_cents%plan.installment_count else 0 end
    and t.due_date=public.finance_due_date((date_trunc('month',plan.first_due_date)+(t.installment_number-1)*interval '1 month')::date,extract(day from plan.first_due_date)::integer)
    and (t.status='realized' or (t.description=plan.description and t.category_id=plan.category_id and t.expense_kind=plan.expense_kind))
    and ((plan.status='active' and t.deleted_at is null) or (plan.status='cancelled' and ((t.status='realized' and t.deleted_at is null) or (t.status='planned' and t.deleted_at is not null))))
  ) into row_count, correct from public.transactions t where t.user_id=owner_id and t.installment_plan_id=plan_id;
  if row_count<>plan.installment_count or correct is distinct from true then
    raise exception 'Incomplete or inconsistent installment schedule' using errcode='23514';
  end if;
  return null;
end $$;
create constraint trigger installment_plan_complete after insert or update on public.installment_plans deferrable initially deferred for each row execute function public.installment_consistency();
create constraint trigger installment_rows_complete after insert or update or delete on public.transactions deferrable initially deferred for each row execute function public.installment_consistency();

create function public.finance_installment_rows(p_plan uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.transactions(user_id,category_id,type,amount,description,date,status,expense_kind,installment_plan_id,installment_number,total_installments,due_date,scheduled_amount_cents)
  select p.user_id,p.category_id,'expense',part.amount,p.description,part.due,'planned',p.expense_kind,p.id,n,p.installment_count,part.due,part.amount
  from public.installment_plans p cross join lateral generate_series(1,p.installment_count) n
  cross join lateral (select p.total_amount_cents/p.installment_count + case when n=p.installment_count then p.total_amount_cents%p.installment_count else 0 end as amount,
    public.finance_due_date((date_trunc('month',p.first_due_date)+(n-1)*interval '1 month')::date,extract(day from p.first_due_date)::integer) as due) part
  where p.user_id=auth.uid() and p.id=p_plan and p.status='active';
end $$;

create function public.create_installment_plan(p_request uuid,p_category uuid,p_description text,p_total bigint,p_count integer,p_purchase date,p_first_due date,p_method text,p_kind text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare request public.installment_requests; payload jsonb; new_id uuid=gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform user_id from public.profiles where user_id=auth.uid() for update;
  if not found then raise exception 'Profile required' using errcode='42501'; end if;
  payload=jsonb_build_object('category',p_category,'description',btrim(p_description),'total',p_total,'count',p_count,'purchase',p_purchase,'first_due',p_first_due,'method',nullif(btrim(p_method),''),'kind',p_kind);
  select * into request from public.installment_requests where user_id=auth.uid() and client_request_id=p_request;
  if found then
    if request.payload_hash is distinct from sha256(convert_to(payload::text,'UTF8')) or not exists(select 1 from public.installment_plans where user_id=auth.uid() and id=request.plan_id) then
      raise exception 'Request already used or deleted' using errcode='P1101';
    end if;
    return request.plan_id;
  end if;
  insert into public.installment_requests(user_id,client_request_id,plan_id,payload_hash) values(auth.uid(),p_request,new_id,sha256(convert_to(payload::text,'UTF8')));
  insert into public.installment_plans(id,user_id,category_id,description,total_amount_cents,installment_count,purchase_date,first_due_date,payment_method,expense_kind,client_request_id)
  values(new_id,auth.uid(),p_category,btrim(p_description),p_total,p_count,p_purchase,p_first_due,nullif(btrim(p_method),''),p_kind,p_request);
  perform public.finance_installment_rows(new_id);
  return new_id;
end $$;

create function public.edit_installment_plan(p_plan uuid,p_category uuid,p_description text,p_total bigint,p_count integer,p_purchase date,p_first_due date,p_method text,p_kind text,p_confirmed boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare plan public.installment_plans; regenerate boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_confirmed is distinct from true then raise exception 'Confirmation required' using errcode='23514'; end if;
  perform user_id from public.profiles where user_id=auth.uid() for update;
  select * into plan from public.installment_plans where user_id=auth.uid() and id=p_plan for update;
  if not found then raise exception 'Plan not found' using errcode='P1104'; end if;
  regenerate=row(plan.total_amount_cents,plan.installment_count,plan.purchase_date,plan.first_due_date) is distinct from row(p_total,p_count,p_purchase,p_first_due);
  update public.installment_plans set category_id=p_category,description=btrim(p_description),total_amount_cents=p_total,installment_count=p_count,
    purchase_date=p_purchase,first_due_date=p_first_due,payment_method=nullif(btrim(p_method),''),expense_kind=p_kind where id=p_plan and user_id=auth.uid();
  if regenerate then
    delete from public.transactions where user_id=auth.uid() and installment_plan_id=p_plan;
    perform public.finance_installment_rows(p_plan);
  else
    update public.transactions set category_id=p_category,description=btrim(p_description),expense_kind=p_kind
      where user_id=auth.uid() and installment_plan_id=p_plan and status='planned' and deleted_at is null;
  end if;
end $$;

create function public.pay_installment(p_transaction uuid,p_date date,p_amount bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare item public.transactions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform user_id from public.profiles where user_id=auth.uid() for update;
  select * into item from public.transactions where user_id=auth.uid() and id=p_transaction and installment_plan_id is not null and deleted_at is null for update;
  if not found then raise exception 'Installment not found' using errcode='P1104'; end if;
  if item.status='realized' then
    if item.payment_date is distinct from p_date or item.amount is distinct from p_amount then raise exception 'Payment already recorded' using errcode='P1102'; end if;
    return;
  end if;
  update public.transactions set status='realized',date=p_date,payment_date=p_date,amount=p_amount where user_id=auth.uid() and id=p_transaction;
end $$;

create function public.cancel_installment_plan(p_plan uuid,p_confirmed boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare plan public.installment_plans;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_confirmed is distinct from true then raise exception 'Confirmation required' using errcode='23514'; end if;
  perform user_id from public.profiles where user_id=auth.uid() for update;
  select * into plan from public.installment_plans where user_id=auth.uid() and id=p_plan for update;
  if not found then raise exception 'Plan not found' using errcode='P1104'; end if;
  if plan.status='cancelled' then return; end if;
  update public.installment_plans set status='cancelled' where user_id=auth.uid() and id=p_plan;
  update public.transactions set deleted_at=now() where user_id=auth.uid() and installment_plan_id=p_plan and status='planned' and deleted_at is null;
end $$;

create function public.delete_installment_plan(p_plan uuid,p_confirmed boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_confirmed is distinct from true then raise exception 'Confirmation required' using errcode='23514'; end if;
  perform user_id from public.profiles where user_id=auth.uid() for update;
  delete from public.installment_plans where user_id=auth.uid() and id=p_plan;
  if not found then raise exception 'Plan not found' using errcode='P1104'; end if;
end $$;

revoke all on function public.installment_plan_guard(),public.installment_transaction_guard(),public.installment_consistency() from public,anon,authenticated;
revoke all on function public.finance_installment_rows(uuid),public.create_installment_plan(uuid,uuid,text,bigint,integer,date,date,text,text),public.edit_installment_plan(uuid,uuid,text,bigint,integer,date,date,text,text,boolean),public.pay_installment(uuid,date,bigint),public.cancel_installment_plan(uuid,boolean),public.delete_installment_plan(uuid,boolean) from public,anon,authenticated;
grant execute on function public.finance_installment_rows(uuid),public.create_installment_plan(uuid,uuid,text,bigint,integer,date,date,text,text),public.edit_installment_plan(uuid,uuid,text,bigint,integer,date,date,text,text,boolean),public.pay_installment(uuid,date,bigint),public.cancel_installment_plan(uuid,boolean),public.delete_installment_plan(uuid,boolean) to authenticated;
commit;
