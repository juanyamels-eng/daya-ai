import nextConfig from 'eslint-config-next'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['.next/', 'node_modules/', 'public/'],
  },
  ...nextConfig,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      // Reglas del React Compiler (react-hooks v7). El proyecto NO usa el
      // compilador y estas reglas producen falsos positivos en una app Next.js
      // con SSR (setMounted, useSearchParams, sessionStorage, carga condicional).
      // Por eso están 'off', igual que sus hermanas. El caso legítimo de
      // "estado derivado" se resuelve a mano con useMemo (ver admin/usuarios).
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-compiler/react-compiler': 'off',
      'react/no-unescaped-entities': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
)
