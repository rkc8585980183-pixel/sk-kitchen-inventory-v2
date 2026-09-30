-- =====================================================================
-- SK Kitchen Inventory - Daily entries + Entry Lock (date window)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run again (it also UPDATES an older version of this file).
-- =====================================================================
-- Rules
--   * One inventory entry per department per DATE.
--   * Super Admin  : no limit, can open any date.
--   * Admin        : profiles.back_days   (NULL = default_admin_days, -1 = no limit)
--   * Dept user    : departments.back_days (NULL = default_department_days, -1 = no limit)
--   * back_days = N means the last N days are open, TODAY INCLUDED:
--       0 = fully locked, 1 = today only, 2 = today + yesterday, 7 = last 7 days.
--   * A draft is saved automatically and stays open until Submit is clicked.
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

-- 2b. Entries are per DATE now: remove the old "a period must be 7 days" rules
--     (e.g. week_is_7_days) and keep only "end date is not before start date".
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.inventory_periods'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%week_start%' or pg_get_constraintdef(oid) ilike '%week_end%')
  loop
    execute format('alter table public.inventory_periods drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.inventory_periods add constraint week_dates_ordered check (week_end >= week_start);

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

-- 5. Open (or create) the entry of one department for one date.
create or replace function public.start_inventory_day(p_department_id uuid, p_date date)
returns public.inventory_periods
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text; v_dept uuid; v_days int; v_code text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_row   public.inventory_periods;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select role, department_id into v_role, v_dept
    from public.profiles where id = v_uid and is_active;
  if not found then raise exception 'No active profile for this user'; end if;

  if v_role = 'department_user' and v_dept is distinct from p_department_id then
    raise exception 'You can only open your own department';
  end if;

  if p_date > v_today then
    raise exception 'ENTRY_LOCKED: future dates cannot be opened.' using errcode = 'P0001';
  end if;

  v_days := public.entry_window_days(v_uid);
  if v_days is not null and p_date < v_today - (v_days - 1) then
    raise exception 'ENTRY_LOCKED: this date is locked. You can open the last % day(s) only.', v_days
      using errcode = 'P0001';
  end if;

  select * into v_row from public.inventory_periods
   where department_id = p_department_id and week_start = p_date and week_end = p_date;
  if found then return v_row; end if;

  select code into v_code from public.departments where id = p_department_id;

  insert into public.inventory_periods (department_id, week_start, week_end, status, inv_code, resubmit_count)
  values (p_department_id, p_date, p_date, 'pending',
          'INV-' || coalesce(v_code, 'DEPT') || '-' || to_char(p_date, 'YYMMDD'), 0)
  on conflict do nothing
  returning * into v_row;

  if v_row.id is null then                           -- created at the same moment by someone else
    select * into v_row from public.inventory_periods
     where department_id = p_department_id and week_start = p_date
     order by (week_end = p_date) desc limit 1;
  end if;
  return v_row;
end $$;

-- 5b. Delete saved quantities of an entry (all items, or only the given items).
--     Not allowed once the entry is submitted, or outside the allowed date window.
create or replace function public.clear_inventory_entries(p_period_id uuid, p_item_ids uuid[] default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text; v_dept uuid; v_days int; v_n int;
  v_p public.inventory_periods;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select role, department_id into v_role, v_dept
    from public.profiles where id = v_uid and is_active;
  if not found then raise exception 'No active profile for this user'; end if;

  select * into v_p from public.inventory_periods where id = p_period_id;
  if not found then raise exception 'Entry not found'; end if;

  if v_role = 'department_user' and v_dept is distinct from v_p.department_id then
    raise exception 'You can only change your own department';
  end if;

  if v_p.status = 'submitted' then
    raise exception 'ENTRY_SUBMITTED: this entry is submitted and locked.' using errcode = 'P0001';
  end if;

  v_days := public.entry_window_days(v_uid);
  if v_days is not null and v_p.week_end < ((now() at time zone 'Asia/Kolkata')::date - (v_days - 1)) then
    raise exception 'ENTRY_LOCKED: this date is locked. You can edit the last % day(s) only.', v_days
      using errcode = 'P0001';
  end if;

  delete from public.inventory_entries
   where period_id = p_period_id
     and (p_item_ids is null or item_id = any(p_item_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.entry_window_days(uuid) from public, anon, authenticated;
revoke all on function public.my_entry_window() from public, anon;
revoke all on function public.start_inventory_day(uuid, date) from public, anon;
revoke all on function public.clear_inventory_entries(uuid, uuid[]) from public, anon;
grant execute on function public.my_entry_window() to authenticated;
grant execute on function public.start_inventory_day(uuid, date) to authenticated;
grant execute on function public.clear_inventory_entries(uuid, uuid[]) to authenticated;

-- 6. Hard enforcement: block writes to entries outside the allowed window.
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
    if v_end is not null and v_end < ((now() at time zone 'Asia/Kolkata')::date - (v_days - 1)) then
      raise exception 'ENTRY_LOCKED: this date is locked. You can edit the last % day(s) only.', v_days
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
