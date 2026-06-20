-- Profiles + chat_usage tables for auth, tier gating, and per-user quota tracking.
-- Apply via Supabase SQL editor, `supabase db push`, or the MCP apply_migration tool.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  tier text not null default 'free' check (tier in ('free', 'paid')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists chat_usage_user_recent
  on public.chat_usage (user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Row Level Security.
-- Writes are done by the FastAPI backend via the service-role key, which
-- bypasses RLS. The handle_new_user trigger is `security definer` so it also
-- bypasses RLS. Only SELECT policies are needed, scoped to the user's own row.
alter table public.profiles enable row level security;
alter table public.chat_usage enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists chat_usage_select_self on public.chat_usage;
create policy chat_usage_select_self on public.chat_usage
  for select to authenticated
  using (auth.uid() = user_id);
