// Shared NLP utilities — tokenization and lexical similarity.

/**
 * Convierte texto a lista de tokens normalizados: minúsculas, sin tildes,
 * solo caracteres Unicode alfanuméricos, filtrando tokens cortos.
 * @param minLen longitud mínima de token (default 3; pasar 2 para búsqueda)
 */
export function tokenize(text: string, minLen = 3): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= minLen)
}

/**
 * Similitud Jaccard entre dos textos (0..1), sin embeddings.
 * Útil para deduplicación léxica barata.
 */
export function jaccard(a: string, b: string): number {
  const sa = new Set(tokenize(a))
  const sb = new Set(tokenize(b))
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  return inter / (sa.size + sb.size - inter)
}
