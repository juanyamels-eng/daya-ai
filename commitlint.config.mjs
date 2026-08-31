// Conventional Commits — mensajes de commit con estructura y semver derivable.
// Tipos permitidos: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
// Ejemplos: "feat: add X", "fix(chat): streaming", "refactor(backend): ...".
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'never', ['upper-case']],
    'header-max-length': [2, 'always', 100],
  },
}
