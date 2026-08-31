'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useAuthStore } from '../store'
import { LangSelector } from '../components/LangSelector'

// Check de las listas de precios (antes vivía en ProductShowcase, ya eliminado)
function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
  )
}

const LANDING_ART = [
  '/showcase/showcase-01.jpg',
  '/showcase/showcase-02.jpg',
  '/showcase/showcase-03.jpg',
  '/showcase/showcase-04.jpg',
  '/showcase/showcase-05.jpg',
  '/showcase/showcase-06.jpg',
]

// Carrusel del hero: banda full-bleed que sangra hasta los bordes de la pantalla
// y avanza sola en bucle (estilo AI Studio). La lista se duplica para que el
// bucle sea continuo; la copia va oculta a lectores de pantalla.
// Se pausa al pasar el ratón y queda estática con prefers-reduced-motion.
function HeroReel() {
  const t = useTranslations('landing2')
  return (
    <div className="lx-reel" aria-label={t('artReelAria')}>
      <div className="lx-reel-track">
        {[0, 1].map(pass => (
          LANDING_ART.map((src, i) => (
            <figure className="lx-reel-card" key={`${pass}-${src}`} aria-hidden={pass === 1 || undefined}>
              {/* SIN loading="lazy". El carril se mueve con transform y el
                  navegador no reevalúa la carga diferida al desplazarlo: las
                  tarjetas que arrancan fuera de pantalla no se cargaban NUNCA
                  (5 de las 6 ilustraciones salían vacías en producción). Y no
                  había nada que ahorrar: cada SVG pesa menos de 5 KB y está en
                  el hero, o sea, siempre a la vista. */}
              <img src={src} alt={pass === 0 ? t('artStyleAria', { style: ['Lago al amanecer', 'Lobo en la nieve', 'Cerezo en flor', 'Ciudad futurista', 'Reloj de bolsillo', 'Biblioteca acogedora'][i] }) : ''} />
              <figcaption>{['Lago al amanecer', 'Lobo en la nieve', 'Cerezo en flor', 'Ciudad futurista', 'Reloj de bolsillo', 'Biblioteca acogedora'][i]}</figcaption>
            </figure>
          ))
        ))}
      </div>
    </div>
  )
}

// Los 6 juegos del arcade, en video. En la landing SOLO se enseñan; se juegan
// al iniciar sesion. Los .webm son grabaciones de los juegos REALES de
// components/games/arcade.js, asi que si cambia un juego el video queda viejo.
//
// Para regrabar (las rutas de utileria /rec y /arcade-probe se quitaron de
// produccion; se restauran del historial de git cuando toque): abrir /rec?g=<id>
// (renderiza un solo juego a pantalla
// completa) con Playwright en 480x600 y deviceScaleFactor 2 (captura fisica a
// 960x1200), METER ANTES el consentimiento de cookies en localStorage
// ('daya-cookie-consent') o el banner GDPR tapa el tercio inferior del video,
// dejar ~8 s de calentamiento y grabar 12 s con MediaRecorder VP9 a 24 Mbps
// sobre canvas.captureStream(60). Grabar 3 tomas por juego y elegir la mejor
// midiendo canvas.__game.state() antes y despues (puntos ganados en camara;
// muertes/golpes penalizados): asi el clip enseña una buena partida, no la
// que toco. El webm de MediaRecorder sale con duracion infinita —el `loop` no
// funciona— asi que hay que pasarlo por ffmpeg: scale=720:900 lanczos,
// libvpx-vp9 -b:v 0 -pix_fmt yuv420p -r 60 (todos a 60: a 30 se notaba seco
// al lado de los demas); crf 32 los clips ligeros y 36-37 los de mucho
// movimiento. El poster .jpg se saca del propio webm (-ss 6). Total: ~6 MB.
// Ojo: el ffmpeg que trae Playwright esta recortado y no sabe VP9; hace falta
// uno completo (p. ej. el paquete ffmpeg-static).
//
// El nombre propio del juego NO se traduce: es el mismo rótulo que enseña el
// arcade de components/games/arcade.js, y si aquí pusiera "Minotaur" y dentro
// "Minotauro" serían dos juegos distintos para el visitante. El género sí, y
// sale de landing2.gk{i} (el índice del array ES la clave).
const GAME_CLIPS = [
  { id: 'maze3d', label: 'Minotauro' },
  { id: 'racer', label: 'Ruta 88' },
  { id: 'neon', label: 'Neón' },
  { id: 'survivor', label: 'Horda' },
  { id: 'platformer', label: 'Ocaso' },
  { id: 'bricks', label: 'Prisma' },
]

// Banda full-bleed en rotacion continua, idéntica al carrusel de fotos: la
// lista se duplica para que el bucle no tenga costura y la copia va oculta a
// lectores de pantalla.
//
// Duplicar <video> sale gratis: con preload="none" una copia que no se ve no
// descarga nada, y las dos apuntan a la misma URL, asi que el navegador la
// cachea. Ademas el observer solo reproduce las que estan a la vista, de modo
// que nunca hay doce decodificando a la vez.
//
// El poster .jpg cubre el caso de que el webm no cargue (Safari antiguo no
// reproduce VP8): se ve un fotograma del juego, no un hueco negro.
function GameReel() {
  const t = useTranslations('landing2')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        const v = e.target as HTMLVideoElement
        if (e.isIntersecting) v.play().catch(() => {})
        else v.pause()
      }),
      { threshold: 0.2 }
    )
    root.querySelectorAll('video').forEach((v) => io.observe(v))
    return () => io.disconnect()
  }, [])

  return (
    <div className="lx-reel lx-reel--games" ref={ref} aria-label={t('gamesReelAria')}>
      <div className="lx-reel-track lx-reel-track--slow">
        {[0, 1].map(pass => (
          GAME_CLIPS.map((g, i) => (
            <figure className="lx-reel-card" key={`${pass}-${g.id}`} aria-hidden={pass === 1 || undefined}>
              <video
                src={`/games/${g.id}.webm`}
                poster={`/games/${g.id}.jpg`}
                muted
                loop
                playsInline
                preload="none"
                aria-label={pass === 0 ? t('gameVideoAria', { label: g.label }) : undefined}
              />
              <figcaption>{g.label}<i>{t(`gk${i}`)}</i></figcaption>
            </figure>
          ))
        ))}
      </div>
    </div>
  )
}

