-- =====================================================================
-- SK Kitchen Inventory - Entry Lock (date window) feature
-- Run this ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- =====================================================================
-- Rules
--   * Super Admin  : no limit, can open any date.
--   * Admin        : profiles.back_days (NULL = default_admin_days, -1 = no limit)
--   * Dept user    : departments.back_days (NULL = default_department_days, -1 = no limit)
--   * back_days = N means: entries whose week ended within the last N days can be opened.
--       0 = only the current week, 7 = current + previous week, 30 = about a month.
-- =====================================================================

-- 1. Global settings (single row)
create table if not exists public.lock_settings (
  id                      int primary key default 1 check (id = 1),
  enabled                 boolean not null default true,
  default_department_days int not null default 7  check (default_department_days >= 0),
  default_admin_days      int not null default 30 check (default_admin_days >= 0),
  updated_at              timestamptz not null default now(),
  updated_by              uuid
);
insert into public.lock_settings (id) values (1) on conflict (id) do nothing;

alter table public.lock_settings enable row level security;
drop policy if exists lock_settings_read on public.lock_settings;
create policy lock_settings_read on public.lock_settings
  for select to authenticated using (true);
-- No write policy on purpose: only the server (service role) updates it.

-- 2. Per-department and per-admin overrides
alter table public.departments add column if not exists back_days int
  check (back_days is null or back_days >= -1);
alter table public.profiles add column if not exists back_days int
  check (back_days is null or back_days >= -1);

-- 3. Resolve the window for a user. NULL result = no limit.
create or replace function public.entry_window_days(p_user uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_role text; v_dept uuid; v_user_days int; v_dept_days int;
begin
  select * into s from public.lock_settings where id = 1;
  if not found or not s.enabled then return null; end if;

  select role, department_id, back_days
    into v_role, v_dept, v_user_days
    from public.profiles where id = p_user;

  if not found then return 0; end if;               -- unknown user: most restrictive
  if v_role = 'super_admin' then return null; end if;

  if v_role = 'admin' then
    if v_user_days = -1 then return null; end if;
    return coalesce(v_user_days, s.default_admin_days);
  end if;

  select back_days into v_dept_days from public.departments where id = v_dept;
  if v_dept_days = -1 then return null; end if;
  return coalesce(v_dept_days, s.default_department_days);
end $$;

-- 4. What the app calls for the signed-in user
create or replace function public.my_entry_window()
returns int
language sql stable security definer set search_path = public as $$
  select public.entry_window_days(auth.uid());
$$;

revoke all on function public.entry_window_days(uuid) from public, anon, authenticated;
revoke all on function public.my_entry_window() from public, anon;
grant execute on function public.my_entry_window() to authenticated;

-- 5. Hard enforcement: block writes to entries older than the allowed window.
--    (Service role / SQL editor have no auth.uid(), so they are never blocked.)
create or replace function public.enforce_entry_window()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_days int; v_end date; v_period uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then v_period := old.period_id; else v_period := new.period_id; end if;

  v_days := public.entry_window_days(auth.uid());
  if v_days is not null then
    select week_end into v_end from public.inventory_periods where id = v_period;
    if v_end is not null and v_end < ((now() at time zone 'Asia/Kolkata')::date - v_days) then
      raise exception 'ENTRY_LOCKED: entries older than % days are locked. Contact Super Admin.', v_days
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_entry_window on public.inventory_entries;
create trigger trg_entry_window
  before insert or update or delete on public.inventory_entries
  for each row execute function public.enforce_entry_window();
