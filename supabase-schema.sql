-- ═══════════════════════════════════════════════════════════════
-- ASA NTI — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ── PRODUCTS ────────────────────────────────────────────────────
create table if not exists products (
  id           text primary key,                     -- e.g. 'collectors', 'bundle2'
  name         text not null,
  price        numeric(10,2) not null check (price >= 0),
  category     text not null check (category in ('game','bundle','merch')),
  stock        integer not null default 0 check (stock >= 0),
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Seed the initial product catalogue
insert into products (id, name, price, category, stock, sort_order) values
  ('collectors', 'ASA NTI — Collector''s Edition', 120.00, 'game',   50, 1),
  ('bundle2',    'Two-Box Bundle',                 204.00, 'bundle', 20, 2),
  ('tote',       'Adinkra Tote Bag',                45.00, 'merch',  35, 3),
  ('poster',     'Three Suits Art Poster',          55.00, 'merch',  30, 4),
  ('giftset',    'Premium Gift Set',               195.00, 'bundle', 15, 5)
on conflict (id) do nothing;


-- ── ORDERS ──────────────────────────────────────────────────────
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  ref              text unique not null,              -- e.g. ASANTI-1234567890-ABC123
  paystack_ref     text,                              -- Paystack's own reference
  customer_name    text not null,
  customer_email   text not null,
  customer_phone   text,
  delivery_address text,
  shipping_method  text not null default 'standard',
  shipping_cost    numeric(10,2) not null default 0,
  subtotal         numeric(10,2) not null,
  total            numeric(10,2) not null,
  items            jsonb not null default '[]',       -- [{product_id, name, price, qty}]
  status           text not null default 'pending'
                   check (status in (
                     'pending','paid','processing',
                     'shipped','delivered','cancelled',
                     'refunded','amount_mismatch'
                   )),
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_orders_status      on orders(status);
create index if not exists idx_orders_email       on orders(customer_email);
create index if not exists idx_orders_created_at  on orders(created_at desc);


-- ── STOCK DECREMENT FUNCTION ────────────────────────────────────
-- Called from the webhook after payment is verified.
-- Uses a check to prevent stock going below 0.
create or replace function decrement_stock(p_product_id text, p_qty integer)
returns void
language plpgsql
as $$
begin
  update products
  set
    stock      = greatest(0, stock - p_qty),
    updated_at = now()
  where id = p_product_id;

  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;
end;
$$;


-- ── ROW LEVEL SECURITY ──────────────────────────────────────────
-- Products: public read, no public write (server uses service key)
alter table products enable row level security;

create policy "Public can read active products"
  on products for select
  using (active = true);

-- Orders: no public access — all reads/writes go through server (service key)
alter table orders enable row level security;

-- Service key bypasses RLS automatically, so no extra policy needed for the API.
-- This just ensures no direct public access via anon key.


-- ── UPDATED_AT TRIGGER ──────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_products_updated_at
  before update on products
  for each row execute function update_updated_at();

create trigger set_orders_updated_at
  before update on orders
  for each row execute function update_updated_at();
