-- 0003: 그룹 전체를 한 번에(일관되게) 읽는 RPC
-- 이유: 테이블 7개를 따로 읽으면 그룹장이 쓰는 중간 상태가 섞일 수 있다. 한 문장 안의 읽기는 같은 스냅샷을 본다.
-- security invoker라서 RLS가 그대로 적용된다(소속자가 아니면 null).
-- 적용 순서: 0001_init.sql → 0002_import_keep_ids.sql → 0003_group_snapshot.sql (SQL Editor에서 차례로 Run)

create or replace function public.get_group_snapshot(p_group uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select case
    when exists (select 1 from public.groups where id = p_group) then
      jsonb_build_object(
        'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'emoji', g.emoji, 'schedule', g.schedule, 'config', g.config)
                  from public.groups g where g.id = p_group),
        'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.members m where m.group_id = p_group), '[]'::jsonb),
        'records', coalesce((select jsonb_agg(to_jsonb(r)) from public.records r where r.group_id = p_group), '[]'::jsonb),
        'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.group_id = p_group), '[]'::jsonb),
        'skip_days', coalesce((select jsonb_agg(to_jsonb(s)) from public.skip_days s where s.group_id = p_group), '[]'::jsonb),
        'orders', coalesce((select jsonb_agg(to_jsonb(o)) from public.orders o where o.group_id = p_group), '[]'::jsonb),
        'prices', (select to_jsonb(p) from public.prices p where p.group_id = p_group)
      )
    else null
  end
$$;

revoke all on function public.get_group_snapshot(uuid) from public, anon;
grant execute on function public.get_group_snapshot(uuid) to authenticated;
