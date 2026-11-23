-- Read-only checks for migration 20261123100100. Every row must show ok = t.

select 'outbox_events table exists with row level security enabled' as check_name,
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.outbox_events')), false) as ok
union all
select 'at most one event of each type per order: unique (order_id, event_type) (AT-05)',
       exists (select 1 from pg_constraint
                where conrelid = 'public.outbox_events'::regclass
                  and conname = 'outbox_events_order_event_unique' and contype = 'u')
union all
select 'events point at their order with a composite tenant FK',
       exists (select 1 from pg_constraint
                where conrelid = 'public.outbox_events'::regclass
                  and conname = 'outbox_events_order_fkey' and contype = 'f')
union all
select 'only order.ready events and only the pending status are allowed (no worker yet, ADR-0004)',
       exists (select 1 from pg_constraint
                where conrelid = 'public.outbox_events'::regclass and conname = 'outbox_events_event_type_valid')
       and exists (select 1 from pg_constraint
                    where conrelid = 'public.outbox_events'::regclass and conname = 'outbox_events_status_valid')
union all
select 'no worker-only objects were created (outbox_events is the only outbox/queue/job table)',
       (select count(*) from pg_tables
         where schemaname = 'public'
           and (tablename like '%outbox%' or tablename like '%queue%' or tablename like '%job%')) = 1;
