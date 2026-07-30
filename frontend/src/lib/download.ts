// Descarga una imagen al dispositivo del usuario.
// El atributo `download` de <a> NO funciona en URLs cross-origin (como Pollinations):
// el navegador lo ignora y abre la imagen en otra pestaña. Por eso descargamos el
// binario con fetch → blob → objectURL, que sí fuerza la descarga. Si CORS lo
// impide, caemos a abrir la imagen en una pestaña nueva.
export async function downloadImage(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error('fetch failed')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    // Fallback: al menos dar acceso a la imagen
    window.open(url, '_blank', 'noopener')
  }
}
