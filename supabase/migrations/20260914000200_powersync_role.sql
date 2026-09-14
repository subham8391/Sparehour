-- The replication role PowerSync connects with. The password here is for the
-- local stack only; production runs `alter role powersync_role password '…'`
-- out of band (never in a migration).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'powersync_role') then
    create role powersync_role with replication bypassrls login password 'powersync_local';
  end if;
end $$;
grant usage on schema public to powersync_role;
grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;
