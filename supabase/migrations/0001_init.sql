-- 커피 당번 1-A: 공유 그룹 스키마 + RLS + RPC
-- 적용: Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run (docs/SUPABASE.md 참고).
-- 원칙
--  * 쓰기는 그룹장(owner)만, 읽기는 그룹 소속자만. 소속/초대/계정 변경은 RPC로만.
--  * 서버에는 구독 상태만 저장(결제 정보 없음). 이름은 별명도 가능.
--  * payload(jsonb) 열은 "앱이 해석하는 불투명 값"이다. 나중에 종단간 암호화(B안)로 바꿀 때 여기만 암호문으로 바꾼다.
--  * 비밀값(service_role 키 등)은 이 파일 어디에도 없다.

create extension if not exists pgcrypto with schema extensions;

-- ───────── 테이블 ─────────

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  age_confirmed_at timestamptz,            -- 만 14세 이상 확인 시각 (RPC confirm_age로만 기록)
  terms_version text,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '✨' check (char_length(emoji) <= 16),
  schedule jsonb not null default '"weekdays"'::jsonb,
  config jsonb not null default '{}'::jsonb,
  payload_version int not null default 1,
  import_key uuid unique,                   -- 기기→서버 옮기기 재시도 시 중복 생성 방지
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'viewer')),
  member_id uuid,                           -- (3단계) "나는 누구" 연결용. 지금은 쓰지 않음
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';
create index group_members_user on public.group_members (user_id);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sort int not null default 0,
  color text,
  emoji text,
  payload jsonb not null default '{}'::jsonb,   -- favorite(기본 메뉴) 등
  created_at timestamptz not null default now()
);
create index members_group on public.members (group_id);

-- 구매(수행) 기록: 하루 1건. member_id에는 FK를 두지 않는다(멤버를 지워도 과거 기록은 "탈퇴한 멤버"로 보존).
create table public.records (
  group_id uuid not null references public.groups (id) on delete cascade,
  date date not null,
  member_id uuid not null,
  memo text check (memo is null or char_length(memo) <= 200),
  payload jsonb not null default '{}'::jsonb,   -- pricing 등
  updated_at timestamptz not null default now(),
  primary key (group_id, date)
);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  member_id uuid not null,
  from_date date not null,
  to_date date not null,
  payload jsonb not null default '{}'::jsonb
);
create index absences_group on public.absences (group_id);

create table public.skip_days (
  group_id uuid not null references public.groups (id) on delete cascade,
  date date not null,
  primary key (group_id, date)
);

create table public.orders (
  group_id uuid not null references public.groups (id) on delete cascade,
  date date not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (group_id, date)
);

-- 그룹당 한 줄: 가격표·당번 기준 설정·사용자 메뉴
create table public.prices (
  group_id uuid primary key references public.groups (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8,}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  max_uses int not null default 20 check (max_uses between 1 and 200),
  uses int not null default 0,
  requires_approval boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_group on public.invites (group_id);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- 초대 코드 입력 실패 기록 (무차별 대입 방지)
create table public.invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index invite_attempts_user_at on public.invite_attempts (user_id, at);

-- 구독 상태 (3단계에서 서버 함수가 채운다. 클라이언트는 읽기만)
create table public.entitlements (
  group_id uuid primary key references public.groups (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'none',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- ───────── 공통 트리거 ─────────

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger groups_touch before update on public.groups for each row execute function public.touch_updated_at();
create trigger records_touch before update on public.records for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
create trigger prices_touch before update on public.prices for each row execute function public.touch_updated_at();

-- 남용 방지용 하드 상한 (무료/유료 한도는 3단계에서 따로 둔다)
create function public.enforce_row_cap() returns trigger language plpgsql as $$
declare
  cap int := tg_argv[0]::int;
  n int;
begin
  execute format('select count(*) from public.%I where group_id = $1', tg_table_name) into n using new.group_id;
  if n >= cap then
    raise exception 'too_large';
  end if;
  return new;
end $$;

create trigger members_cap before insert on public.members for each row execute function public.enforce_row_cap('100');
create trigger records_cap before insert on public.records for each row execute function public.enforce_row_cap('20000');
create trigger absences_cap before insert on public.absences for each row execute function public.enforce_row_cap('2000');
create trigger skip_days_cap before insert on public.skip_days for each row execute function public.enforce_row_cap('2000');
create trigger orders_cap before insert on public.orders for each row execute function public.enforce_row_cap('20000');
create trigger group_members_cap before insert on public.group_members for each row execute function public.enforce_row_cap('200');

-- ───────── 권한 헬퍼 (RLS 재귀 방지를 위해 security definer) ─────────

create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid())
$$;

create function public.is_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'owner')
$$;

-- ───────── RLS ─────────

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.members enable row level security;
alter table public.records enable row level security;
alter table public.absences enable row level security;
alter table public.skip_days enable row level security;
alter table public.orders enable row level security;
alter table public.prices enable row level security;
alter table public.invites enable row level security;
alter table public.join_requests enable row level security;
alter table public.invite_attempts enable row level security;
alter table public.entitlements enable row level security;

-- 읽기 전용(쓰기는 RPC/서버만): 정책이 select뿐이면 insert/update/delete는 모두 거절된다
create policy profiles_read on public.profiles for select to authenticated using (user_id = auth.uid());
create policy group_members_read on public.group_members for select to authenticated
  using (user_id = auth.uid() or public.is_owner(group_id));
create policy invites_read on public.invites for select to authenticated using (public.is_owner(group_id));
create policy join_requests_read on public.join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_owner(group_id));
create policy entitlements_read on public.entitlements for select to authenticated using (public.is_member(group_id));
-- invite_attempts: 정책 없음 = 클라이언트 접근 불가

