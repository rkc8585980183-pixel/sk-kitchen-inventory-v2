# SK Kitchen Weekly Inventory Management

Next.js + TypeScript + Tailwind CSS app backed by Supabase (PostgreSQL, Auth, RLS), deployable on Vercel.

## 1. Tech Stack
- Next.js 16 (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres + Auth + Row Level Security)
- xlsx / jsPDF for Excel, CSV, PDF export
- Vercel for hosting

## 2. Supabase Project
This app is wired to project `sk-kitchen-inventory` (ref `hrqdozhauapjbnojihai`).
Schema already includes: `departments`, `profiles`, `roles`, `units`, `items`,
`item_mappings`, `inventory_periods`, `inventory_entries`, `audit_logs`,
plus RLS policies and RPC functions `start_inventory`, `submit_inventory`,
`unlock_inventory`, `dashboard_summary`.

## 3. Environment Variables
Create `.env.local` (see `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://hrqdozhauapjbnojihai.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase dashboard — server only, never NEXT_PUBLIC_>
```

Get the service role key from: Supabase Dashboard → Project Settings → API → `service_role` secret.
**Never** put it in a `NEXT_PUBLIC_*` variable or client code — it bypasses RLS.

## 4. Local Development
```
npm install
npm run dev
```

## 5. Test Credentials (seeded in the database)
All passwords: `SkKitchen@123`

| Role | Email |
|---|---|
| Super Admin | superadmin@skkitchen.test |
| Admin | admin@skkitchen.test |
| Department User (Janakpuri) | janakpuri@skkitchen.test |
| Department User (Sikanderpur) | sikanderpur@skkitchen.test |

Change these passwords before going to production.

## 6. Deploy to Vercel
1. Push this folder to a new GitHub repository.
2. In Vercel: New Project → Import the GitHub repo.
3. Framework preset: Next.js (auto-detected).
4. Add Environment Variables in Vercel project settings (same 3 as `.env.local`).
5. Deploy.
6. Test login with the seeded accounts above.
7. In Supabase Dashboard → Authentication → URL Configuration, add your Vercel deployment URL
   to "Site URL" and "Redirect URLs".

## 7. Testing Checklist
- [ ] Super Admin can log in and see all nav items
- [ ] Admin can log in, cannot see Departments tab
- [ ] Department user can log in, sees only their department's items
- [ ] Department user can fill quantities, save draft, submit → status becomes "submitted" and locks
- [ ] Department user cannot edit after submit
- [ ] Admin/Super Admin can unlock a submitted period → status "unlocked" → department user can edit + resubmit
- [ ] Item Master: add, edit, deactivate an item
- [ ] Item Master: download template, bulk upload Excel, verify created/updated/skipped counts
- [ ] Mapping: map an item to a department, confirm it appears in that department's inventory entry
- [ ] Mapping: unmap an item, confirm it disappears from that department
- [ ] Departments: Super Admin can add/edit/deactivate a department
- [ ] Users: Admin can create a department user only; Super Admin can create any role
- [ ] Users: reset password and activate/deactivate work
- [ ] Reports: filter by department/category/status/date range; export Excel, CSV, PDF
- [ ] Trail: every action above appears with correct date/time/user/role/department
- [ ] RLS: confirm via Supabase SQL editor that a department_user's session cannot select another department's rows
