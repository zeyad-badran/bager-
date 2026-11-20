-- Read-only checks for migration 20261120100400. Every row must show ok = t.

select 'table audit_logs exists with row level security on' as check_name,
       (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'audit_logs') is true as ok
union all
select 'append-only guard trigger is attached to audit_logs',
       exists (select 1 from pg_trigger where tgname = 'audit_logs_prevent_update_delete' and not tgisinternal)
union all
select 'audit triggers attached to restaurants, branches, branch_settings, memberships',
       (select count(*) from pg_trigger
         where tgname in ('restaurants_audit','branches_audit','branch_settings_audit','memberships_audit')
           and not tgisinternal) = 4
union all
select 'audit trigger function is SECURITY DEFINER with a pinned search_path',
       exists (select 1 from pg_proc
                where oid = to_regprocedure('private.audit_row_change()')
                  and prosecdef
                  and proconfig @> array['search_path=""'])
union all
select 'history index (restaurant_id, occurred_at desc) exists',
       exists (select 1 from pg_indexes where indexname = 'audit_logs_restaurant_occurred_idx');
