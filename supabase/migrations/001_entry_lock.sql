-- =====================================================================
-- SK Kitchen Inventory - Daily entries + Entry Lock (days) + Entry time (open/close)
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
--   * Entry time (optional): department users can open/edit/submit only between the
--     opening and closing time (India time). Admin and Super Admin are not affected.
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

alter table public.lock_settings add column if not exists time_lock_enabled boolean not null default false;
alter table public.lock_settings add column if not exists entry_open_time  time not null default '00:00';
alter table public.lock_settings add column if not exists entry_close_time time not null default '23:59';

-- Closing schedule (set by the Admin on the Settings page; departments only read it)
alter table public.lock_settings add column if not exists closing_mode text not null default 'off';
alter table public.lock_settings add column if not exists closing_time time not null default '23:00';
alter table public.lock_settings add column if not exists closing_weekday int not null default 0;
alter table public.lock_settings add column if not exists closing_month_rule text not null default 'month_end';
alter table public.lock_settings add column if not exists closing_month_day int not null default 1;
alter table public.lock_settings drop constraint if exists lock_settings_closing_chk;
alter table public.lock_settings add constraint lock_settings_closing_chk check (
  closing_mode in ('off', 'daily', 'weekly', 'monthly')
  and closing_weekday between 0 and 6
  and closing_month_rule in ('month_end', 'day')
  and closing_month_day between 1 and 31
);

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
-- Admin access list (NULL = full access). Managed on the Permissions page.
alter table public.profiles add column if not exists permissions text[];

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