// Revelado al entrar en pantalla: cada seccion aparece una vez, sutil. Es la
// unica animacion decorativa de la pagina, a proposito — el aire y el contenido
// hacen el trabajo; mas movimiento restaria seriedad en vez de sumarla.
// Con prefers-reduced-motion no se observa nada y todo queda visible.
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.lx-reveal'))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((e) => e.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return
        e.target.classList.add('is-in')
        io.unobserve(e.target)   // una vez y se olvida: no parpadea al subir
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
}

// Aterrizaje en un ancla (#faq y compañía, que enlaza el pie). El salto que
// hace el navegador al cargar se queda corto: ocurre nada más parsear el HTML y
// justo después el carrusel, las ilustraciones y los vídeos cambian la altura de
// todo lo que hay por encima, así que acabas en mitad de otra sección. Se repite
// el salto cuando el diseño ya está asentado.
// Salto a una sección desde los enlaces del pie. Lo hacemos a mano por dos
// motivos, los dos comprobados en esta página:
//  1. El salto NATIVO no ocurre. Con el App Router montado, cambiar el
//     fragmento —por clic o asignando location.hash— actualiza la URL y ahí se
//     queda: la página no se mueve.
//  2. El desplazamiento SUAVE se cancela a medio camino. La página es larga y
//     no para quieta mientras baja (vídeos que arrancan, secciones que se
//     revelan), y el navegador aborta la animación. 'instant' llega siempre.
// Se conserva el href para que el clic central, "abrir en pestaña nueva" y el
// caso sin JavaScript sigan llevando al sitio correcto.
function scrollToSection(id: string) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id)
    if (!el) return                                   // sin destino, que actúe el href
    e.preventDefault()
    history.replaceState(null, '', `#${id}`)          // la URL queda compartible
    el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' })
  }
}

// Aterrizaje cuando se llega con un ancla en la URL (alguien comparte
// /#juegos). Un solo salto no basta: ocurre antes de que lleguen las
// ilustraciones del carrusel y los seis vídeos, y en cuanto crecen te quedas a
// mil píxeles de la sección. En vez de adivinar con temporizadores, se rehace
// el salto CADA VEZ que cambia la altura de la página, y se deja de vigilar a
// los cuatro segundos. Al primer gesto del visitante se cancela: si ya está
// moviéndose por su cuenta, seguir arrastrándolo sería pelearse con él.
function useHashLanding() {
  useEffect(() => {
    const hash = window.location.hash
    if (hash.length < 2) return
    let el: Element | null = null
    try { el = document.querySelector(hash) } catch { return }   // hash arbitrario
    if (!el) return

    const go = () => el!.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' })
    const ro = new ResizeObserver(go)
    const stop = () => cleanup()
    const cleanup = () => {
      ro.disconnect()
      clearTimeout(giveUp)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
    }

    const opts = { passive: true, once: true } as const
    window.addEventListener('wheel', stop, opts)
    window.addEventListener('touchstart', stop, opts)
    window.addEventListener('keydown', stop, { once: true })
    const giveUp = setTimeout(cleanup, 6000)

    go()
    ro.observe(document.body)
    return cleanup
  }, [])
}

// ── Home (auth gate) ──────────────────────────────────────────────────────────
// La landing se renderiza SIEMPRE, también en el servidor. Antes esta puerta
// devolvía <Splash/> hasta que zustand hidrataba, así que el HTML que salía del
// servidor no tenía ni el <h1> ni una línea de copy: Google recibía una pantalla
// con un logo, y el LCP esperaba a que cargara todo el JS.
//
// A quien ya tiene sesión lo saca de aquí el script de PREPAINT_REDIRECT (antes
// de pintar nada, sin fogonazo de landing). El efecto es la red de seguridad
// para cuando se llega por navegación de cliente, donde ese script no se ejecuta.
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const decide = () => {
      if (useAuthStore.getState().isAuthenticated()) router.replace('/dashboard')
    }
    const { hasHydrated } = useAuthStore.getState()
    if (hasHydrated) { decide(); return }
    const unsub = useAuthStore.subscribe((s) => {
      if (s.hasHydrated) { unsub(); decide() }
    })
    return () => unsub()
  }, [router])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
      <Landing />
    </>
  )
}

// Corre mientras el navegador parsea el HTML del servidor, antes del primer
// pintado (misma técnica que el script de tema de app/layout.tsx):
//
//  1. Sesión abierta → a /dashboard sin llegar a pintar la landing. `replace`
//     para no dejar basura en el historial: el botón Atrás no vuelve aquí.
//  2. Marca <html> con .lx-js. El revelado por scroll parte de opacity:0, así
//     que sin JS —o si el bundle falla— la página quedaba en blanco del hero
//     hacia abajo. Ahora ese estado inicial solo existe si hay JS para
//     deshacerlo, y como la clase se pone antes de pintar no hay parpadeo.
//  3. La landing SIEMPRE empieza arriba. El navegador restaura por su cuenta la
//     posición de scroll al recargar, y aquí eso quedaba mal por partida doble:
//     te saltabas el hero, y las secciones por encima —que arrancan en
//     opacity:0 hasta que el observador las revela— se quedaban en blanco, así
//     que la página parecía tener huecos. Hay que desactivar la restauración
//     ANTES de que ocurra, por eso va en este script y no en un efecto.
//     Salvo que la URL traiga un ancla (#faq y compañía, que enlaza el pie):
//     ahí el visitante ha pedido ir a un sitio concreto y mandarlo arriba sería
//     ignorarlo.
const PREPAINT = `try{document.documentElement.classList.add('lx-js');` +
  `if('scrollRestoration' in history)history.scrollRestoration='manual';` +
  `if(!location.hash)window.scrollTo(0,0);` +
  `var s=(JSON.parse(localStorage.getItem('daya-auth')||'{}')||{}).state||{};` +
  `if(s.token)location.replace('/dashboard')}catch(e){}`

