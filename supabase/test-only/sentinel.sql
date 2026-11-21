-- 테스트 프로젝트에만 적용한다 (운영 프로젝트에는 절대 적용하지 않는다).
-- RLS 테스트는 이 함수가 true를 돌려주는 프로젝트에서만 실행된다 (운영 프로젝트에 실수로 연결하는 것을 막는 안전장치).
create or replace function public.is_test_project() returns boolean
language sql immutable as $$ select true $$;
grant execute on function public.is_test_project() to authenticated, anon;
