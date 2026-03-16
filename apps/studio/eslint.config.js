import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // 封印 studioStore：禁止 kernel/ 之外直接引用私有 store
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/kernel/**', 'src/store/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/store/studioStore', '../store/studioStore', '*/store/studioStore'],
          message: 'studioStore 是 Kernel 私有实现，请通过 @/kernel 导出的 hooks 和 service 接口消费。',
        }],
      }],
    },
  },
])
