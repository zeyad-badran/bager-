-- Read-only checks for migration 20261124100000. Every row must show ok = t.

select 'orders has exactly one audit trigger, orders_audit, using private.audit_order_change()' as check_name,
       (select count(*) from pg_trigger t
         where t.tgrelid = 'public.orders'::regclass and not t.tgisinternal
           and t.tgfoid in ('private.audit_row_change()'::regprocedure,
                            'private.audit_order_change()'::regprocedure)) = 1
       and exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.orders'::regclass and t.tgname = 'orders_audit'
                      and t.tgfoid = 'private.audit_order_change()'::regprocedure) as ok
union all
select 'private.audit_order_change() is SECURITY DEFINER with a pinned search_path and records the four status keys',
       exists (select 1 from pg_proc
                where oid = 'private.audit_order_change()'::regprocedure
                  and prosecdef and proconfig @> array['search_path=""']
                  and prosrc like '%from_status%' and prosrc like '%to_status%'
                  and prosrc like '%version_from%' and prosrc like '%version_to%')
union all
select 'tenancy tables still use the unchanged generic trigger private.audit_row_change()',
       (select count(*) from pg_trigger t
         where not t.tgisinternal
           and t.tgfoid = 'private.audit_row_change()'::regprocedure
           and t.tgrelid in ('public.restaurants'::regclass, 'public.branches'::regclass,
                             'public.branch_settings'::regclass, 'public.memberships'::regclass)) = 4
union all
select 'the generic audit function does not know about order statuses (tenancy audit shape unchanged)',
       (select prosrc not like '%from_status%' from pg_proc
         where oid = 'private.audit_row_change()'::regprocedure);
