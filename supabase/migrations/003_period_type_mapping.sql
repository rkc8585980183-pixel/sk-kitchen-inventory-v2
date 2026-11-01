-- =====================================================================
-- SK Kitchen Inventory – Migration 003
-- Period-type item mapping: weekly | monthly | both
-- Safe to run again (idempotent).
-- =====================================================================

-- ── 1. Add period_type column to item_mappings ────────────────────────

alter table public.item_mappings
  add column if not exists period_type text not null default 'both'
  check (period_type in ('weekly','monthly','both'));

-- ── 2. Existing rows → 'both' (already defaulted above, just make sure)

update public.item_mappings
set period_type = 'both'
where period_type is null;

-- ── 3. closing_type_for(week_start, week_end) ────────────────────────
--   Returns 'monthly' or 'weekly' given a period's date range.
--   Logic:
--     a) If lock_settings.closing_mode = 'monthly' → 'monthly'
--     b) Else if week_end is the last calendar day of its month → 'monthly'
--     c) Else → 'weekly'

create or replace function public.closing_type_for(
  p_start date,
  p_end   date
) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_mode   text;
  v_is_eom boolean;
begin
  -- a) check lock_settings closing_mode column (may not exist on older schemas)
  begin
    select closing_mode into v_mode
    from public.lock_settings where id = 1;
  exception when undefined_column then
    v_mode := null;
  end;

  if v_mode = 'monthly' then return 'monthly'; end if;

  -- b) is week_end the last day of its month?
  v_is_eom := (p_end = date_trunc('month', p_end) + interval '1 month' - interval '1 day');

  if v_is_eom then return 'monthly'; end if;

  -- c) default
  return 'weekly';
end $$;

grant execute on function public.closing_type_for(date, date) to authenticated;

-- ── 4. items_for_period(p_department_id, p_period_id) ────────────────
--   Returns item rows the inventory form should show for a given period,
--   filtered by period_type. Replaces the raw item_mappings join in the
--   inventory page so the filter lives in one place.

create or replace function public.items_for_period(
  p_department_id uuid,
  p_period_id     uuid
) returns table (
  item_id   uuid,
  item_code text,
  item_name text,
  category  text,
  unit      text,
  sort_order int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_start date;
  v_end   date;
  v_ctype text;
begin
  select week_start, week_end
  into   v_start, v_end
  from   public.inventory_periods
  where  id = p_period_id;

  v_ctype := public.closing_type_for(v_start, v_end);

  return query
  select
    i.id,
    i.item_code,
    i.item_name,
    i.category,
    i.unit,
    coalesce(im.sort_order, 9999) as sort_order
  from public.item_mappings im
  join public.items i on i.id = im.item_id and i.is_active
  where im.department_id = p_department_id
    and (
      im.period_type = 'both'
      or im.period_type = v_ctype
    )
  order by coalesce(im.sort_order, 9999), i.item_code;
end $$;

grant execute on function public.items_for_period(uuid, uuid) to authenticated;

-- ── 5. Update RLS on item_mappings (carry forward existing policy) ────
--   The existing RLS already allows super_admin / admin full access.
--   We don't change RLS — just ensure period_type is visible.
--   (If your item_mappings has no RLS, this section is a no-op.)

-- ── 6. Mapping summary view (used by mapping page count badges) ───────

create or replace view public.item_mapping_summary as
select
  im.item_id,
  im.department_id,
  im.period_type,
  im.sort_order,
  i.item_code,
  i.item_name,
  d.name as department_name,
  d.code as department_code
from public.item_mappings im
join public.items       i on i.id = im.item_id
join public.departments d on d.id = im.department_id;

grant select on public.item_mapping_summary to authenticated;
