-- 0005: "내용이 바뀌면 groups.rev가 반드시 오른다"를 DB에서 보장한다 (1-E Realtime의 신호)
--
-- 왜: 그룹원 화면은 groups.rev 변화(Realtime)를 신호로 서버에서 다시 읽는다.
--      apply_group_ops는 rev를 올리지만, 그룹장이 테이블을 직접 고치는 경로(RLS가 허용)와
--      그룹장 넘기기(역할 변경)는 rev가 오르지 않았다. 트리거로 모든 경로를 막는다.
-- 규칙: 한 트랜잭션에서 같은 그룹의 rev는 한 번만 오른다
--       (apply_group_ops가 이미 올렸다면 다시 올리지 않아 rev가 base+1로 유지된다).
--  * 내용 테이블(members, records, absences, skip_days, orders, prices)의 insert/update/delete
--  * groups의 name, emoji, schedule, config 변경
--  * group_members의 role 변경(그룹장 넘기기). 참여/나가기/내보내기는 올리지 않는다
--    (그룹원이 들어왔다고 그룹장의 쓰기가 충돌하면 안 된다)
-- 0004 적용 뒤에 SQL Editor에서 그대로 Run (새 쿼리 창).

-- 이 트랜잭션에서 rev를 이미 올린 그룹 id를 기억한다 (트랜잭션 로컬 설정)
create function public.rev_already_bumped(gid uuid) returns boolean
language sql stable set search_path = public as $$
  select position(gid::text in coalesce(current_setting('app.rev_bumped', true), '')) > 0
$$;

create function public.rev_mark_bumped(gid uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform set_config('app.rev_bumped', coalesce(current_setting('app.rev_bumped', true), '') || ',' || gid::text, true);
end $$;

-- groups 한 행이 바뀔 때: rev가 이미 바뀌었으면 기록만, 내용이 바뀌었는데 rev가 그대로면 올린다
create function public.groups_rev_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.rev is distinct from old.rev then
    perform public.rev_mark_bumped(new.id);
  elsif (new.name, new.emoji, new.schedule, new.config) is distinct from (old.name, old.emoji, old.schedule, old.config) then
    if not public.rev_already_bumped(new.id) then
      new.rev := old.rev + 1;
      perform public.rev_mark_bumped(new.id);
    end if;
  end if;
  return new;
end $$;

create trigger groups_rev_guard before update on public.groups for each row execute function public.groups_rev_guard();

-- 자식 테이블: 문장(statement)마다 한 번, 바뀐 그룹들의 rev를 올린다
-- (RLS와 무관하게 동작해야 하므로 security definer. 호출자에게 실행 권한을 주지 않는다)
create function public.bump_rev_from_nt() returns trigger
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  for gid in select distinct group_id from nt loop
    if not public.rev_already_bumped(gid) then
      update public.groups set rev = rev + 1 where id = gid;   -- groups_rev_guard가 기록한다
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.bump_rev_from_nt() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['members', 'records', 'absences', 'skip_days', 'orders', 'prices'] loop
    execute format('create trigger %1$s_rev_ins after insert on public.%1$I referencing new table as nt for each statement execute function public.bump_rev_from_nt()', t);
    execute format('create trigger %1$s_rev_upd after update on public.%1$I referencing new table as nt for each statement execute function public.bump_rev_from_nt()', t);
    execute format('create trigger %1$s_rev_del after delete on public.%1$I referencing old table as nt for each statement execute function public.bump_rev_from_nt()', t);
  end loop;
end $$;

-- 그룹장 넘기기: role이 바뀌면 rev를 올린다 (옛·새 그룹장 화면이 새 역할을 다시 읽는다)
create function public.bump_rev_on_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  for gid in select distinct n.group_id from nt n join ot o on o.group_id = n.group_id and o.user_id = n.user_id where n.role is distinct from o.role loop
    if not public.rev_already_bumped(gid) then
      update public.groups set rev = rev + 1 where id = gid;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.bump_rev_on_role_change() from public, anon, authenticated;

create trigger group_members_rev_role after update on public.group_members
  referencing new table as nt old table as ot for each statement execute function public.bump_rev_on_role_change();
