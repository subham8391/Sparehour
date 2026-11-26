-- Reminders are set up every minute (docs/product/REMINDERS_AND_AI_SPEC.md §4). The set-up ran every five minutes,
-- so a block made just before its time waited up to five minutes for its reminder (it does get one since
-- 20261126000100). It is idempotent and takes a few milliseconds for the accounts there are; the minute tick that
-- sends what is due is unchanged. When accounts grow, the blocks about to start get their own light pass and this
-- one goes back to five minutes (DECISIONS.md, amendment 2026-11-26).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sparehour_notifications') then
    perform cron.unschedule('sparehour_notifications');
  end if;
  perform cron.schedule('sparehour_notifications', '* * * * *', 'select private.materialise_notifications()');
end $$;
