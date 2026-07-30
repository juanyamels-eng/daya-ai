// Tipos para turndown-plugin-gfm (no trae los suyos). Añade a Turndown el soporte
// GFM que falta de fábrica: tablas, tachado y listas de tareas. `gfm` los agrupa.
declare module 'turndown-plugin-gfm' {
  import TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
  export const tables: TurndownService.Plugin
  export const strikethrough: TurndownService.Plugin
  export const taskListItems: TurndownService.Plugin
}
