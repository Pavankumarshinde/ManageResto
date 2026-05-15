-- ============================================================
-- ManageResto – Supabase PostgreSQL Schema v2
-- ============================================================

-- Drop everything cleanly first (handles partial / mis-typed tables from previous runs)
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.menu_items cascade;
drop table if exists public.categories cascade;
drop table if exists public.waiters cascade;
drop table if exists public.resto_states cascade;
drop table if exists public.password_reset_otps cascade;
drop table if exists public.profiles cascade;
drop function if exists public.handle_updated_at() cascade;

-- 1. PROFILES
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  restaurant_name text not null,
  mobile text unique not null,
  location text,
  gst_number text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Service role full access profiles" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_service" on public.profiles;
create policy "profiles_select" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- 2. CATEGORIES
create table if not exists public.categories (
  id bigserial primary key,
  name text not null,
  user_id uuid references auth.users(id) on delete cascade not null
);
alter table public.categories enable row level security;
drop policy if exists "categories_own" on public.categories;
drop policy if exists "Service role full access categories" on public.categories;
create policy "categories_own" on public.categories for all using (auth.uid() = user_id);

-- 3. MENU ITEMS
create table if not exists public.menu_items (
  id bigserial primary key,
  frontend_id int not null default 0,
  name text not null,
  price numeric(10,2) not null,
  type text check (type in ('Veg', 'Non-Veg')) default 'Veg',
  image text,
  category_id bigint references public.categories(id) on delete set null,
  available boolean default true,
  user_id uuid references auth.users(id) on delete cascade not null,
  unique (user_id, frontend_id)
);
alter table public.menu_items enable row level security;
drop policy if exists "menu_own" on public.menu_items;
drop policy if exists "Service role full access menu" on public.menu_items;
create policy "menu_own" on public.menu_items for all using (auth.uid() = user_id);

-- 4. WAITERS
create table if not exists public.waiters (
  id bigserial primary key,
  name text not null,
  user_id uuid references auth.users(id) on delete cascade not null
);
alter table public.waiters enable row level security;
drop policy if exists "waiters_own" on public.waiters;
drop policy if exists "Service role full access waiters" on public.waiters;
create policy "waiters_own" on public.waiters for all using (auth.uid() = user_id);

-- 5. ORDERS
create table if not exists public.orders (
  id bigserial primary key,
  frontend_id int not null default 0,
  table_number text,
  waiter_name text,
  paid boolean default false,
  total_amount numeric(10,2) default 0,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (user_id, frontend_id)
);
alter table public.orders enable row level security;
drop policy if exists "orders_own" on public.orders;
drop policy if exists "Service role full access orders" on public.orders;
create policy "orders_own" on public.orders for all using (auth.uid() = user_id);

-- 6. ORDER ITEMS
create table if not exists public.order_items (
  id bigserial primary key,
  order_id bigint references public.orders(id) on delete cascade not null,
  menu_item_id bigint references public.menu_items(id) on delete set null,
  qty int default 1,
  status text check (status in ('Preparing', 'Prepared', 'Served')) default 'Preparing',
  price_at_time numeric(10,2),
  note text
);
alter table public.order_items enable row level security;
drop policy if exists "order_items_service" on public.order_items;
drop policy if exists "Service role full access order_items" on public.order_items;
-- order_items accessed only by service role (Edge Functions) — no user policy needed

-- 7. PASSWORD RESET OTPs
create table if not exists public.password_reset_otps (
  id bigserial primary key,
  identifier text unique not null,
  otp text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
alter table public.password_reset_otps enable row level security;
drop policy if exists "otps_service" on public.password_reset_otps;
drop policy if exists "Service role full access otps" on public.password_reset_otps;
-- accessed only by service role (Edge Functions)

-- 8. RESTO STATES (Realtime enabled)
create table if not exists public.resto_states (
  id bigserial primary key,
  user_id uuid unique references auth.users(id) on delete cascade not null,
  menu jsonb default '[]'::jsonb,
  orders jsonb default '[]'::jsonb,
  waiters jsonb default '[]'::jsonb,
  categories jsonb default '[]'::jsonb,
  next_order_id int default 1,
  next_menu_id int default 100,
  updated_at timestamptz default now()
);
alter table public.resto_states enable row level security;
drop policy if exists "states_select" on public.resto_states;
drop policy if exists "states_update" on public.resto_states;
drop policy if exists "Users can view own state" on public.resto_states;
drop policy if exists "Users can update own state" on public.resto_states;
drop policy if exists "Service role full access states" on public.resto_states;
-- Realtime subscriptions use the anon key + user JWT for filtering
create policy "states_select" on public.resto_states for select using (auth.uid() = user_id);
create policy "states_update" on public.resto_states for update using (auth.uid() = user_id);

-- 9. REALTIME
alter publication supabase_realtime add table public.resto_states;

-- 10. AUTO-UPDATE TRIGGER
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_profiles on public.profiles;
drop trigger if exists set_updated_at_resto_states on public.resto_states;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger set_updated_at_resto_states
  before update on public.resto_states
  for each row execute procedure public.handle_updated_at();
