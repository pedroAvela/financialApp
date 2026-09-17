-- Local only: fixtures and test helpers are always rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir fixtures/security-cases.inc
select ok(passed, label) from security_test.run();
select * from finish();
rollback;
