import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

// RLS 테스트 전용 설정. 테스트 프로젝트 값은 .env.test.local(커밋되지 않음)에서 읽는다.
// 이름이 운영(VITE_SUPABASE_*)과 다르다: SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY
export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/rls/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: loadEnv(mode === 'production' ? 'test' : mode, process.cwd(), ''),
  },
}))
