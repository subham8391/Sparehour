-- The table guards (20260916000100 and later) are not security definer, so they run as the writer and ask
-- private.is_app_user() — and the settings guard private.is_valid_timezone() — which only `authenticated` could
-- execute. The service role writes those tables too (the calendar worker updates `calendars`; routes touch tasks,
-- blocks and settings), and was refused: "permission denied for function is_app_user" on the first real Google
-- sync. Both helpers only read their argument or current_user, so the service role may ask them; the guards then
-- let it through as they always meant to (it is not an app user).
grant execute on function private.is_app_user() to service_role;
grant execute on function private.is_valid_timezone(text) to service_role;
