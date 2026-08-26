// Stub para web-tree-sitter (dependencia opcional de codemap).
// El módulo carga dinámicamente vía try/catch; si no está instalado el sistema
// cae al analizador regex/indentación. Este stub solo satisface al compilador.
declare module 'web-tree-sitter' {
  interface ParserInstance {
    setLanguage: (lang: unknown) => Promise<void>
    parse: (input: string, oldTree?: unknown) => { rootNode: unknown }
  }
  const Parser: new () => ParserInstance
  export default Parser
}
