-- =====================================================================
-- SK Kitchen Inventory – Migration 002
-- Super-Admin Dashboard · Auto-lock at closing time · Unlock API
-- Safe to run again (idempotent).
-- =====================================================================

-- ── 1. Add "time_locked" status to inventory_periods ─────────────────
--   Represents entries that were automatically locked at closing time
--   before the department submitted them (Locked – Pending).
--   Existing check constraint only allows: pending / submitted / unlocked
--   We add 'time_locked' to that list.

do $$
begin
  -- Drop any existing status check constraint that doesn't include time_locked
  declare c record;
  begin
    for c in
      select conname from pg_constraint
      where conrelid = 'public.inventory_periods'::regclass
        and contype = 'c'
        and conname like '%status%'
        and pg_get_constraintdef(oid) not like '%time_locked%'
    loop
      execute format('alter table public.inventory_periods drop constraint %I', c.conname);
    end loop;
  end;

  -- Add the new constraint only if it doesn't already exist
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_periods'::regclass
      and contype = 'c'
      and conname = 'inv_periods_status_chk'
  ) then
    alter table public.inventory_periods
      add constraint inv_periods_status_chk
      check (status in ('pending','submitted','unlocked','time_locked'));
  end if;
end $$;

-- ── 2. Helper: current India date / time ─────────────────────────────

create or replace function public.ist_now()
returns timestamptz
language sql stable security definer set search_path = public as $$
  select now() at time zone 'Asia/Kolkata';
$$;

create or replace function public.ist_today()
returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

create or replace function public.ist_time_now()
returns time
language sql stable security definer set search_path = public as $$
  select (now() at time zone 'Asia/Kolkata')::time;
$$;

-- ── 3. is_within_entry_window() – IST aware ──────────────────────────
--   Returns TRUE when the current IST time falls inside the configured
--   entry open/close window (or when time_lock_enabled is FALSE).

create or replace function public.is_within_entry_window()
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_now time := public.ist_time_now();
begin
  select * into s from public.lock_settings where id = 1;
  if not found or not s.time_lock_enabled then return true; end if;

  if s.entry_open_time = s.entry_close_time then return true; end if;

  if s.entry_open_time < s.entry_close_time then
    return v_now >= s.entry_open_time and v_now < s.entry_close_time;
  else
    -- overnight window e.g. 20:00 → 04:00
    return v_now >= s.entry_open_time or v_now < s.entry_close_time;
  end if;
end $$;

-- ── 4. auto_lock_expired_entries() ───────────────────────────────────
--   Marks today's 'pending' entries as 'time_locked' once the closing
--   time has passed.  Called by the dashboard query (lazy) and also by
--   the enforcement trigger.  Runs with service role only.

create or replace function public.auto_lock_expired_entries()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  s   record;
begin
  select * into s from public.lock_settings where id = 1;
  -- Only auto-lock when time_lock is enabled and window has closed
  if not found or not s.time_lock_enabled then return 0; end if;
  if public.is_within_entry_window() then return 0; end if;

  -- Lock only today's pending entries (entries from previous days stay as-is)
  update public.inventory_periods
  set status = 'time_locked'
  where status = 'pending'
    and week_start = public.ist_today()
    and week_end   = public.ist_today();

  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Grant to authenticated so the dashboard page can call it
revoke all on function public.auto_lock_expired_entries() from public, anon;
grant execute on function public.auto_lock_expired_entries() to authenticated;

-- ── 5. dashboard_status(p_date) ──────────────────────────────────────
--   Returns one row per active department with its entry status for the
--   given date.  Also returns outlet info (derived from department.code).
--   The function first runs auto_lock_expired_entries() lazily.

