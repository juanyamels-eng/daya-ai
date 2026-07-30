// ============================================================
// DAYA IA — Servicio de imágenes para documentos
// Busca la mejor foto (Unsplash → Pexels → Wikimedia → Picsum)
// y la devuelve como data URI (incrustada), para que el PDF/Word
// sea 100% confiable sin depender de enlaces externos al renderizar.
// ============================================================

// 1) Encuentra VARIAS imágenes candidatas para una búsqueda (para no repetir)
export async function findImageCandidates(query: string): Promise<string[]> {
  const q = encodeURIComponent(query)

  // 1️⃣ Unsplash — fotos profesionales
  try {
    if (process.env.UNSPLASH_ACCESS_KEY) {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${q}&per_page=8&orientation=landscape&content_filter=high`,
        { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }
      )
      const data = await res.json() as any
      const urls = (data.results || []).map((r: any) => r?.urls?.regular).filter(Boolean)
      if (urls.length) return urls
    }
  } catch {}

  // 2️⃣ Pexels
  try {
    if (process.env.PEXELS_API_KEY) {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${q}&per_page=8&orientation=landscape`,
        { headers: { Authorization: process.env.PEXELS_API_KEY } }
      )
      const data = await res.json() as any
      const urls = (data.photos || []).map((p: any) => p?.src?.large).filter(Boolean)
      if (urls.length) return urls
    }
  } catch {}

  // 3️⃣ Wikimedia Commons — gratis, sin API key (varios resultados)
  try {
    const wikis = await searchWikimediaMany(query)
    if (wikis.length) return wikis
  } catch {}

  // Sin resultado relevante → vacío (mejor ninguna que una al azar)
  return []
}

// Compatibilidad: primera imagen incrustada (la usan otros generadores)
export async function findImageUrl(query: string): Promise<string | null> {
  const list = await findImageCandidates(query)
  return list[0] || null
}

// 2) Descarga la imagen y la devuelve incrustada (data URI). Si falla, null.
export async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000 || buf.length > 6_000_000) return null // ni rota ni gigante
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// 3) Atajo: búsqueda → imagen incrustada lista para el documento
export async function getEmbeddedImage(query: string): Promise<string | null> {
  const url = await findImageUrl(query)
  if (!url) return null
  return fetchAsDataUri(url)
}

// Wikimedia Commons — varias imágenes (para no repetir entre secciones)
async function searchWikimediaMany(query: string): Promise<string[]> {
  try {
    const searchQuery = encodeURIComponent(query)
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${searchQuery}&srnamespace=6&srlimit=8&format=json&origin=*`
    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json() as any
    const results = searchData?.query?.search
    if (!results || results.length === 0) return []

    const imageResults = results.filter((r: any) =>
      r.title && (r.title.toLowerCase().includes('.jpg') || r.title.toLowerCase().includes('.png'))
    )
    if (imageResults.length === 0) return []

    // Resuelve la URL real de cada archivo (en paralelo)
    const urls = await Promise.all(imageResults.slice(0, 6).map(async (r: any) => {
      try {
        const fileName = encodeURIComponent(r.title.replace('File:', ''))
        const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${fileName}&prop=imageinfo&iiprop=url|size&iiurlwidth=1200&format=json&origin=*`
        const infoRes = await fetch(infoUrl)
        const infoData = await infoRes.json() as any
        const pages = infoData?.query?.pages
        if (!pages) return null
        const page = Object.values(pages)[0] as any
        const width = page?.imageinfo?.[0]?.thumbwidth || 0
        if (width < 400) return null
        return page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || null
      } catch { return null }
    }))

    return urls.filter(Boolean) as string[]
  } catch {
    return []
  }
}

// Wikimedia Commons API — una sola imagen (compatibilidad)
async function searchWikimedia(query: string): Promise<string | null> {
  const many = await searchWikimediaMany(query)
  return many[0] || null
}
