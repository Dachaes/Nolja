import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// 코드 실행 전에 실수하기 쉬운 패턴을 검사하는 ESLint 설정입니다.
export default defineConfig([
  // 직접 수정하지 않는 빌드 산출물은 검사하지 않습니다.
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    // JavaScript/TypeScript 기본 규칙에 React 훅과 Fast Refresh 관련 검사를 더합니다.
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      // window/document 같은 브라우저 전역 이름을 정의되지 않은 변수로 오해하지 않게 합니다.
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    // 짧은 조건문도 블록을 표시해 다음 줄을 추가할 때 실행 범위를 오해하지 않게 합니다.
    rules: { curly: ['error', 'all'] },
  },
])
