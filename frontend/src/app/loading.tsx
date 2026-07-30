import Splash from '../components/Splash'

// Fallback de carga para CUALQUIER ruta que no traiga el suyo: el App Router usa
// el loading.tsx ancestro más cercano, así que este de raíz cubre /planes, /blog,
// /settings, /notes… de una vez.
//
// Antes no existía ninguno en toda la app: al navegar, la pantalla se quedaba
// congelada en la anterior hasta que llegaba el chunk, sin ningún acuse de recibo.
export default function Loading() {
  return <Splash delay />
}
