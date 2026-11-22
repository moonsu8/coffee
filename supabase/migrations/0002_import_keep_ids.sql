-- 0002: import_group이 uuid 형식의 멤버 ref를 그대로 id로 쓰게 한다.
-- 이유: 금액(pricing.lines/participants)·주문(items) payload 안에 멤버 id가 들어 있어서,
--       서버가 멤버 id를 새로 만들면 payload 안의 참조가 깨진다. 클라이언트가 멤버 id를 uuid로 바꿔 보내고 서버는 그대로 쓴다.
-- 이전 입력(uuid가 아닌 ref)은 지금까지처럼 새 uuid를 만든다(하위 호환).
-- 0001 적용 뒤에 SQL Editor에서 그대로 Run. (create or replace라 권한 설정은 유지된다)

create or replace function public.import_group(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  gid uuid;
  mmap jsonb := '{}'::jsonb;
  m jsonb;
  mid uuid;
  ikey uuid := nullif(p->>'import_key', '')::uuid;
  ref text;
begin
  perform public.require_adult();
  uid := auth.uid();

  if ikey is not null then
    select g.id into gid from public.groups g
      join public.group_members gm on gm.group_id = g.id and gm.user_id = uid and gm.role = 'owner'
      where g.import_key = ikey;
    if gid is not null then return gid; end if;
  end if;

  if jsonb_array_length(coalesce(p->'members', '[]')) > 100
     or jsonb_array_length(coalesce(p->'records', '[]')) > 20000
     or jsonb_array_length(coalesce(p->'absences', '[]')) > 2000
     or jsonb_array_length(coalesce(p->'skip_days', '[]')) > 2000
     or jsonb_array_length(coalesce(p->'orders', '[]')) > 20000 then
    raise exception 'too_large';
  end if;
  if (select count(*) from public.group_members where user_id = uid and role = 'owner') >= 20 then
    raise exception 'too_many_groups';
  end if;

  insert into public.groups (name, emoji, schedule, config, import_key)
  values (p->>'name', coalesce(p->>'emoji', '✨'), coalesce(p->'schedule', '"weekdays"'), coalesce(p->'config', '{}'), ikey)
  returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'owner');
  insert into public.entitlements (group_id) values (gid);

  for m in select * from jsonb_array_elements(coalesce(p->'members', '[]')) loop
    -- ref가 uuid면 그대로 id로 쓴다: 금액·주문 payload 안의 멤버 참조가 서버에서도 그대로 맞는다
    insert into public.members (id, group_id, name, sort, color, emoji, payload)
    values (
      case when m->>'ref' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (m->>'ref')::uuid else gen_random_uuid() end,
      gid, m->>'name', coalesce((m->>'sort')::int, 0), m->>'color', m->>'emoji', coalesce(m->'payload', '{}'))
    returning id into mid;
    mmap := mmap || jsonb_build_object(m->>'ref', mid::text);
  end loop;

  -- 삭제된 멤버의 과거 기록도 버리지 않는다: 멤버 목록에 없는 ref는 새 id만 받아 "탈퇴한 멤버" 기록으로 남긴다
  for ref in
    select distinct x from (
      select r->>'member_ref' as x from jsonb_array_elements(coalesce(p->'records', '[]')) r
      union
      select a->>'member_ref' from jsonb_array_elements(coalesce(p->'absences', '[]')) a
    ) s where x is not null
  loop
    if not (mmap ? ref) then
      mmap := mmap || jsonb_build_object(
        ref,
        case when ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ref else gen_random_uuid()::text end
      );
    end if;
  end loop;

  insert into public.records (group_id, date, member_id, memo, payload)
  select gid, (r->>'date')::date, (mmap->>(r->>'member_ref'))::uuid, r->>'memo', coalesce(r->'payload', '{}')
  from jsonb_array_elements(coalesce(p->'records', '[]')) r;

  insert into public.absences (group_id, member_id, from_date, to_date, payload)
  select gid, (mmap->>(a->>'member_ref'))::uuid, (a->>'from')::date, (a->>'to')::date, coalesce(a->'payload', '{}')
  from jsonb_array_elements(coalesce(p->'absences', '[]')) a;

  insert into public.skip_days (group_id, date)
  select distinct gid, (d #>> '{}')::date from jsonb_array_elements(coalesce(p->'skip_days', '[]')) d;

  insert into public.orders (group_id, date, payload)
  select gid, (o->>'date')::date, coalesce(o->'payload', '{}') from jsonb_array_elements(coalesce(p->'orders', '[]')) o;

  if p ? 'prices' then
    insert into public.prices (group_id, payload) values (gid, coalesce(p->'prices'->'payload', '{}'));
  end if;
  return gid;
end $$;
