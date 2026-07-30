// Utilidades de URL compartidas.

/**
 * Extrae el dominio limpio de una URL.
 * Acepta URLs con o sin protocolo, elimina "www." y punto final FQDN.
 * Devuelve '' en caso de error (en vez de lanzar o devolver la URL completa).
 */
export function domainOf(url: string): string {
  try {
    const u = new URL(url.includes('://') ? url : 'https://' + url)
    return u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  } catch {
    return ''
  }
}