-- groups: 소속자 읽기, 그룹장만 수정. 생성/삭제는 RPC
create policy groups_read on public.groups for select to authenticated using (public.is_member(id));
create policy groups_update on public.groups for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

-- 그룹 데이터: 소속자 읽기, 그룹장만 쓰기
do $$
declare t text;
begin
  foreach t in array array['members', 'records', 'absences', 'skip_days', 'orders', 'prices'] loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (public.is_member(group_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_owner(group_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_owner(group_id)) with check (public.is_owner(group_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.is_owner(group_id))', t);
  end loop;
end $$;

-- 로그인 안 한 사용자(anon 롤)는 아무 테이블에도 접근할 수 없다
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ───────── RPC ─────────
-- 모든 함수: security definer, 로그인 필요, anon/public 실행 금지

create function public.require_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return auth.uid();
end $$;

create function public.require_adult() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_user();
  if not exists (select 1 from public.profiles where user_id = auth.uid() and age_confirmed_at is not null) then
    raise exception 'age_not_confirmed';
  end if;
end $$;

-- 만 14세 이상 확인 (클라이언트 체크박스 -> 서버 기록)
create function public.confirm_age(p_terms_version text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_user();
begin
  insert into public.profiles (user_id, age_confirmed_at, terms_version)
  values (uid, now(), p_terms_version)
  on conflict (user_id) do update
    set age_confirmed_at = coalesce(public.profiles.age_confirmed_at, excluded.age_confirmed_at),
        terms_version = excluded.terms_version;
end $$;

create function public.create_group(p_name text, p_emoji text default '✨', p_schedule jsonb default '"weekdays"', p_config jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; gid uuid;
begin
  perform public.require_adult();
  uid := auth.uid();
  if (select count(*) from public.group_members where user_id = uid and role = 'owner') >= 20 then
    raise exception 'too_many_groups';
  end if;
  insert into public.groups (name, emoji, schedule, config) values (p_name, coalesce(p_emoji, '✨'), p_schedule, p_config)
  returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'owner');
  insert into public.entitlements (group_id) values (gid);
  return gid;
end $$;

-- 기기 데이터 -> 서버 (한 트랜잭션). 중간에 실패하면 아무것도 남지 않는다.
-- p: { import_key, name, emoji, schedule, config,
--      members:[{ref,name,sort,color,emoji,payload}], records:[{date,member_ref,memo,payload}],
--      absences:[{member_ref,from,to,payload}], skip_days:[date], orders:[{date,payload}], prices:{payload} }
create function public.import_group(p jsonb) returns uuid
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
    insert into public.members (group_id, name, sort, color, emoji, payload)
    values (gid, m->>'name', coalesce((m->>'sort')::int, 0), m->>'color', m->>'emoji', coalesce(m->'payload', '{}'))
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
      mmap := mmap || jsonb_build_object(ref, gen_random_uuid()::text);
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

-- 초대: 8자리, 헷갈리는 글자(0/O, 1/I) 제외한 32글자 집합 (코드는 대문자로만 보여준다)
create function public.gen_invite_code() returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
  i int;
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);   -- 256 % 32 = 0 이라 편향 없음
  end loop;
  return code;
end $$;

create function public.create_invite(p_group uuid, p_ttl_hours int default 72, p_max_uses int default 20, p_requires_approval boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_user(); c text; tries int := 0;
begin
  if not public.is_owner(p_group) then raise exception 'forbidden'; end if;
  if p_ttl_hours not between 1 and 24 * 30 then raise exception 'bad_ttl'; end if;
  loop
    c := public.gen_invite_code();
    begin
      insert into public.invites (group_id, code, created_by, expires_at, max_uses, requires_approval)
      values (p_group, c, uid, now() + make_interval(hours => p_ttl_hours), p_max_uses, p_requires_approval);
      return c;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
end $$;

create function public.revoke_invite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  perform public.require_user();
  select group_id into gid from public.invites where code = upper(btrim(p_code));
  if gid is null or not public.is_owner(gid) then raise exception 'forbidden'; end if;
  update public.invites set revoked_at = now() where code = upper(btrim(p_code)) and revoked_at is null;
end $$;

-- 초대 코드 입력. 결과: {status: joined|pending|invalid, group_id?, name?}
-- 실패는 예외 대신 'invalid'로 돌려줘야 실패 기록이 롤백되지 않는다. 10분에 10번 실패하면 rate_limited
create function public.redeem_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  inv public.invites;
  g public.groups;
  fails int;
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
    insert into public.join_requests (group_id, user_id) values (inv.group_id, uid)
    on conflict (group_id, user_id) do update set status = 'pending' where public.join_requests.status <> 'approved';
    return jsonb_build_object('status', 'pending', 'group_id', g.id, 'name', g.name);
  end if;

  insert into public.group_members (group_id, user_id, role) values (inv.group_id, uid, 'viewer');
  update public.invites set uses = uses + 1 where id = inv.id;
  return jsonb_build_object('status', 'joined', 'group_id', g.id, 'name', g.name);
end $$;

create function public.resolve_join_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.join_requests;
begin
  perform public.require_user();
  select * into r from public.join_requests where id = p_request;
  if r.id is null or not public.is_owner(r.group_id) then raise exception 'forbidden'; end if;
  if r.status <> 'pending' then return; end if;
  if p_approve then
    insert into public.group_members (group_id, user_id, role) values (r.group_id, r.user_id, 'viewer')
    on conflict do nothing;
    update public.join_requests set status = 'approved' where id = r.id;
  else
    update public.join_requests set status = 'rejected' where id = r.id;
  end if;
end $$;

-- 그룹원 내보내기
create function public.remove_viewer(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_user();
  if not public.is_owner(p_group) then raise exception 'forbidden'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user and role = 'viewer';
end $$;

-- 그룹원이 스스로 나가기 (그룹장은 먼저 넘기거나 그룹을 삭제해야 한다)
create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_user();
  if public.is_owner(p_group) then raise exception 'owner_cannot_leave'; end if;
  delete from public.group_members where group_id = p_group and user_id = auth.uid() and role = 'viewer';
end $$;

-- 그룹장 넘기기 (새 그룹장은 이미 소속된 그룹원이어야 한다)
create function public.transfer_ownership(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_user();
begin
  if not public.is_owner(p_group) then raise exception 'forbidden'; end if;
  if p_user = uid then return; end if;
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = p_user and role = 'viewer') then
    raise exception 'target_not_member';
  end if;
  if (select count(*) from public.group_members where user_id = p_user and role = 'owner') >= 20 then
    raise exception 'too_many_groups';
  end if;
  update public.group_members set role = 'viewer' where group_id = p_group and user_id = uid;
  update public.group_members set role = 'owner' where group_id = p_group and user_id = p_user;
end $$;

-- 그룹 삭제: 연결된 모든 데이터가 즉시 지워진다(cascade)
create function public.delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_user();
  if not public.is_owner(p_group) then raise exception 'forbidden'; end if;
  delete from public.groups where id = p_group;
end $$;

-- 계정 삭제: 내가 그룹장인 그룹과 내 소속·프로필·초대·요청이 모두 즉시 지워진다
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := public.require_user();
begin
  delete from public.groups where id in (select group_id from public.group_members where user_id = uid and role = 'owner');
  delete from auth.users where id = uid;
end $$;

-- 실행 권한: 로그인한 사용자만 (anon/public 금지)
do $$
declare f text;
begin
  foreach f in array array[
    'is_member(uuid)', 'is_owner(uuid)', 'require_user()', 'require_adult()', 'confirm_age(text)',
    'create_group(text,text,jsonb,jsonb)', 'import_group(jsonb)', 'gen_invite_code()',
    'create_invite(uuid,int,int,boolean)', 'revoke_invite(text)', 'redeem_invite(text)',
    'resolve_join_request(uuid,boolean)', 'remove_viewer(uuid,uuid)', 'leave_group(uuid)',
    'transfer_ownership(uuid,uuid)', 'delete_group(uuid)', 'delete_my_account()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- 헬퍼 전용(직접 호출할 필요 없음)
revoke execute on function public.gen_invite_code() from authenticated;
revoke execute on function public.require_user() from authenticated;
revoke execute on function public.require_adult() from authenticated;

-- ───────── Realtime (1-E에서 사용). RLS가 적용되어 소속자에게만 전달된다 ─────────
do $$
declare t text;
begin
  foreach t in array array['groups', 'members', 'records', 'absences', 'skip_days', 'orders', 'prices'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
