
-- 1. Role enum
create type public.app_role as enum ('admin', 'member');

-- 2. User roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- 3. Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar_url text,
  total_points integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- 4. Members table (extends profiles with PIN)
create table public.members (
  id uuid primary key references public.profiles(id) on delete cascade,
  pin_code text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.members enable row level security;

-- 5. Tasks table
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  points integer not null default 10,
  deadline timestamptz not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'pending',
  completed_at timestamptz,
  failure_reason text,
  points_awarded integer default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.tasks enable row level security;

-- 6. Notifications table
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;

-- 7. has_role security definer function
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- 8. Auto-create profile trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 9. RLS Policies

-- user_roles
create policy "Users can view own roles" on public.user_roles for select using (user_id = auth.uid());
create policy "Admins can insert roles" on public.user_roles for insert with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can update roles" on public.user_roles for update using (public.has_role(auth.uid(), 'admin'));
create policy "Admins can delete roles" on public.user_roles for delete using (public.has_role(auth.uid(), 'admin'));

-- profiles
create policy "Authenticated can view profiles" on public.profiles for select to authenticated using (true);
create policy "Users can update own profile" on public.profiles for update using (id = auth.uid());
create policy "Admins can insert profiles" on public.profiles for insert with check (public.has_role(auth.uid(), 'admin') or id = auth.uid());
create policy "Admins can delete profiles" on public.profiles for delete using (public.has_role(auth.uid(), 'admin'));

-- members
create policy "Admins can view all members" on public.members for select using (public.has_role(auth.uid(), 'admin'));
create policy "Members can view own record" on public.members for select using (id = auth.uid());
create policy "Admins can insert members" on public.members for insert with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can update members" on public.members for update using (public.has_role(auth.uid(), 'admin'));
create policy "Admins can delete members" on public.members for delete using (public.has_role(auth.uid(), 'admin'));

-- tasks
create policy "Admins can manage tasks" on public.tasks for all using (public.has_role(auth.uid(), 'admin'));
create policy "Members can view assigned tasks" on public.tasks for select using (assigned_to = auth.uid());
create policy "Members can update assigned tasks" on public.tasks for update using (assigned_to = auth.uid());

-- notifications
create policy "Users can view own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "Users can update own notifications" on public.notifications for update using (user_id = auth.uid());
create policy "System can create notifications" on public.notifications for insert with check (public.has_role(auth.uid(), 'admin') or user_id = auth.uid());

-- 10. Enable realtime
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.notifications;