// ══════════════════════════════════════════════════════════════════════════════
// LANDING — orden y ritmo de Google AI Studio, en oscuro:
//   hero centrado + carrusel full-bleed → demo jugable → modelos → cierre
//   → footer de columnas → wordmark gigante.
// Las secciones se separan solo con aire (AI Studio no usa divisores) y alternan
// centrado / alineado a la izquierda. AUTOCONTENIDA: solo tokens --lx-*.
// ══════════════════════════════════════════════════════════════════════════════

function Landing() {
  const t = useTranslations('landing2')
  const nav = useTranslations('nav')
  const f = useTranslations('footer')
  // Estas cuatro secciones ya estaban escritas y traducidas a los seis idiomas
  // en messages/*.json, sin usarse en ninguna pantalla.
  const ft = useTranslations('features')
  const hw = useTranslations('how')
  const wh = useTranslations('whom')
  const fq = useTranslations('faq')
  const [showPricing, setShowPricing] = useState(false)
  // La nav sticky solo muestra su hairline inferior cuando la página ya scrolleó
  // (igual que Google AI Studio: sin borde arriba del todo).
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useReveal()
  useHashLanding()

  return (
    <div className="lx-root">
      {/* Fondo negro Google AI Studio con campo de estrellas sutil */}
      <div className="lx-aurora" aria-hidden="true" />
      <div className="lx-stars" aria-hidden="true" />

      {/* Nav mínima */}
      <header className={`lx-nav${scrolled ? ' is-scrolled' : ''}`} role="banner">
          <Link href="/" className="lx-logo" aria-label={nav('logoAriaLabel')}>
            <img src="/logo.png" alt="" aria-hidden="true" />
            <span>Daya</span>
          </Link>
        <div className="lx-nav-right">
          <button className="lx-nav-link" onClick={() => setShowPricing(true)}>{nav('pricing')}</button>
          <span className="lx-lang"><LangSelector /></span>
          <Link href="/auth/login" className="lx-nav-link lx-nav-login">{nav('login')}</Link>
          <Link href="/auth/register" className="lx-btn lx-btn-sm">{nav('register')}</Link>
        </div>
      </header>

      {/* Orden Google: hero → secciones con cabecera propia → banda de cierre */}
      <main className="lx-main">
        {/* 1 · Hero: titular + carrusel full-bleed que sangra por los bordes
            (patrón exacto de AI Studio: las tarjetas se salen de la pantalla). */}
        <section className="lx-hero">
          <h1 className="lx-h1">
            {t('title1')}<span className="lx-grad">{t('titleGrad')}</span>{t('title2')}
          </h1>
          <p className="lx-sub">{t('subtitle')}</p>
          <div className="lx-ctas">
            <Link href="/auth/register" className="lx-btn lx-btn-lg">{t('ctaStart')}</Link>
            <Link href="/auth/login" className="lx-btn-ghost lx-btn-lg">{t('ctaLogin')}</Link>
          </div>
          <HeroReel />
        </section>

        {/* 2 · Qué hace Daya. El copy sale de messages/*.json (claves `features`),
            que ya estaba escrito y traducido a los seis idiomas pero no se
            usaba en ninguna pantalla. */}
        <section id="que-hace" className="lx-section lx-reveal" aria-labelledby="lx-feat-title">
          <div className="lx-sec-head">
            <h2 id="lx-feat-title" className="lx-sec-title">{ft('title')}</h2>
            <p className="lx-sec-lead">{ft('sub')}</p>
          </div>
          <div className="lx-feat-grid">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <article className={`lx-feat${i === 0 ? ' lx-feat--wide' : ''}`} key={i}>
                <span className="lx-feat-tag">{ft(`f${i}Tag`)}</span>
                <h3>{ft(`f${i}Title`)}</h3>
                <p>{ft(`f${i}Desc`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 3 · Cómo funciona (claves `how`): tres pasos numerados. */}
        <section id="como-funciona" className="lx-section lx-reveal" aria-labelledby="lx-how-title">
          <div className="lx-sec-head">
            <h2 id="lx-how-title" className="lx-sec-title">{hw('title')}</h2>
            <p className="lx-sec-lead">{hw('sub')}</p>
          </div>
          <ol className="lx-steps">
            {[0, 1, 2].map(i => (
              <li key={i}>
                <span className="lx-step-n">{i + 1}</span>
                <h3>{hw(`step${i}Title`)}</h3>
                <p>{hw(`step${i}Desc`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 4 · Los juegos, en video — título a la izquierda (patrón
            "Experiment with the latest models" de AI Studio).
            Aqui SOLO se enseñan: se juegan de verdad al iniciar sesion. */}
        <section id="juegos" className="lx-section lx-reveal" aria-labelledby="lx-games-title">
          <div className="lx-sec-head">
            <h2 id="lx-games-title" className="lx-sec-title">{t('gamesTitle')}</h2>
            <p className="lx-sec-lead">{t('gamesSub')}</p>
          </div>
          <GameReel />
        </section>

        {/* 5 · El enrutado de modelos — patrón "Start building with Gemini API":
            tarjetas planas de solo texto, sin imagen. Las tareas y descripciones
            están en landing2.r{i}Task/Desc. Los modelos concretos no se muestran;
            el usuario solo ve la tarea y lo que Daya hace con ella. */}
        <section id="modelos" className="lx-section lx-reveal" aria-labelledby="lx-models-title">
          <div className="lx-sec-head">
            <h2 id="lx-models-title" className="lx-sec-title">{t('modelsTitle')}</h2>
            <p className="lx-sec-lead">{t('modelsSub')}</p>
          </div>
          <div className="lx-flat-grid">
            {[0, 1, 2, 3].map(i => (
              <article className="lx-flat" key={i}>
                <h3>{t(`r${i}Task`)}</h3>
                <p>{t(`r${i}Desc`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 6 · Para quién es (claves `whom`). */}
        <section className="lx-section lx-reveal" aria-labelledby="lx-whom-title">
          <div className="lx-sec-head">
            <h2 id="lx-whom-title" className="lx-sec-title">{wh('title')}</h2>
            <p className="lx-sec-lead">{wh('sub')}</p>
          </div>
          <div className="lx-flat-grid lx-flat-grid--3">
            {[0, 1, 2].map(i => (
              <article className="lx-flat" key={i}>
                <h3>{wh(`w${i}Title`)}</h3>
                <p>{wh(`w${i}Desc`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 7 · Preguntas frecuentes (claves `faq`). <details> nativo: se abre y
            cierra sin JavaScript y el navegador ya lo hace accesible. */}
        <section id="faq" className="lx-section lx-reveal" aria-labelledby="lx-faq-title">
          <div className="lx-sec-head">
            <h2 id="lx-faq-title" className="lx-sec-title">{fq('title')}</h2>
            <p className="lx-sec-lead">{fq('sub')}</p>
          </div>
          <div className="lx-faq">
            {[0, 1, 2, 3, 4].map(i => (
              <details key={i}>
                <summary>
                  {fq(`q${i}`)}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </summary>
                <p>{fq(`a${i}`)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 8 · Built in the open — GitHub CTA */}
        <section className="lx-section lx-reveal">
          <div className="lx-sec-head">
            <h2 className="lx-sec-title">Built in the open</h2>
            <p className="lx-sec-lead">Free, open source, MIT licensed. The code is yours — star it, fork it, ship it.</p>
          </div>
          <div className="lx-gh-cta">
            <a href="https://github.com/juanyamels-eng/daya-ai" target="_blank" rel="noopener noreferrer" className="lx-btn lx-btn-lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12 24 5.37 18.63 0 12 0z"/></svg>
              Star on GitHub
            </a>
          </div>
        </section>

        {/* 9 · Cierre centrado (patrón "Bring your ideas to life") */}
        <section className="lx-closing lx-reveal">
          <h2 className="lx-closing-title">{t('closeTitle')}</h2>
          <p className="lx-closing-lead">{t('closeSub')}</p>
          <div className="lx-ctas">
            <Link href="/auth/register" className="lx-btn lx-btn-lg">{t('ctaStart')}</Link>
            <button className="lx-btn-ghost lx-btn-lg" onClick={() => setShowPricing(true)}>{nav('pricing')}</button>
          </div>
        </section>
      </main>

      {/* Footer AI Studio: CTA a la izquierda + columnas de enlaces, línea legal
          y wordmark gigante para cerrar. */}
      <footer className="lx-foot">
        <div className="lx-foot-grid">
          <div className="lx-foot-cta">
            <p className="lx-foot-claim">{f('tagline')}</p>
            <div className="lx-foot-btns">
              <Link href="/auth/register" className="lx-btn lx-btn-sm">{f('register')}</Link>
              <Link href="/auth/login" className="lx-btn-ghost lx-btn-sm">{f('login')}</Link>
            </div>
            {/* Aquí ponía hola@daya-ai.com y era una dirección MUERTA: el
                dominio no tiene registros MX —consultado a 8.8.8.8 devuelve solo
                SOA—, así que cada mensaje rebotaba sin que nadie se enterara.
                Este buzón sí recibe, y es el mismo al que escribe el formulario
                de /contact: una sola dirección, no dos que se desincronizan.
                El día que daya-ai.com acepte correo, esto vuelve a una dirección
                de marca — pero comprobando antes el DNS, no de memoria. */}
            <p className="lx-foot-mail">
              {f('writeUs')} <a href="mailto:support@daya-ai.com">support@daya-ai.com</a>
            </p>
          </div>
          {/* Anclas a las secciones de esta misma página: la columna Producto
              tenía dos enlaces y uno abría un modal. El desplazamiento lo hace
              scrollToSection (ver arriba: aquí el salto nativo no ocurre). */}
          <nav className="lx-foot-col" aria-label={f('colProduct')}>
            <h3>{f('colProduct')}</h3>
            <a href="#que-hace" onClick={scrollToSection('que-hace')}>{f('features')}</a>
            <a href="#como-funciona" onClick={scrollToSection('como-funciona')}>{f('linkHow')}</a>
            <a href="#juegos" onClick={scrollToSection('juegos')}>{f('linkGames')}</a>
            <a href="#modelos" onClick={scrollToSection('modelos')}>{f('linkModels')}</a>
            <button className="lx-foot-link" onClick={() => setShowPricing(true)}>{f('pricing')}</button>
          </nav>
          <nav className="lx-foot-col" aria-label={f('colCompany')}>
            <h3>{f('colCompany')}</h3>
            <a href="#faq" onClick={scrollToSection('faq')}>{f('linkFaq')}</a>
            <Link href="/about">{f('about')}</Link>
            <Link href="/blog">{f('blog')}</Link>
            <Link href="/code">Daya Code</Link>
            <Link href="/community">{f('community')}</Link>
            <Link href="/contact">{f('contact')}</Link>
          </nav>
          <nav className="lx-foot-col" aria-label={f('colLegal')}>
            <h3>{f('colLegal')}</h3>
            <Link href="/privacy">{f('privacy')}</Link>
            <Link href="/terms">{f('terms')}</Link>
            <Link href="/cookies">{f('cookies')}</Link>
          </nav>
        </div>
        <div className="lx-foot-bottom"><span className="lx-copy">{f('copy')}</span></div>
      </footer>

      {showPricing && <PricingModal onClose={() => setShowPricing(false)} />}
      <LandingStyles />
    </div>
  )
}

// ── Modal de precios (visitante, sin auth) ────────────────────────────────────
// Mantener EN SYNC con backend/src/config/plans.ts (getPublicPlans: FREE y PRO $13).
function PricingModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('landing2')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // preventScroll: enfocar un elemento hace que el navegador haga scroll hasta
    // él. Con el modal abierto y el cuerpo bloqueado, ese salto dejaba la página
    // en una posición arbitraria al cerrar.
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const freeItems = [t('freeF0'), t('freeF1'), t('freeF2'), t('freeF3'), t('freeF4')]
  const proItems = [t('proF0'), t('proF1'), t('proF2'), t('proF3'), t('proF4'), t('proF5')]

  return (
    <div className="lx-modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="lx-modal" role="dialog" aria-modal="true" aria-labelledby="lx-pricing-title">
        <button ref={closeRef} className="lx-modal-x" onClick={onClose} aria-label={t('close')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <h2 id="lx-pricing-title" className="lx-modal-title">{t('pricingTitle')}</h2>
        <p className="lx-modal-sub">{t('pricingSub')}</p>
        <div className="lx-plans">
          <div className="lx-plan">
            <div className="lx-plan-name">{t('freeName')}</div>
            <div className="lx-plan-price">$0<span>{t('perMonth')}</span></div>
            <ul>{freeItems.map(it => <li key={it}><Check />{it}</li>)}</ul>
            <Link href="/auth/register" className="lx-btn-ghost lx-plan-cta">{t('freeCta')}</Link>
          </div>
          <div className="lx-plan lx-plan--pro">
            <span className="lx-plan-badge">{t('proBadge')}</span>
            <div className="lx-plan-name">{t('proName')}</div>
            <div className="lx-plan-price">$13<span>{t('perMonth')}</span></div>
            <ul>{proItems.map(it => <li key={it}><Check />{it}</li>)}</ul>
            <Link href="/auth/register?plan=pro" className="lx-btn lx-plan-cta">{t('proCta')}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────
// dangerouslySetInnerHTML y no `<style>{...}`: React ESCAPA el texto hijo al
// serializar en el servidor (' → &#x27;, " → &quot;), pero <style> es un
// elemento de texto CRUDO y el navegador no decodifica esas entidades. El texto
// del servidor y el del cliente dejaban de coincidir y React descartaba TODO el
// HTML servido para volver a dibujar en el cliente (errores de hidratación #418
// y #422) — justo lo contrario de lo que buscaba el SSR. Bastaba una comilla en
// un comentario del CSS. Así el CSS sale idéntico en ambos lados.
function LandingStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .lx-root {
        /* Paleta neutra Google AI Studio (Material 3, oscuro): serio y minimalista.
           Sin degradados; separación por contraste #131314 / #1e1e1f / borde #444746. */
        --lx-bg: #131314;
        --lx-ink: #e3e3e3;
        --lx-accent: #f1f3f4;
        --lx-green: #9aa0a6;
        --lx-text: #e3e3e3;
        --lx-text-2: #c4c7c5;
        --lx-text-3: #9aa0a6;
        --lx-card: #1e1e1f;
        --lx-card-hover: #282a2c;
        --lx-border: #444746;
        --lx-grad: #ffffff;
        position: relative; min-height: 100dvh; overflow-x: hidden;
        display: flex; flex-direction: column;
        background: var(--lx-bg); color: var(--lx-text);
        /* La VOZ de la landing: sans limpia (Inter), la misma del producto. La
           mono queda reservada para etiquetas técnicas y números (ver .lx-feat-tag
           y .lx-step-n), como en Stripe/Linear. */
        font-family: var(--font-sans, system-ui, sans-serif);
        -webkit-font-smoothing: antialiased;
      }
      .lx-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      /* ── Fondo vivo ────────────────────────────────────────────────────
         Antes las estrellas eran estáticas y se enmascaraban al hero, así que
         de media página hacia abajo el fondo era negro plano. Ahora la capa va
         'fixed' (acompaña todo el scroll) y se mueve.

         Dos capas de estrellas a distinta velocidad = paralaje. Se animan con
         'transform' sobre un pseudo-elemento del doble de alto, no con
         'background-position': así el trabajo se queda en la GPU y no repinta
         en cada frame. Al recorrer exactamente el 50% de su alto el patrón
         vuelve a caer en fase, y el bucle no tiene costura. */
      .lx-stars { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
      .lx-stars::before, .lx-stars::after {
        content: ''; position: absolute; left: 0; right: 0; top: 0; height: 200%;
        will-change: transform; }
      .lx-stars::before { opacity: 0.55;
        background-image: radial-gradient(rgba(255,255,255,0.11) 1px, transparent 1.4px);
        background-size: 78px 78px;
        animation: lxDrift 150s linear infinite; }
      .lx-stars::after { opacity: 0.4;
        background-image: radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.4px);
        background-size: 52px 52px; background-position: 26px 32px;
        animation: lxDrift 90s linear infinite; }
      @keyframes lxDrift { from { transform: translate3d(0,0,0); } to { transform: translate3d(0,-50%,0); } }

      /* Resplandor de marca: dos manchas violeta muy tenues que respiran y se
         desplazan. El fondo deja de ser negro muerto sin romper la paleta
         neutra — a 0.06 de alfa se percibe como profundidad, no como color. */
      .lx-aurora { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
        filter: blur(80px); }
      .lx-aurora::before, .lx-aurora::after {
        content: ''; position: absolute; width: 46vw; height: 46vw; border-radius: 50%;
        will-change: transform; }
      .lx-aurora::before { top: -12vw; left: -6vw;
        background: radial-gradient(circle, rgba(var(--brand-rgb),0.06), transparent 68%);
        animation: lxFloatA 34s ease-in-out infinite; }
      .lx-aurora::after { bottom: -16vw; right: -8vw;
        background: radial-gradient(circle, rgba(var(--brand-rgb),0.045), transparent 68%);
        animation: lxFloatB 44s ease-in-out infinite; }
      @keyframes lxFloatA {
        0%, 100% { transform: translate3d(0,0,0) scale(1); }
        50% { transform: translate3d(9vw,7vw,0) scale(1.14); } }
      @keyframes lxFloatB {
        0%, 100% { transform: translate3d(0,0,0) scale(1.1); }
        50% { transform: translate3d(-11vw,-6vw,0) scale(1); } }

      /* Un fondo que se mueve solo es justo lo que marea a quien pide menos
         movimiento: se congela, pero se conserva (no desaparece el ambiente). */
      @media (prefers-reduced-motion: reduce) {
        .lx-stars::before, .lx-stars::after,
        .lx-aurora::before, .lx-aurora::after { animation: none; } }

      /* ── Nav (sticky, hairline solo al scrollear) ── */
      .lx-nav { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between;
        width: 100%; padding: 14px max(32px, calc((100% - 1200px) / 2));
        background: rgba(19,19,20,0.72); backdrop-filter: blur(12px);
        border-bottom: 1px solid transparent; transition: border-color 0.2s, background 0.2s; }
      .lx-nav.is-scrolled { border-bottom-color: var(--lx-border); background: rgba(19,19,20,0.9); }
      .lx-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; color: var(--lx-text); }
      .lx-logo img { width: 26px; height: 26px; object-fit: contain; filter: invert(1) brightness(1.15); }
      .lx-logo span { font-size: 0.98rem; font-weight: 650; letter-spacing: -0.02em; }

      .lx-nav-right { display: flex; align-items: center; gap: 8px; }
      .lx-nav-link { display: inline-flex; align-items: center; padding: 9px 14px; border-radius: 999px;
        background: transparent; border: none; cursor: pointer; text-decoration: none;
        color: var(--lx-text-2); font-size: 0.79rem; font-weight: 500; font-family: inherit; letter-spacing: -0.02em; transition: color 0.15s, background 0.15s; }
      .lx-nav-link:hover { color: var(--lx-text); background: rgba(255,255,255,0.07); }
      /* El LangSelector consume las variables globales del tema claro: ya coinciden */
      .lx-lang { display: inline-flex; }

      /* ── Botones ── */
      .lx-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; border: none; cursor: pointer;
        background: var(--lx-accent); color: #131314; font-weight: 600; font-family: inherit; letter-spacing: -0.025em; text-decoration: none;
        white-space: nowrap; border-radius: 999px; transition: background 0.2s, filter 0.15s; }
      .lx-btn:hover { filter: brightness(1.08); }
      .lx-btn:active { filter: brightness(0.96); }
      .lx-btn-sm { padding: 10px 18px; font-size: 0.85rem; }
      .lx-btn-lg { padding: 14px 28px; font-size: 0.95rem; }
      .lx-btn-ghost { display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        background: transparent; color: var(--lx-text); font-weight: 600; font-family: inherit; letter-spacing: -0.025em; text-decoration: none;
        border: 1px solid var(--lx-border); border-radius: 999px; transition: background 0.2s, border-color 0.2s; }
      .lx-btn-ghost:hover { background: var(--lx-card-hover); border-color: #5f6368; }

      /* ── Main: ritmo vertical por secciones (estilo Google) ──
         Una sola escala de espacio entre bloques: el aire hace la jerarquía. */
      .lx-main { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column;
        align-items: stretch; max-width: 1200px; width: 100%; margin: 0 auto; padding: 0 32px; }
      /* ── Carrusel full-bleed del hero ──
         Sangra a todo el ancho de la ventana rompiendo el carril de 1200px
         (el overflow-x:hidden de .lx-root evita la barra horizontal). */
      .lx-reel { position: relative; width: 100vw; margin-left: calc(50% - 50vw);
        margin-top: clamp(48px, 6vw, 80px); overflow: hidden;
        -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
        mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
      .lx-reel-track { display: flex; gap: 16px; width: max-content; padding: 4px 8px;
        animation: lxReel 46s linear infinite; }
      .lx-reel:hover .lx-reel-track { animation-play-state: paused; }
      /* La pista contiene 2 copias: -50% = exactamente una vuelta */
      @keyframes lxReel { to { transform: translateX(-50%); } }
      .lx-reel-card { position: relative; flex: none; margin: 0; overflow: hidden; border-radius: 16px;
        width: clamp(210px, 22vw, 300px); aspect-ratio: 4 / 5;
        background: var(--lx-card); border: 1px solid var(--lx-border);
        box-shadow: 0 20px 50px -24px rgba(0,0,0,0.85); }
      .lx-reel-card img, .lx-reel-card video { width: 100%; height: 100%; object-fit: cover; display: block; }

      /* Mas lento que el de fotos: hay que darle tiempo a ver la partida. */
      .lx-reel-track--slow { animation-duration: 68s; }
      /* El margen superior de .lx-reel es para cerrar el hero; aqui ya lo pone
         la cabecera de seccion y sumarlos abre un hueco enorme. */
      .lx-reel--games { margin-top: 0; }
      .lx-reel-card figcaption i { font-style: normal; margin-left: 7px; color: var(--lx-text-3); font-weight: 500; }
      .lx-reel-card figcaption { position: absolute; left: 12px; bottom: 12px;
        font-size: 0.72rem; font-weight: 500; color: #f8f9fa;
        background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
        border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 5px 12px; }

      /* AI Studio NO usa líneas entre secciones: el separador es el aire. */
      /* scroll-margin-top: las secciones son destino de los enlaces del pie y la
         nav es sticky; sin esto el titular queda debajo de la barra. */
      .lx-section { display: flex; flex-direction: column; align-items: stretch; text-align: left;
        padding: clamp(72px, 10vw, 140px) 0 0; scroll-margin-top: 76px; }

      /* Cabecera de sección: título grande a la izquierda, sin eyebrow en
         mayúsculas (Google no los usa: va directo al titular). */
      .lx-sec-head { max-width: 62ch; margin-bottom: clamp(28px, 4vw, 44px); }
      .lx-sec-title { margin: 0; color: #f8f9fa; font-weight: 650;
        font-size: clamp(1.55rem, 3vw, 2.3rem); line-height: 1.16; letter-spacing: -0.025em; text-wrap: balance; }
      .lx-sec-lead { margin: 14px 0 0; color: var(--lx-text-2); font-size: 0.9rem; line-height: 1.72; max-width: 58ch; }

      /* Tarjetas planas de solo texto (patrón "Start building with Gemini API"):
         sin borde ni imagen, se separan del fondo únicamente por la superficie. */
      .lx-flat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
      .lx-flat-grid--3 { grid-template-columns: repeat(3, 1fr); }
      .lx-flat { display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
        padding: 24px 22px 22px; border-radius: 16px; background: var(--lx-card);
        transition: background 0.18s; }
      .lx-flat:hover { background: var(--lx-card-hover); }
      .lx-flat h3 { margin: 0; color: #f8f9fa; font-size: 0.94rem; font-weight: 650; letter-spacing: -0.02em; }
      .lx-flat p { margin: 0; flex: 1; color: var(--lx-text-2); font-size: 0.8rem; line-height: 1.68; }


      /* ── Qué hace: rejilla asimétrica. La primera ocupa dos huecos porque su
         texto es el más largo y en una celda estrecha se convertía en un
         chorro de líneas cortas. ── */
      .lx-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
      .lx-feat { display: flex; flex-direction: column; align-items: flex-start; gap: 9px;
        padding: 26px 24px; border-radius: 16px; background: var(--lx-card);
        border: 1px solid transparent; transition: background 0.18s, border-color 0.18s; }
      .lx-feat:hover { background: var(--lx-card-hover); border-color: var(--lx-border); }
      .lx-feat--wide { grid-column: span 2; }
      /* Etiqueta técnica: en mono, versalita con tracking abierto — el guiño
         "terminal" que en sans se pierde. */
      .lx-feat-tag { color: var(--lx-text-3); font-size: 0.64rem; font-weight: 500;
        letter-spacing: 0.12em; text-transform: uppercase; font-family: var(--font-mono, ui-monospace, monospace); }
      .lx-feat h3 { margin: 0; color: #f8f9fa; font-size: 1rem; font-weight: 650;
        line-height: 1.3; letter-spacing: -0.012em; }
      .lx-feat p { margin: 0; color: var(--lx-text-2); font-size: 0.9rem; line-height: 1.6; }

      /* ── Cómo funciona: tres pasos numerados ── */
      .lx-steps { list-style: none; margin: 0; padding: 0;
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
      .lx-steps li { position: relative; padding-top: 22px; border-top: 1px solid var(--lx-border); }
      .lx-step-n { display: inline-flex; align-items: center; justify-content: center;
        width: 26px; height: 26px; margin-bottom: 14px; border-radius: 50%;
        border: 1px solid var(--lx-border); color: var(--lx-text-2);
        font-size: 0.76rem; font-weight: 600; font-family: var(--font-mono, ui-monospace, monospace); }
      .lx-steps h3 { margin: 0 0 8px; color: #f8f9fa; font-size: 0.96rem; font-weight: 650; letter-spacing: -0.02em; }
      .lx-steps p { margin: 0; color: var(--lx-text-2); font-size: 0.9rem; line-height: 1.6; }

      /* ── Preguntas frecuentes ── */
      .lx-faq { border-top: 1px solid var(--lx-border); }
      .lx-faq details { border-bottom: 1px solid var(--lx-border); }
      .lx-faq summary { display: flex; align-items: center; justify-content: space-between; gap: 20px;
        padding: 20px 2px; cursor: pointer; list-style: none;
        color: #f8f9fa; font-size: 1rem; font-weight: 500; transition: color 0.15s; }
      .lx-faq summary::-webkit-details-marker { display: none; }
      .lx-faq summary:hover { color: var(--lx-text-2); }
      .lx-faq summary svg { flex: none; color: var(--lx-text-3); transition: transform 0.2s; }
      .lx-faq details[open] summary svg { transform: rotate(180deg); }
      .lx-faq details p { margin: 0; padding: 0 2px 22px; max-width: 78ch;
        color: var(--lx-text-2); font-size: 0.92rem; line-height: 1.65; }

      /* Revelado al entrar en pantalla (ver useReveal).
         Colgado de .lx-js —que pone el script de prepaint en <html>— para que el
         estado inicial invisible solo exista si hay JS que pueda revelarlo: sin
         él, la página se veía entera menos todo lo que hay bajo el hero. */
      .lx-js .lx-reveal { opacity: 0; transform: translateY(18px);
        transition: opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1); }
      .lx-js .lx-reveal.is-in { opacity: 1; transform: none; }

      /* Cierre centrado: rompe la alineación izquierda para rematar con la CTA */
      .lx-closing { display: flex; flex-direction: column; align-items: center; text-align: center;
        padding: clamp(96px, 13vw, 180px) 0 clamp(72px, 9vw, 120px); }
      .lx-closing-title { margin: 0; color: #f8f9fa; font-weight: 650;
        font-size: clamp(1.7rem, 3.4vw, 2.5rem); line-height: 1.14; letter-spacing: -0.025em; text-wrap: balance; }
      .lx-closing-lead { margin: 14px 0 30px; color: var(--lx-text-2); font-size: 1rem; line-height: 1.6; }
      /* Sin padding inferior: el carrusel es el que cierra el hero. */
      .lx-hero { display: flex; flex-direction: column; align-items: center; text-align: center;
        padding: clamp(56px, 8vw, 104px) 0 0;
        animation: lxUp 0.7s cubic-bezier(0.16,1,0.3,1) both; }
      .lx-sub { margin-left: auto; margin-right: auto; }
      .lx-h1 { font-weight: 650; color: #f8f9fa;
        font-size: clamp(2.05rem, 4.4vw, 3.6rem); line-height: 1.08; letter-spacing: -0.03em; margin: 0 0 20px; text-wrap: balance; }
      .lx-grad { background: var(--lx-grad);
        -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 0.04em; }
      /* Texto corrido: interlínea alta y medida corta para leer cómodo. */
      .lx-sub { color: var(--lx-text-2); font-size: 0.95rem; line-height: 1.72; max-width: 52ch; margin: 0 0 30px; }
      .lx-ctas { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; }
      @keyframes lxUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }


      /* ── Modal de precios ── */
      .lx-modal-bg { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
        padding: 22px; background: rgba(3,2,8,0.66); backdrop-filter: blur(7px); animation: lxFade 0.2s ease both; }
      @keyframes lxFade { from { opacity: 0; } }
      .lx-modal { position: relative; width: min(760px, 100%); max-height: 90dvh; overflow-y: auto; border-radius: 16px;
        background: var(--lx-card); border: 1px solid var(--lx-border); padding: 34px 34px 30px;
        animation: lxPop 0.28s cubic-bezier(0.16,1,0.3,1) both; }
      @keyframes lxPop { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: none; } }
      .lx-modal-x { position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 999px;
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        background: rgba(255,255,255,0.05); border: 1px solid var(--lx-border); color: var(--lx-text-2); transition: all 0.15s; }
      .lx-modal-x:hover { color: var(--lx-text); background: rgba(255,255,255,0.1); }
      .lx-modal-title { font-weight: 740;
        font-size: 1.55rem; letter-spacing: -0.025em; margin: 0 0 6px; color: var(--lx-ink); }
      .lx-modal-sub { color: var(--lx-text-2); font-size: 0.9rem; margin: 0 0 24px; }
      .lx-plans { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .lx-plan { position: relative; border-radius: 12px; padding: 24px; display: flex; flex-direction: column;
        background: #131314; border: 1px solid var(--lx-border); }
      .lx-plan--pro { border-color: var(--lx-accent); background: rgba(138,180,248,0.06); }
      .lx-plan-badge { position: absolute; top: -10px; right: 18px; padding: 4px 12px; border-radius: 999px;
        background: var(--lx-accent); color: #131314; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      .lx-plan-name { font-weight: 800; font-size: 0.95rem; margin-bottom: 4px; }
      .lx-plan-price { font-size: 2.1rem; font-weight: 750; letter-spacing: -0.025em; margin-bottom: 14px; color: var(--lx-ink); }
      .lx-plan-price span { font-size: 0.85rem; font-weight: 500; letter-spacing: 0; color: var(--lx-text-3); }
      .lx-plan ul { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 10px; flex: 1; }
      .lx-plan li { display: flex; align-items: flex-start; gap: 8px; font-size: 0.84rem; color: var(--lx-text-2); line-height: 1.45; }
      .lx-plan li svg { color: var(--lx-green); flex-shrink: 0; margin-top: 4px; }
      .lx-plan-cta { padding: 12px; font-size: 0.9rem; border-radius: 999px; }

      /* ── GitHub CTA ── */
      .lx-gh-cta { margin-top: 8px; }
      .lx-gh-cta .lx-btn { display: inline-flex; gap: 8px; background: var(--lx-accent); color: #131314; }
      .lx-gh-cta .lx-btn:hover { filter: brightness(1.08); }

      /* ── Línea legal ── */
      .lx-foot { position: relative; z-index: 1; width: 100%; overflow: hidden;
        padding: clamp(48px, 6vw, 80px) max(32px, calc((100% - 1200px) / 2)) clamp(28px, 3vw, 44px);
        border-top: 1px solid var(--lx-border); }
      /* CTA ancha a la izquierda + 3 columnas de enlaces a la derecha */
      .lx-foot-grid { display: grid; grid-template-columns: 1.6fr repeat(3, 1fr); gap: 40px 32px; }
      .lx-foot-claim { margin: 0 0 18px; max-width: 22ch; color: #f8f9fa;
        font-size: clamp(1.1rem, 1.7vw, 1.35rem); font-weight: 400; line-height: 1.3; letter-spacing: -0.015em; }
      .lx-foot-btns { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .lx-foot-mail { margin: 18px 0 0; color: var(--lx-text-3); font-size: 0.78rem; line-height: 1.6; }
      .lx-foot-mail a { color: var(--lx-text-2); text-decoration: none;
        border-bottom: 1px solid var(--lx-border); transition: color 0.15s, border-color 0.15s; }
      .lx-foot-mail a:hover { color: var(--lx-text); border-color: var(--lx-text-3); }
      .lx-foot-col { display: flex; flex-direction: column; align-items: flex-start; gap: 11px; }
      .lx-foot-col h3 { margin: 0 0 3px; color: var(--lx-text); font-size: 0.92rem; font-weight: 500; }
      .lx-foot-col a, .lx-foot-link { color: var(--lx-text-3); font-size: 0.86rem; text-decoration: none;
        background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; text-align: left;
        transition: color 0.15s; }
      .lx-foot-col a:hover, .lx-foot-link:hover { color: var(--lx-text); }
      .lx-foot-bottom { margin-top: clamp(40px, 5vw, 64px); padding-top: 20px; border-top: 1px solid var(--lx-border); }
      .lx-copy { color: var(--lx-text-3); font-size: 0.72rem; }

      /* ── Responsive ── */
      @media (max-width: 900px) {
        .lx-root { height: auto; min-height: 100dvh; overflow-y: auto; grid-template-rows: 56px 1fr auto; }
        .lx-main { padding: 0 20px; }
        .lx-sub { margin-left: auto; margin-right: auto; }
        .lx-ctas { justify-content: center; }
        .lx-nav { padding: 12px 20px; }
        .lx-nav-login { display: none; }
        .lx-nav-right { gap: 4px; }
        .lx-foot { padding: 48px 20px 28px; }
        .lx-flat-grid, .lx-flat-grid--3 { grid-template-columns: 1fr 1fr; }
        .lx-feat-grid { grid-template-columns: 1fr 1fr; }
        .lx-feat--wide { grid-column: span 2; }
        .lx-steps { grid-template-columns: 1fr; gap: 22px; }
        .lx-foot-grid { grid-template-columns: 1fr 1fr; gap: 32px 20px; }
        .lx-foot-cta { grid-column: 1 / -1; }
        .lx-plans { grid-template-columns: 1fr; }
      }
      /* En pantallas estrechas la nav solo lleva logo + registro: "Precios"
         sigue disponible en el bloque de cierre y en el footer. */
      @media (max-width: 560px) {
        .lx-nav-right .lx-nav-link { display: none; }
        .lx-btn-sm { padding: 9px 15px; font-size: 0.8rem; }
        /* A dos columnas el texto se parte demasiado: una sola. */
        .lx-flat-grid, .lx-flat-grid--3, .lx-feat-grid { grid-template-columns: 1fr; }
        .lx-feat--wide { grid-column: auto; }
      }
      @media (max-height: 700px) and (min-width: 901px) {
        .lx-root { height: auto; min-height: 100dvh; overflow-y: auto; }
      }

      /* ── Reduced motion: todo estático en su estado FINAL ── */
      @media (prefers-reduced-motion: reduce) {
        .lx-root *, .lx-root *::before, .lx-root *::after { animation: none !important; transition: none !important; }
      }
    ` }} />
  )
}
