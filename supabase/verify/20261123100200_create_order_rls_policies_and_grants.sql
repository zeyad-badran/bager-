-- Read-only checks for migration 20261123100200. Every row must show ok = t.

select 'orders has exactly one policy: orders_member_select, SELECT for signed-in users' as check_name,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'orders') = 1
       and exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = 'orders'
                      and policyname = 'orders_member_select'
                      and cmd = 'SELECT' and roles = array['authenticated']::name[]) as ok
union all
select 'signed-in users may read orders but never insert, update or delete them (no status/version back door)',
       has_table_privilege('authenticated', 'public.orders', 'select')
       and not has_table_privilege('authenticated', 'public.orders', 'insert')
       and not has_table_privilege('authenticated', 'public.orders', 'update')
       and not has_table_privilege('authenticated', 'public.orders', 'delete')
union all
select 'anonymous visitors have no privilege on orders or outbox_events',
       not has_table_privilege('anon', 'public.orders', 'select,insert,update,delete')
       and not has_table_privilege('anon', 'public.outbox_events', 'select,insert,update,delete')
union all
select 'signed-in users have no privilege on outbox_events and it has no policy',
       not has_table_privilege('authenticated', 'public.outbox_events', 'select,insert,update,delete')
       and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'outbox_events') = 0;
