-- Read-only checks for migration 20261120100200. Every row must show ok = t.

select 'tables profiles, memberships exist' as check_name,
       (select count(*) from pg_tables
         where schemaname = 'public' and tablename in ('profiles','memberships')) = 2 as ok
union all
select 'row level security is enabled on both',
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in ('profiles','memberships') and c.relrowsecurity) = 2
union all
select 'memberships branch must belong to the same restaurant (composite foreign key)',
       exists (select 1 from pg_constraint where conname = 'memberships_branch_fkey' and contype = 'f')
union all
select 'owner role must be restaurant-wide (check constraint)',
       exists (select 1 from pg_constraint where conname = 'memberships_owner_is_restaurant_wide' and contype = 'c')
union all
select 'one role per user per scope (both partial unique indexes)',
       (select count(*) from pg_indexes
         where schemaname = 'public'
           and indexname in ('memberships_restaurant_wide_unique','memberships_branch_scoped_unique')) = 2
union all
select 'profiles.id references auth.users (foreign key)',
       exists (select 1 from pg_constraint where conname = 'profiles_user_fkey' and contype = 'f');