-- 3b. Does this user hold a permission? (Super Admin: always. Admin: NULL list = all.)
create or replace function public.has_perm(p_user uuid, p_perm text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_perms text[];
begin
  select role, permissions into v_role, v_perms from public.profiles where id = p_user and is_active;
  if not found then return false; end if;
  if v_role = 'super_admin' then return true; end if;
  if v_role = 'admin' then return v_perms is null or p_perm = any(v_perms); end if;
  return false;
end $$;

-- 4. What the app calls for the signed-in user
create or replace function public.my_entry_window()
returns int
language sql stable security definer set search_path = public as $$
  select public.entry_window_days(auth.uid());
$$;

-- 4b. Entry time window (department users only, India time)
create or replace function public.entry_time_state(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_role text;
  v_now  time := (now() at time zone 'Asia/Kolkata')::time;
  v_open boolean;
begin
  select * into s from public.lock_settings where id = 1;
  if not found or not s.time_lock_enabled then
    return jsonb_build_object('applies', false, 'is_open', true);
  end if;

  select role into v_role from public.profiles where id = p_user;
  if not found or v_role is distinct from 'department_user' then
    return jsonb_build_object('applies', false, 'is_open', true);
  end if;

  if s.entry_open_time = s.entry_close_time then
    v_open := true;                                          -- same time = open all day
  elsif s.entry_open_time < s.entry_close_time then
    v_open := v_now >= s.entry_open_time and v_now < s.entry_close_time;
  else                                                       -- overnight, e.g. 20:00 -> 04:00
    v_open := v_now >= s.entry_open_time or v_now < s.entry_close_time;
  end if;

  return jsonb_build_object(
    'applies', true,
    'is_open', v_open,
    'open_time', to_char(s.entry_open_time, 'HH24:MI'),
    'close_time', to_char(s.entry_close_time, 'HH24:MI')
  );
end $$;

create or replace function public.my_entry_time()
returns jsonb
language sql stable security definer set search_path = public as $$
  select public.entry_time_state(auth.uid());
$$;

create or replace function public.assert_entry_time_open(p_user uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
declare st jsonb := public.entry_time_state(p_user);
begin
  if (st->>'applies')::boolean and not (st->>'is_open')::boolean then
    raise exception 'ENTRY_CLOSED: entry is open only from % to % (India time).', st->>'open_time', st->>'close_time'
      using errcode = 'P0001';
  end if;
end $$;

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

  perform public.assert_entry_time_open(v_uid);

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

  perform public.assert_entry_time_open(v_uid);

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

-- 5c. Admin / Super Admin: change item quantities of ANY department for a date (even if submitted).
--     p_rows = [{"item_id": "...", "quantity": 12.5}, {"item_id": "...", "quantity": null}]  (null = remove)
--     Admin follows their own day limit; Super Admin has none.
create or replace function public.admin_save_entries(p_department_id uuid, p_date date, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text; v_days int; v_n int := 0; v_item uuid; v_q numeric; r jsonb;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_period public.inventory_periods;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select role into v_role from public.profiles where id = v_uid and is_active;
  if not found or v_role not in ('admin', 'super_admin') then
    raise exception 'Only Admin or Super Admin can edit closing data';
  end if;
  if not public.has_perm(v_uid, 'closing_edit') then
    raise exception 'PERMISSION_DENIED: you do not have permission to edit closing data.' using errcode = 'P0001';
  end if;

  if p_date > v_today then
    raise exception 'ENTRY_LOCKED: future dates cannot be edited.' using errcode = 'P0001';
  end if;
  v_days := public.entry_window_days(v_uid);
  if v_days is not null and p_date < v_today - (v_days - 1) then
    raise exception 'ENTRY_LOCKED: this date is locked. You can edit the last % day(s) only.', v_days
      using errcode = 'P0001';
  end if;

  select * into v_period from public.start_inventory_day(p_department_id, p_date);

  for r in select jsonb_array_elements(p_rows) loop
    v_item := (r->>'item_id')::uuid;
    if r->>'quantity' is null or r->>'quantity' = '' then
      delete from public.inventory_entries where period_id = v_period.id and item_id = v_item;
    else
      v_q := (r->>'quantity')::numeric;
      if v_q < 0 then raise exception 'Quantity cannot be negative'; end if;
      insert into public.inventory_entries (period_id, item_id, quantity)
      values (v_period.id, v_item, v_q)
      on conflict (period_id, item_id) do update set quantity = excluded.quantity;
    end if;
    v_n := v_n + 1;
  end loop;

  begin   -- audit trail is best effort
    insert into public.audit_logs (username, role, department_name, action, description)
    select p.username, v_role, d.name, 'admin_edit_entries',
           format('Edited %s item quantity(ies) for %s on %s', v_n, d.name, p_date)
      from public.profiles p, public.departments d
     where p.id = v_uid and d.id = p_department_id;
  exception when others then null;
  end;

  return v_n;
end $$;

-- 5d. For the quantity alerts (Admin / Super Admin only): the LAST earlier closing of every
--     department + item that has a quantity on p_date (any gap: a day, a week, a month; up to 1 year back).
create or replace function public.previous_closings(p_date date)
returns table (department_id uuid, item_id uuid, prev_quantity numeric, prev_date date)
language sql stable security definer set search_path = public as $$
  with cur as (
    select cp.department_id as dept, ce.item_id as item
      from public.inventory_periods cp
      join public.inventory_entries ce on ce.period_id = cp.id
     where cp.week_start = p_date and cp.week_end = p_date and ce.quantity is not null
       and public.has_perm(auth.uid(), 'alerts')
  )
  select distinct on (c.dept, c.item)
         c.dept, c.item, e.quantity::numeric, p.week_end::date
    from cur c
    join public.inventory_periods p
      on p.department_id = c.dept and p.week_end < p_date and p.week_end >= p_date - 366
    join public.inventory_entries e
      on e.period_id = p.id and e.item_id = c.item and e.quantity is not null
   order by c.dept, c.item, p.week_end desc;
$$;

revoke all on function public.entry_window_days(uuid) from public, anon, authenticated;
revoke all on function public.entry_time_state(uuid) from public, anon, authenticated;
revoke all on function public.has_perm(uuid, text) from public, anon, authenticated;
revoke all on function public.assert_entry_time_open(uuid) from public, anon, authenticated;
revoke all on function public.my_entry_time() from public, anon;
grant execute on function public.my_entry_time() to authenticated;
revoke all on function public.my_entry_window() from public, anon;
revoke all on function public.start_inventory_day(uuid, date) from public, anon;
revoke all on function public.clear_inventory_entries(uuid, uuid[]) from public, anon;
revoke all on function public.admin_save_entries(uuid, date, jsonb) from public, anon;
revoke all on function public.previous_closings(date) from public, anon;
grant execute on function public.my_entry_window() to authenticated;
grant execute on function public.start_inventory_day(uuid, date) to authenticated;
grant execute on function public.clear_inventory_entries(uuid, uuid[]) to authenticated;
grant execute on function public.admin_save_entries(uuid, date, jsonb) to authenticated;
grant execute on function public.previous_closings(date) to authenticated;

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

  perform public.assert_entry_time_open(auth.uid());

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

-- 7. Submitting is also only possible inside the entry time (department users).
create or replace function public.enforce_submit_time()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.status = 'submitted' and old.status is distinct from 'submitted' then
      perform public.assert_entry_time_open(auth.uid());
    end if;
    -- reopening a submitted entry needs the "Unlock submitted entries" permission
    if old.status = 'submitted' and new.status = 'unlocked' and not public.has_perm(auth.uid(), 'entries_unlock') then
      raise exception 'PERMISSION_DENIED: you do not have permission to unlock entries.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_submit_time on public.inventory_periods;
create trigger trg_submit_time
  before update on public.inventory_periods
  for each row execute function public.enforce_submit_time();
