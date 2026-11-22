-- Reminders on the phone app (docs/mobile/ANDROID_APP_SPEC.md §6). The browser
-- subscribes with web push and writes its own push_subscriptions row under RLS;
-- the phone app gets a token from Expo's push service (which reaches Android
-- through Firebase) and hands it to the app's server, which keeps it here. The
-- same minute tick sends to both (src/app/api/push/tick/route.ts), and a
-- delivery's answer moves a token exactly as it moves a subscription.

create table public.app_push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  token           text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  platform        text not null default 'android' check (platform in ('android', 'ios')),
  failure_count   smallint not null default 0,
  last_success_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index app_push_tokens_user_idx on public.app_push_tokens(user_id) where deleted_at is null;

-- Written by the app's server only (it checks the caller's sign-in token first): no policy, no grant to a person.
alter table public.app_push_tokens enable row level security;
revoke all on public.app_push_tokens from public, anon, authenticated;
grant all on public.app_push_tokens to service_role;

-- As with browsers: at most twenty live devices for one account.
create or replace function private.app_push_tokens_guard() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is null
     and (tg_op = 'INSERT' or old.deleted_at is not null or old.user_id <> new.user_id)
     and (select count(*) from public.app_push_tokens p where p.user_id = new.user_id and p.deleted_at is null and p.id <> new.id) >= 20 then
    raise exception 'too many push tokens for one account' using errcode = 'program_limit_exceeded';
  end if;
  return new;
end $$;
drop trigger if exists app_push_tokens_guard on public.app_push_tokens;
create trigger app_push_tokens_guard before insert or update on public.app_push_tokens
  for each row execute function private.app_push_tokens_guard();

-- ---------------------------------------------------------------- a delivery's answer moves a phone token too
-- p_subscription is the id of a push_subscriptions row or of an app_push_tokens row (both are random uuids).
create or replace function private.record_notification_delivery(p_notification uuid, p_subscription uuid, p_status int, p_error text) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  insert into private.notification_deliveries (notification_id, subscription_id, http_status, error) values (p_notification, p_subscription, p_status, p_error);
  if p_status in (404, 410) then
    update public.push_subscriptions set deleted_at = now(), updated_at = now() where id = p_subscription and deleted_at is null;
    update public.app_push_tokens set deleted_at = now(), updated_at = now() where id = p_subscription and deleted_at is null;
  elsif p_status between 200 and 299 then
    update public.push_subscriptions set failure_count = 0, last_success_at = now(), updated_at = now() where id = p_subscription;
    update public.app_push_tokens set failure_count = 0, last_success_at = now(), updated_at = now() where id = p_subscription;
  else
    update public.push_subscriptions set failure_count = failure_count + 1, updated_at = now() where id = p_subscription;
    update public.app_push_tokens set failure_count = least(failure_count + 1, 32767), updated_at = now() where id = p_subscription;
  end if;
end $$;
revoke all on function private.record_notification_delivery(uuid, uuid, int, text) from public;

-- ---------------------------------------------------------------- nothing reaches a phone while the account waits to be deleted
create or replace function private.account_delete_request(p_user uuid) returns timestamptz
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  asked timestamptz;
begin
  update public.users set deleted_at = coalesce(deleted_at, now()) where id = p_user returning deleted_at into asked;
  if asked is null then
    return null;
  end if;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('deletion_requested_at', asked, 'delete_after', asked + interval '30 days')
   where id = p_user;
  -- Nothing reaches the person's devices while the account waits: no subscriptions, no queued reminders.
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.app_push_tokens where user_id = p_user;
  delete from private.scheduled_notifications where user_id = p_user and status = 'pending';
  return asked + interval '30 days';
end $$;
