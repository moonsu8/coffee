-- 0006: 1-F 그룹원 관리·승인·즉시 알림을 위한 서버 변경 (여러 번 Run해도 안전: 멱등)
--
--  1) 별명(nickname): 참여할 때 적는 선택 값. 그룹장이 그룹원/참여 요청을 구분하는 데 쓴다.
--     group_members.nickname, join_requests.nickname 열 추가, redeem_invite(p_code, p_nickname) 로 교체,
--     resolve_join_request가 승인할 때 별명을 그룹원 행으로 옮긴다.
--  2) 소속 변경 신호(profiles.membership_rev): 내가 속한 그룹이 생기거나 사라지거나 역할이 바뀌거나,
--     (그룹장이면) 참여 요청이 들어오면 내 profiles 행의 membership_rev가 오른다.
--     앱은 이 행(본인 행만 RLS로 읽힘)을 Realtime으로 구독해, 내보내지거나 그룹이 삭제된 그룹원도 바로 알게 한다.
--     (group_members의 DELETE 알림은 RLS가 적용되지 않아 의존하지 않는다.)
--  3) 승인 시 인원 제한: 승인으로 들어와도 그 코드의 max_uses를 넘지 않는다.
-- 0005 적용 뒤에 SQL Editor에서 새 쿼리 창으로 Run.

alter table public.group_members add column if not exists nickname text check (nickname is null or char_length(nickname) <= 20);
alter table public.join_requests add column if not exists nickname text check (nickname is null or char_length(nickname) <= 20);
alter table public.join_requests add column if not exists invite_id uuid;
alter table public.profiles add column if not exists membership_rev bigint not null default 0;

-- ───────── 소속 변경 신호 ─────────
create or replace function public.touch_membership(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set membership_rev = membership_rev + 1 where user_id = uid;
end $$;
revoke all on function public.touch_membership(uuid) from public, anon, authenticated;

create or replace function public.group_members_signal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.touch_membership(old.user_id);
  else
    perform public.touch_membership(new.user_id);
  end if;
  return null;
end $$;
revoke all on function public.group_members_signal() from public, anon, authenticated;

drop trigger if exists group_members_signal on public.group_members;
create trigger group_members_signal after insert or delete or update of role on public.group_members
  for each row execute function public.group_members_signal();

-- 참여 요청: 요청자와 그룹장에게 신호
create or replace function public.join_requests_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner_id uuid;
begin
  perform public.touch_membership(new.user_id);
  select user_id into owner_id from public.group_members where group_id = new.group_id and role = 'owner';
  if owner_id is not null then perform public.touch_membership(owner_id); end if;
  return null;
end $$;
revoke all on function public.join_requests_signal() from public, anon, authenticated;

drop trigger if exists join_requests_signal on public.join_requests;
create trigger join_requests_signal after insert or update of status on public.join_requests
  for each row execute function public.join_requests_signal();

-- profiles 행 변경을 Realtime으로 (본인 행만 읽히는 RLS가 그대로 적용된다)
do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end $$;

-- ───────── 초대 코드 입력: 별명 추가 ─────────
drop function if exists public.redeem_invite(text);
create or replace function public.redeem_invite(p_code text, p_nickname text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  inv public.invites;
  g public.groups;
  fails int;
  nick text := nullif(left(btrim(coalesce(p_nickname, '')), 20), '');
begin
  perform public.require_adult();
  uid := auth.uid();

  select count(*) into fails from public.invite_attempts where user_id = uid and at > now() - interval '10 minutes';
  if fails >= 10 then raise exception 'rate_limited'; end if;

  select * into inv from public.invites where code = upper(btrim(coalesce(p_code, '')));
  if inv.id is null or inv.revoked_at is not null or inv.expires_at <= now() or inv.uses >= inv.max_uses then
    insert into public.invite_attempts (user_id) values (uid);
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into g from public.groups where id = inv.group_id;

  if exists (select 1 from public.group_members where group_id = inv.group_id and user_id = uid) then
    return jsonb_build_object('status', 'joined', 'group_id', g.id, 'name', g.name);
  end if;

  if inv.requires_approval then
    insert into public.join_requests (group_id, user_id, nickname, invite_id) values (inv.group_id, uid, nick, inv.id)
    on conflict (group_id, user_id) do update set status = 'pending', nickname = excluded.nickname, invite_id = excluded.invite_id
      where public.join_requests.status <> 'approved';
    return jsonb_build_object('status', 'pending', 'group_id', g.id, 'name', g.name);
  end if;

  insert into public.group_members (group_id, user_id, role, nickname) values (inv.group_id, uid, 'viewer', nick);
  update public.invites set uses = uses + 1 where id = inv.id;
  return jsonb_build_object('status', 'joined', 'group_id', g.id, 'name', g.name);
end $$;
revoke all on function public.redeem_invite(text, text) from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated;

-- ───────── 승인/거절: 별명을 옮기고, 승인도 코드 인원 제한을 지킨다 ─────────
create or replace function public.resolve_join_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.join_requests;
  inv public.invites;
begin
  perform public.require_user();
  select * into r from public.join_requests where id = p_request;
  if r.id is null or not public.is_owner(r.group_id) then raise exception 'forbidden'; end if;
  if r.status <> 'pending' then return; end if;
  if p_approve then
    if r.invite_id is not null then
      select * into inv from public.invites where id = r.invite_id;
      if inv.id is not null then
        if inv.uses >= inv.max_uses then raise exception 'invite_full'; end if;
        update public.invites set uses = uses + 1 where id = inv.id;
      end if;
    end if;
    insert into public.group_members (group_id, user_id, role, nickname) values (r.group_id, r.user_id, 'viewer', r.nickname)
    on conflict do nothing;
    update public.join_requests set status = 'approved' where id = r.id;
  else
    update public.join_requests set status = 'rejected' where id = r.id;
  end if;
end $$;
