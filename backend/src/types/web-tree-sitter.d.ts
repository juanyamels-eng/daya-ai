// Stub para web-tree-sitter (dependencia opcional de codemap).
// El módulo carga dinámicamente vía try/catch; si no está instalado el sistema
// cae al analizador regex/indentación. Este stub solo satisface al compilador.
declare module 'web-tree-sitter' {
  const Parser: any
  export default Parser
}