create or replace function public.dashboard_status(p_date date default null)
returns table (
  department_id   uuid,
  department_name text,
  department_code text,
  outlet_code     text,   -- first segment of code before '-', e.g. "CC-DL" from "CC-DL-Rohini"
  entry_status    text,   -- pending | submitted | unlocked | time_locked | missed | no_entry
  submitted_at    timestamptz,
  unlocked_at     timestamptz,
  inv_code        text,
  item_count      bigint, -- items mapped to this dept
  filled_count    bigint  -- items with a quantity entered today
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_date date := coalesce(p_date, public.ist_today());
  v_today date := public.ist_today();
begin
  -- lazy auto-lock: flip pending → time_locked when window has closed
  if v_date = v_today then
    perform public.auto_lock_expired_entries();
  end if;

  return query
  select
    d.id                                            as department_id,
    d.name                                          as department_name,
    d.code                                          as department_code,
    -- outlet = first two '-'-separated segments, e.g. "CC-DL" from "CC-DL-Rohini"
    case
      when d.code like '%-%-%' then
        regexp_replace(d.code, '^([^-]+-[^-]+).*$', '\1')
      else d.code
    end                                             as outlet_code,
    coalesce(ip.status, case
      when v_date < v_today then 'missed'
      else 'no_entry'
    end)                                            as entry_status,
    ip.submitted_at,
    ip.unlocked_at,
    ip.inv_code,
    coalesce(mc.cnt, 0)                             as item_count,
    coalesce(ec.cnt, 0)                             as filled_count
  from public.departments d
  left join public.inventory_periods ip
         on ip.department_id = d.id
        and ip.week_start = v_date
        and ip.week_end   = v_date
  left join lateral (
    select count(*) as cnt
    from public.item_mappings im
    join public.items it on it.id = im.item_id and it.is_active
    where im.department_id = d.id
  ) mc on true
  left join lateral (
    select count(*) as cnt
    from public.inventory_entries ie
    where ie.period_id = ip.id and ie.quantity is not null
  ) ec on true
  where d.is_active
  order by d.name;
end $$;

revoke all on function public.dashboard_status(date) from public, anon;
grant execute on function public.dashboard_status(date) to authenticated;

-- ── 6. unlock_period() ───────────────────────────────────────────────
--   Super Admin can manually unlock any time_locked or submitted entry.
--   Existing entries_unlock perm already covers submitted → unlocked.
--   This extends that to time_locked → pending (so dept can fill it).

create or replace function public.unlock_period(p_period_id uuid)
returns public.inventory_periods
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_row  public.inventory_periods;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select role into v_role from public.profiles where id = v_uid and is_active;
  if v_role is distinct from 'super_admin' then
    -- Admins with entries_unlock perm can also unlock
    if not public.has_perm(v_uid, 'entries_unlock') then
      raise exception 'PERMISSION_DENIED: you do not have permission to unlock entries.'
        using errcode = 'P0001';
    end if;
  end if;

  select * into v_row from public.inventory_periods where id = p_period_id;
  if not found then raise exception 'Entry not found'; end if;

  if v_row.status not in ('submitted', 'time_locked', 'unlocked') then
    raise exception 'Only submitted or time-locked entries can be unlocked.';
  end if;

  update public.inventory_periods
  set status      = 'unlocked',
      unlocked_by = v_uid,
      unlocked_at = now()
  where id = p_period_id
  returning * into v_row;

  begin
    insert into public.audit_logs (username, role, department_name, action, description)
    select p.username, v_role, d.name,
           'unlock_entry',
           format('Unlocked entry %s (%s) for %s', v_row.inv_code, p_period_id, d.name)
    from public.profiles p, public.departments d
    where p.id = v_uid and d.id = v_row.department_id;
  exception when others then null;
  end;

  return v_row;
end $$;

revoke all on function public.unlock_period(uuid) from public, anon;
grant execute on function public.unlock_period(uuid) to authenticated;

-- ── 7. Enforce time window at DB level for time_locked entries ────────
--   Department users cannot edit/submit a time_locked entry.

create or replace function public.enforce_submit_time()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    -- Block submit when outside time window
    if new.status = 'submitted' and old.status is distinct from 'submitted' then
      perform public.assert_entry_time_open(auth.uid());
    end if;
    -- Block editing a time_locked entry by dept user
    if old.status = 'time_locked' then
      declare v_role text;
      begin
        select role into v_role from public.profiles where id = auth.uid();
        if v_role = 'department_user' then
          raise exception 'ENTRY_TIME_LOCKED: this entry was automatically locked at closing time.'
            using errcode = 'P0001';
        end if;
      end;
    end if;
    -- Reopening submitted → unlocked needs permission
    if old.status = 'submitted' and new.status = 'unlocked'
       and not public.has_perm(auth.uid(), 'entries_unlock') then
      raise exception 'PERMISSION_DENIED: you do not have permission to unlock entries.'
        using errcode = 'P0001';
    end if;
    -- Only super_admin / has_perm can unlock time_locked
    if old.status = 'time_locked' and new.status in ('unlocked','pending')
       and not public.has_perm(auth.uid(), 'entries_unlock') then
      declare v_role2 text;
      begin
        select role into v_role2 from public.profiles where id = auth.uid();
        if v_role2 is distinct from 'super_admin' then
          raise exception 'PERMISSION_DENIED: only Super Admin can unlock time-locked entries.'
            using errcode = 'P0001';
        end if;
      end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_submit_time on public.inventory_periods;
create trigger trg_submit_time
  before update on public.inventory_periods
  for each row execute function public.enforce_submit_time();

-- ── 8. Enforce entry window also blocks writes on time_locked entries ─

create or replace function public.enforce_entry_window()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_days   int;
  v_end    date;
  v_period uuid;
  v_status text;
  v_role   text;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform public.assert_entry_time_open(auth.uid());

  if tg_op = 'DELETE' then v_period := old.period_id; else v_period := new.period_id; end if;

  select week_end, status into v_end, v_status
    from public.inventory_periods where id = v_period;

  -- Block writes on time_locked entries for department users
  if v_status = 'time_locked' then
    select role into v_role from public.profiles where id = auth.uid();
    if v_role = 'department_user' then
      raise exception 'ENTRY_TIME_LOCKED: this entry was automatically locked at closing time.'
        using errcode = 'P0001';
    end if;
  end if;

  v_days := public.entry_window_days(auth.uid());
  if v_days is not null and v_end is not null
     and v_end < (public.ist_today() - (v_days - 1)) then
    raise exception 'ENTRY_LOCKED: this date is locked. You can edit the last % day(s) only.', v_days
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_entry_window on public.inventory_entries;
create trigger trg_entry_window
  before insert or update or delete on public.inventory_entries
  for each row execute function public.enforce_entry_window();

-- ── 9. Expose is_within_entry_window to authenticated ────────────────
revoke all on function public.is_within_entry_window() from public, anon;
grant execute on function public.is_within_entry_window() to authenticated;
revoke all on function public.ist_now() from public, anon;
revoke all on function public.ist_today() from public, anon;
revoke all on function public.ist_time_now() from public, anon;
grant execute on function public.ist_now() to authenticated;
grant execute on function public.ist_today() to authenticated;
grant execute on function public.ist_time_now() to authenticated;
