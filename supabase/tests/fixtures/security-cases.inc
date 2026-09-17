-- Shared SQL assertions: pgTAP on Supabase and PostgreSQL/PGlite locally.
-- No service_role is used to represent application users. Administrative setup
-- and snapshots surround operations performed with actual authenticated/anon roles.
create schema security_test;
grant usage on schema security_test to authenticated, anon;

create function security_test.become(who uuid, as_role text default 'authenticated') returns void
language plpgsql security invoker as $$
begin
  perform set_config('role', as_role, true);
  perform set_config('request.jwt.claim.sub', coalesce(who::text,''), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',who,'role',as_role)::text, true);
end $$;

create function security_test.attempt(command text) returns table(code text, affected bigint)
language plpgsql security invoker as $$
begin
  execute command;
  get diagnostics affected = row_count;
  -- Exercise deferred integrity checks before accepting a write as successful.
  set constraints all immediate;
  set constraints all deferred;
  code := '00000'; return next;
exception when others then
  code := sqlstate; affected := 0; return next;
end $$;

create function security_test.state() returns jsonb language plpgsql security invoker as $$
declare t text; result jsonb := '{}'; rows jsonb;
begin
  foreach t in array array['profiles','categories','transactions','recurrences','budgets','installment_plans','installment_requests'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r where user_id in (''a0000000-0000-4000-8000-000000000001'',''b0000000-0000-4000-8000-000000000001'')',t) into rows;
    result := result || jsonb_build_object(t,rows);
  end loop;
  return result;
end $$;

create function security_test.run() returns table(label text, passed boolean)
language plpgsql security invoker as $$
declare
  a uuid := 'a0000000-0000-4000-8000-000000000001';
  b uuid := 'b0000000-0000-4000-8000-000000000001';
  person uuid; cat_a uuid; cat_b uuid; rule_a uuid; plan_a uuid; tx_a uuid;
  uid uuid; t text; op text; command text; mutation text; copied jsonb; target text;
  baseline jsonb; outcome record; n bigint; cases text[]; values_sql text;
  tables text[] := array['profiles','categories','transactions','recurrences','budgets','installment_plans','installment_requests'];
begin
  label := 'Inventário: exatamente sete tabelas pessoais com RLS';
  passed := (select count(*)=7 and bool_and(relrowsecurity and c.relname=any(tables)) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind in ('r','p')); return next;
  label := 'Todas as tabelas pessoais possuem FK direta auth.users ON DELETE CASCADE';
  passed := (select count(distinct c.conrelid)=7 from pg_constraint c where c.contype='f' and c.confrelid='auth.users'::regclass and c.confdeltype='c' and c.conrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname=any(tables))); return next;
  label := 'Nenhuma view financeira contorna RLS';
  passed := not exists(select 1 from pg_class c where relnamespace='public'::regnamespace and relkind in ('v','m') and (relkind='m' or not coalesce(reloptions @> array['security_invoker=true'],false))); return next;
  label := 'Funções financeiras têm search_path fixo';
  passed := not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'finance_%' or proname in ('initialize_finance','generate_occurrences','save_budget','save_initial_setup','account_owned_storage_objects') or proname like '%installment%') and not coalesce(proconfig @> array['search_path=""'],false)); return next;
  label := 'SECURITY DEFINER restrito ao trigger Auth, inacessível a anon/authenticated';
  passed := (select count(*)=1 and bool_and(proname='finance_new_user' and not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('authenticated',oid,'EXECUTE')) from pg_proc where pronamespace='public'::regnamespace and prosecdef); return next;
  label := 'Inventário de Storage só é executável administrativamente';
  passed := not has_function_privilege('anon','public.account_owned_storage_objects(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.account_owned_storage_objects(uuid)','EXECUTE'); return next;
  label := 'Triggers não expõem EXECUTE para clientes';
  passed := not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and prorettype='trigger'::regtype and (has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE'))); return next;
  if to_regclass('storage.buckets') is not null then
    label := 'Nenhum bucket público inesperado no ambiente local';
    execute 'select not exists(select 1 from storage.buckets where public)' into passed; return next;
  end if;

  insert into auth.users(id,raw_user_meta_data) values(a,'{"name":"Security A"}'),(b,'{"name":"Security B"}');
  -- Test direct own profile INSERT too, after removing only these isolated fixtures.
  delete from public.profiles where user_id in (a,b);
  foreach person in array array[a,b] loop
    perform security_test.become(person);
    select * into outcome from security_test.attempt(format('insert into public.profiles(user_id,name) values(%L,''Fixture'')',person));
    label := 'Próprio INSERT profiles ' || person; passed := outcome.code='00000'; return next;
    perform public.initialize_finance();
    select id into uid from public.categories where user_id=person and default_key='other';
    insert into public.categories(name,type) values('Categoria exclusiva','expense');
    insert into public.transactions(category_id,type,amount,date,expense_kind,description) values(uid,'expense',1234,'2025-01-10','variable','Original');
    insert into public.recurrences(category_id,type,amount,description,expense_kind,day_of_month,start_month,effective_month)
      values(uid,'expense',2000,'Regra original','fixed',31,date_trunc('month',now())::date,date_trunc('month',now())::date);
    perform public.save_budget('2025-01-01',uid,50000);
    perform public.create_installment_plan(gen_random_uuid(),uid,'Compra original',10000,3,'2025-01-10','2025-01-31',null,'variable');
    set constraints all immediate; set constraints all deferred;
    label := 'Próprio INSERT categorias/transações/recorrências/orçamentos/planos/recibos ' || person;
    passed := true; return next;
    perform set_config('role','none',true);
  end loop;
  select id into cat_a from public.categories where user_id=a and default_key='other';
  select id into cat_b from public.categories where user_id=b and default_key='other';
  select id into rule_a from public.recurrences where user_id=a;
  select id into plan_a from public.installment_plans where user_id=a;
  select id into tx_a from public.transactions where user_id=a and installment_plan_id=plan_a order by installment_number limit 1;

  foreach t in array tables loop
    baseline := security_test.state();
    -- A sees only A, also when aggregating or explicitly requesting B.
    perform security_test.become(a);
    execute format('select count(*) from public.%I where user_id=%L',t,a) into n;
    label := t || ': próprio SELECT tem fixture existente'; passed := n>0; return next;
    execute format('select count(*) from public.%I where user_id=%L',t,b) into n;
    label := t || ': SELECT/agregação não enxergam B'; passed := n=0; return next;
    perform set_config('role','none',true);

    -- Test both directions; IDs are taken from existing rows, not invented.
    foreach person in array array[a,b] loop
      uid := case when person=a then b else a end;
      execute format('select to_jsonb(r) from public.%I r where user_id=%L limit 1',t,uid) into copied;
      target := case t when 'profiles' then format('user_id=%L',copied->>'user_id')
        when 'installment_requests' then format('client_request_id=%L',copied->>'client_request_id')
        else format('id=%L',copied->>'id') end;
      foreach op in array array['SELECT','UPDATE','DELETE','INSERT'] loop
        mutation := case t when 'profiles' then 'name=''Invadido''' when 'categories' then 'name=''Invadido'''
          when 'transactions' then 'description=''Invadido''' when 'recurrences' then 'description=''Invadido'''
          when 'budgets' then 'amount=7' when 'installment_plans' then 'payment_method=''Invadido'''
          else 'payload_hash=decode(repeat(''00'',32),''hex'')' end;
        command := case op when 'SELECT' then format('select * from public.%I where %s',t,target)
          when 'UPDATE' then format('update public.%I set %s where %s',t,mutation,target)
          when 'DELETE' then format('delete from public.%I where %s',t,target) else null end;
        if op='INSERT' then
          if copied ? 'id' then copied := copied || jsonb_build_object('id',gen_random_uuid()); end if;
          if t='categories' then copied := copied || jsonb_build_object('name','Forjada','default_key',null); end if;
          if t in ('installment_plans','installment_requests') then copied := copied || jsonb_build_object('client_request_id',gen_random_uuid()); end if;
          if t='installment_requests' then copied := copied || jsonb_build_object('plan_id',gen_random_uuid()); end if;
          command := format('insert into public.%I select * from jsonb_populate_record(null::public.%I,%L::jsonb)',t,t,copied);
        end if;
        perform security_test.become(person);
        select * into outcome from security_test.attempt(command);
        perform set_config('role','none',true);
        label := t || ': ' || op || ' alheio bloqueado e estado original intacto (' || person || ')';
        passed := (outcome.code in ('42501','23514','23503') or (op<>'INSERT' and outcome.code='00000' and outcome.affected=0)) and security_test.state()=baseline; return next;
      end loop;
    end loop;

    perform security_test.become(b);
    select * into outcome from security_test.attempt(format('update public.%I set user_id=%L where user_id=%L',t,a,b));
    perform set_config('role','none',true);
    label := t || ': UPDATE não transfere proprietário nem modifica original';
    passed := outcome.code in ('42501','23514') and security_test.state()=baseline; return next;

    foreach op in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      command := case op when 'SELECT' then format('select * from public.%I',t)
        when 'INSERT' then format('insert into public.%I select * from jsonb_populate_record(null::public.%I,%L::jsonb)',t,t,copied)
        when 'UPDATE' then format('update public.%I set user_id=user_id',t)
        else format('delete from public.%I',t) end;
      perform security_test.become(null,'anon');
      select * into outcome from security_test.attempt(command);
      perform set_config('role','none',true);
      label := t || ': anon ' || op || ' bloqueado e originais intactos';
      passed := outcome.code='42501' and security_test.state()=baseline; return next;
    end loop;

    perform security_test.become(a);
    if t='categories' then mutation := 'name=name || '' editada'''; end if;
    command := format('update public.%I set %s where user_id=%L',t,mutation,a);
    if t='transactions' then command := command || ' and installment_plan_id is null'; end if;
    select * into outcome from security_test.attempt(command);
    label := t || ': UPDATE próprio respeita operações permitidas';
    passed := case when t='installment_requests' then outcome.code='42501' else outcome.code='00000' and outcome.affected>0 end; return next;
    perform set_config('role','none',true);
  end loop;

  baseline := security_test.state();
  cases := array[
    format('insert into public.transactions(category_id,type,amount,date,expense_kind) values(%L,''expense'',1,''2025-01-01'',''variable'')',cat_a),
    format('insert into public.recurrences(category_id,type,amount,day_of_month,start_month,effective_month,expense_kind) values(%L,''expense'',1,1,''2025-01-01'',''2025-01-01'',''fixed'')',cat_a),
    format('select public.save_budget(''2025-01-01'',%L,100)',cat_a),
    format('select public.create_installment_plan(gen_random_uuid(),%L,''Forjada'',100,2,''2025-01-01'',''2025-01-01'',null,''variable'')',cat_a),
    format('insert into public.transactions(category_id,type,amount,date,expense_kind,recurrence_id,occurrence_month) values(%L,''expense'',1,''2025-01-01'',''fixed'',%L,''2025-01-01'')',cat_b,rule_a),
    format('insert into public.transactions(category_id,type,amount,date,status,expense_kind,installment_plan_id,installment_number,total_installments,due_date,scheduled_amount_cents) values(%L,''expense'',3333,''2025-01-31'',''planned'',''variable'',%L,1,3,''2025-01-31'',3333)',cat_b,plan_a),
    format('update public.transactions set category_id=%L where user_id=%L and installment_plan_id is null',cat_a,b),
    format('update public.budgets set category_id=%L where user_id=%L',cat_a,b),
    format('update public.recurrences set category_id=%L where user_id=%L',cat_a,b),
    format('update public.installment_plans set category_id=%L where user_id=%L',cat_a,b),
    format('select public.edit_installment_plan(%L,%L,''Forjada'',10000,3,''2025-01-10'',''2025-01-31'',null,''variable'',true)',plan_a,cat_b),
    format('select public.pay_installment(%L,''2025-02-01'',3333)',tx_a),
    format('select public.cancel_installment_plan(%L,true)',plan_a),
    format('select public.delete_installment_plan(%L,true)',plan_a)
  ];
  n := 0;
  foreach command in array cases loop
    n := n+1;
    perform security_test.become(b);
    select * into outcome from security_test.attempt(command);
    perform set_config('role','none',true);
    label := 'Vínculo/RPC alheio #' || n || ' bloqueado com originais intactos';
    passed := outcome.code in ('23503','23514','P1104') and security_test.state()=baseline; return next;
  end loop;
  perform security_test.become(b);
  perform public.finance_installment_rows(plan_a); -- Empty is valid only with the comparison below.
  perform public.generate_occurrences('2025-01-01');
  perform set_config('role','none',true);
  label := 'Geradores invoker não produzem ocorrências ou parcelas de A para B'; passed := security_test.state()=baseline; return next;

  for outcome in select p.oid::regprocedure::text as signature, p.proname, p.pronargs, p.proargtypes from pg_proc p where p.pronamespace='public'::regnamespace and p.prorettype<>'trigger'::regtype loop
    if outcome.proname not in ('initialize_finance','finance_due_date','generate_occurrences','save_budget','save_initial_setup','finance_installment_rows','create_installment_plan','edit_installment_plan','pay_installment','cancel_installment_plan','delete_installment_plan','account_owned_storage_objects') then continue; end if;
    select string_agg('null::'||x::regtype::text,',' order by ord) into values_sql from unnest(outcome.proargtypes::oid[]) with ordinality as args(x,ord);
    command := format('select public.%I(%s)',outcome.proname,coalesce(values_sql,''));
    perform security_test.become(null,'anon');
    select * into copied from (select to_jsonb(r) as x from security_test.attempt(command) r) s;
    perform set_config('role','none',true);
    label := 'anon não executa RPC ' || outcome.proname;
    passed := copied->>'code'='42501' and security_test.state()=baseline; return next;
  end loop;

  -- Own DELETE restrictions are deliberate: archive categories/rules, keep receipts.
  foreach t in array tables loop
    baseline := security_test.state();
    perform security_test.become(b);
    command := format('delete from public.%I where user_id=%L',t,b);
    if t='transactions' then command := command || ' and installment_plan_id is null'; end if;
    select * into outcome from security_test.attempt(command);
    perform set_config('role','none',true);
    label := t || ': DELETE próprio respeita grants e integridade';
    passed := case when t in ('transactions','budgets','installment_plans') then outcome.code='00000' and outcome.affected>0 else outcome.code='42501' and security_test.state()=baseline end; return next;
  end loop;
  -- No fixtures, helper functions or grants survive the surrounding rollback.
end $$;
