alter table public.weekly_plans
  add column if not exists group_id uuid references public.groups(id);

create index if not exists weekly_plans_group_id_updated_at_idx
  on public.weekly_plans (group_id, updated_at desc);
