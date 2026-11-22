-- 0004: 그룹장의 쓰기를 한 번의 호출(트랜잭션)로 적용하는 RPC + 충돌 감지용 변경 번호(rev)
-- 적용 순서: 0001_init.sql → 0002_import_keep_ids.sql → 0003_group_snapshot.sql → 0004_apply_group_ops.sql
--
-- 설계
--  * 앱은 변경 전/후 그룹을 비교한 작업 목록(ops)을 보낸다(src/logic/remote-map.ts 의 diffGroups).
--  * 작업은 모두 한 트랜잭션: 하나라도 실패하면 전부 되돌아간다.
--  * rev: 그룹장이 폰 2대에서 쓰는 경우 서로 덮어쓰지 않게 한다. 기준 rev가 다르면 아무것도 적용하지 않고 'conflict'를 돌려준다.
--  * security invoker: RLS가 그대로 적용된다(그룹장만 쓰기). 그래도 명시적으로 그룹장인지 먼저 확인한다.
--  * 행의 group_id는 항상 대상 그룹으로 강제한다(다른 그룹 id를 넣어도 대상 그룹에만 쓰인다).
--  * 상한이 있는 테이블은 "먼저 update, 없으면 insert"로 쓴다(상한 트리거가 upsert의 갱신까지 막지 않도록).

alter table public.groups add column if not exists rev bigint not null default 0;

-- 스냅샷에 rev를 포함한다 (0003의 함수를 교체. 기존 키는 그대로)
create or replace function public.get_group_snapshot(p_group uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select case
    when exists (select 1 from public.groups where id = p_group) then
      jsonb_build_object(
        'rev', (select g.rev from public.groups g where g.id = p_group),
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

-- ops: [
--   {"kind":"group","patch":{"name":..,"emoji":..,"schedule":..,"config":..}},
--   {"kind":"upsert","table":"members|records|absences|skip_days|orders|prices","row":{...}},
--   {"kind":"delete","table":"members|records|absences|skip_days|orders|prices","key":"<id 또는 date>"}
-- ]
-- 결과: {"status":"ok","rev":N} 또는 {"status":"conflict","rev":N}
create or replace function public.apply_group_ops(p_group uuid, p_base_rev bigint, p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  new_rev bigint;
  op jsonb;
  r jsonb;
  t text;
  k text;
begin
  -- (require_user는 호출자에게 실행 권한이 없는 내부 함수라 여기서는 직접 확인한다)
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_owner(p_group) then
    raise exception 'forbidden';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'bad_ops';
  end if;
  if jsonb_array_length(p_ops) > 500 then
    raise exception 'too_many_ops';
  end if;

  -- 기준 rev가 같을 때만 진행한다 (그룹 행을 잠그므로 동시에 들어온 쓰기는 한 건씩 처리된다)
  update public.groups set rev = rev + 1 where id = p_group and rev = p_base_rev returning rev into new_rev;
  if new_rev is null then
    return jsonb_build_object('status', 'conflict', 'rev', (select g.rev from public.groups g where g.id = p_group));
  end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    case op->>'kind'
      when 'group' then
        update public.groups g set
          name = coalesce(op #>> '{patch,name}', g.name),
          emoji = coalesce(op #>> '{patch,emoji}', g.emoji),
          schedule = coalesce(op #> '{patch,schedule}', g.schedule),
          config = coalesce(op #> '{patch,config}', g.config)
        where g.id = p_group;

      when 'upsert' then
        t := op->>'table';
        r := coalesce(op->'row', '{}'::jsonb) || jsonb_build_object('group_id', p_group);
        case t
          when 'members' then
            update public.members m set name = x.name, sort = coalesce(x.sort, 0), color = x.color, emoji = x.emoji, payload = coalesce(x.payload, '{}')
              from jsonb_populate_record(null::public.members, r) x
              where m.id = x.id and m.group_id = p_group;
            if not found then
              insert into public.members (id, group_id, name, sort, color, emoji, payload)
              select x.id, x.group_id, x.name, coalesce(x.sort, 0), x.color, x.emoji, coalesce(x.payload, '{}')
              from jsonb_populate_record(null::public.members, r) x;
            end if;
          when 'records' then
            update public.records c set member_id = x.member_id, memo = x.memo, payload = coalesce(x.payload, '{}')
              from jsonb_populate_record(null::public.records, r) x
              where c.group_id = p_group and c.date = x.date;
            if not found then
              insert into public.records (group_id, date, member_id, memo, payload)
              select x.group_id, x.date, x.member_id, x.memo, coalesce(x.payload, '{}')
              from jsonb_populate_record(null::public.records, r) x;
            end if;
          when 'absences' then
            update public.absences a set member_id = x.member_id, from_date = x.from_date, to_date = x.to_date, payload = coalesce(x.payload, '{}')
              from jsonb_populate_record(null::public.absences, r) x
              where a.id = x.id and a.group_id = p_group;
            if not found then
              insert into public.absences (id, group_id, member_id, from_date, to_date, payload)
              select x.id, x.group_id, x.member_id, x.from_date, x.to_date, coalesce(x.payload, '{}')
              from jsonb_populate_record(null::public.absences, r) x;
            end if;
          when 'skip_days' then
            insert into public.skip_days (group_id, date)
            select x.group_id, x.date from jsonb_populate_record(null::public.skip_days, r) x
            on conflict (group_id, date) do nothing;
          when 'orders' then
            update public.orders o set payload = coalesce(x.payload, '{}')
              from jsonb_populate_record(null::public.orders, r) x
              where o.group_id = p_group and o.date = x.date;
            if not found then
              insert into public.orders (group_id, date, payload)
              select x.group_id, x.date, coalesce(x.payload, '{}')
              from jsonb_populate_record(null::public.orders, r) x;
            end if;
          when 'prices' then
            insert into public.prices (group_id, payload)
            select x.group_id, coalesce(x.payload, '{}') from jsonb_populate_record(null::public.prices, r) x
            on conflict (group_id) do update set payload = excluded.payload;
          else
            raise exception 'bad_table';
        end case;

      when 'delete' then
        t := op->>'table';
        k := op->>'key';
        case t
          when 'members' then delete from public.members where group_id = p_group and id = k::uuid;
          when 'records' then delete from public.records where group_id = p_group and date = k::date;
          when 'absences' then delete from public.absences where group_id = p_group and id = k::uuid;
          when 'skip_days' then delete from public.skip_days where group_id = p_group and date = k::date;
          when 'orders' then delete from public.orders where group_id = p_group and date = k::date;
          when 'prices' then delete from public.prices where group_id = p_group;
          else raise exception 'bad_table';
        end case;

      else
        raise exception 'bad_op';
    end case;
  end loop;

  return jsonb_build_object('status', 'ok', 'rev', new_rev);
end $$;

revoke all on function public.apply_group_ops(uuid, bigint, jsonb) from public, anon;
grant execute on function public.apply_group_ops(uuid, bigint, jsonb) to authenticated;
