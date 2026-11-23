-- Read-only checks for migration 20261123100300. Every row must show ok = t.

-- The allowed-transition table must be exactly blueprint section 5.1, checked over all 25 pairs.
with expected(from_status, to_status) as (
  values ('new', 'preparing'), ('new', 'cancelled'), ('preparing', 'ready'),
         ('preparing', 'cancelled'), ('ready', 'collected')
),
pairs as (
  select f.s as from_status, t.s as to_status
    from unnest(enum_range(null::public.order_status)) as f(s)
   cross join unnest(enum_range(null::public.order_status)) as t(s)
)
select 'transition table matches blueprint section 5.1 for every from/to pair' as check_name,
       bool_and(private.is_order_transition_allowed(p.from_status, p.to_status)
                = exists (select 1 from expected e
                           where e.from_status = p.from_status::text
                             and e.to_status = p.to_status::text)) as ok
  from pairs p
union all
select 'create_manual_order and transition_order are SECURITY DEFINER with a pinned search_path',
       (select count(*) from pg_proc
         where oid in (to_regprocedure('public.create_manual_order(uuid, text)'),
                       to_regprocedure('public.transition_order(uuid, integer, public.order_status)'))
           and prosecdef and proconfig @> array['search_path=""']) = 2
union all
select 'signed-in users can call both functions; anonymous visitors cannot',
       has_function_privilege('authenticated', 'public.create_manual_order(uuid, text)', 'execute')
       and has_function_privilege('authenticated', 'public.transition_order(uuid, integer, public.order_status)', 'execute')
       and not has_function_privilege('anon', 'public.create_manual_order(uuid, text)', 'execute')
       and not has_function_privilege('anon', 'public.transition_order(uuid, integer, public.order_status)', 'execute')
union all
select 'the transition table helper is not callable through the API',
       not has_function_privilege('authenticated',
             'private.is_order_transition_allowed(public.order_status, public.order_status)', 'execute')
       and not has_function_privilege('anon',
             'private.is_order_transition_allowed(public.order_status, public.order_status)', 'execute');
