/* ============================================================================
   ARCADE — 6 juegos en canvas, sin una sola dependencia.

     2D        Plataformas · Ladrillos
     3D        Laberinto 3D (raycasting DDA) · Circuito (proyección de segmentos)
     Modernos  Superviviente (oleadas tipo roguelite) · Neón (rejilla elástica)

   Los dos de 3D no usan WebGL ni librerías: la perspectiva está calculada a
   mano sobre el canvas 2D. El laberinto lanza un rayo por columna de píxeles y
   el circuito proyecta segmentos de carretera con curva y desnivel.

   Cada factory devuelve:
     reset(W, H)          al montar y en cada redimensionado
     update(dt, W, H)     dt en milisegundos
     draw(ctx, W, H)      ctx ya escalado a DPR: W/H son pixeles CSS
     key(k, down)         'up'|'down'|'left'|'right'|'fire'
     pointer(x, y)        mover el puntero (opcional)
     tap(x, y)            pulsar (opcional; distinto de mover, ver GameCanvas)
     state()              solo para pruebas: permite verificar que responde

   REGLA: todo se compone a partir de W y H. El mismo juego tiene que llenar el
   marco 4:5 de las tarjetas y el 16:10 del panel del login.

   Todos arrancan en piloto automatico y lo sueltan al pulsar una tecla; vuelve
   tras 18 s de inactividad.

   COLOR: cada juego tiene su paleta y son lo unico con color de todo el sitio,
   que es gris a proposito. Asi las seis tarjetas se distinguen de un vistazo y
   el color queda donde aporta. La profundidad se sigue haciendo con luminosidad
   —oscurecer con la distancia—; el tono solo identifica.
   ========================================================================== */

const INK = '#e3e3e3'
const DIM = '#9aa0a6'

function autopilot() {
  let idle = 0
  return {
    touch() { idle = 18000 },
    tick(dt) { if (idle > 0) idle -= dt },
    get on() { return idle <= 0 },
  }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t

/* Oscurece un color hacia la niebla del fondo. `t` = 1 cerca, 0 lejos.
   Es lo que convierte una pared plana de color en una pared con distancia. */
const fogged = (rgb, t, fog = [16, 18, 28]) => {
  const k = clamp(t, 0, 1)
  const r = (rgb[0] * k + fog[0] * (1 - k)) | 0
  const g = (rgb[1] * k + fog[1] * (1 - k)) | 0
  const b = (rgb[2] * k + fog[2] * (1 - k)) | 0
  return `rgb(${r},${g},${b})`
}

/* BLOOM de postproceso real, sin WebGL: el fotograma se copia a 1/4 y luego
   a 1/8 (el doble reescalado bilineal hace de desenfoque gaussiano gratis) y
   se suma encima en modo 'lighter'. Lo brillante rebosa luz como en un juego
   moderno; lo oscuro apenas aporta, asi que el fondo no se lava. Los lienzos
   de trabajo son compartidos: cada draw los usa de forma sincrona. */
let _b1 = null, _b2 = null
function bloom(ctx, w, h, fuerza) {
  try {
    if (!_b1) { _b1 = document.createElement('canvas'); _b2 = document.createElement('canvas') }
    const c = ctx.canvas
    const w1 = Math.max(1, c.width >> 2), h1 = Math.max(1, c.height >> 2)
    const w2 = Math.max(1, c.width >> 3), h2 = Math.max(1, c.height >> 3)
    if (_b1.width !== w1 || _b1.height !== h1) { _b1.width = w1; _b1.height = h1 }
    if (_b2.width !== w2 || _b2.height !== h2) { _b2.width = w2; _b2.height = h2 }
    const g1 = _b1.getContext('2d'), g2 = _b2.getContext('2d')
    g1.clearRect(0, 0, w1, h1)
    g1.drawImage(c, 0, 0, w1, h1)
    g2.clearRect(0, 0, w2, h2)
    g2.drawImage(_b1, 0, 0, w2, h2)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = fuerza
    ctx.drawImage(_b2, 0, 0, w, h)
    ctx.restore()
  } catch {}
}

/* Bleeps retro sintetizados con WebAudio: cero archivos y cero red, asi que
   no pesan nada. SOLO suenan con una persona a los mandos (los llama cada
   juego tras comprobar `humano`): la demo del piloto es muda, y de paso se
   cumple la politica de autoplay — el contexto de audio nace tras un gesto.
   En cabinas sin audio (headless, CI) el try/catch lo apaga sin romper. */
const sfx = (() => {
  let actx = null
  const ac = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)())
  const beep = (f0, f1, dur, type = 'square', vol = 0.1, delay = 0) => {
    try {
      const a = ac(), t = a.currentTime + delay
      const o = a.createOscillator(), g = a.createGain()
      o.type = type
      o.frequency.setValueAtTime(Math.max(1, f0), t)
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      o.connect(g); g.connect(a.destination)
      o.start(t); o.stop(t + dur)
    } catch {}
  }
  return {
    coin: (mult = 1) => beep(880 * (1 + 0.12 * (mult - 1)), 1320 * (1 + 0.12 * (mult - 1)), 0.09, 'square', 0.08),
    jump: () => beep(240, 540, 0.11, 'triangle', 0.09),
    hit: () => beep(660, 430, 0.05, 'square', 0.06),
    boom: () => beep(190, 45, 0.24, 'sawtooth', 0.12),
    level: () => { beep(523, 523, 0.09); beep(659, 659, 0.09, 'square', 0.1, 0.09); beep(784, 784, 0.13, 'square', 0.1, 0.18) },
    over: () => beep(620, 930, 0.08, 'triangle', 0.07),
    fin: () => beep(392, 90, 0.5, 'sawtooth', 0.11),
    record: () => { beep(659, 659, 0.1); beep(784, 784, 0.1, 'square', 0.1, 0.1); beep(1047, 1047, 0.22, 'square', 0.11, 0.2) },
  }
})()

/* Record por juego, en localStorage. Solo cuenta con una persona a los
   mandos: el piloto automatico jugaria toda la noche y dejaria records
   imposibles de batir, y un record imbatible mata las ganas de intentarlo. */
const record = {
  get(id) { try { return Number(localStorage.getItem('daya-arcade-best-' + id)) || 0 } catch { return 0 } },
  set(id, v) { try { localStorage.setItem('daya-arcade-best-' + id, String(Math.floor(v))) } catch {} },
}

/* Cartel de fin de partida: puntos, record y si se ha batido. Es el bucle del
   arcade — morir, comparar, "otra vez" — que antes no existia: la muerte era
   una multa de puntos y la partida seguia como si nada. */
function finBanner(ctx, W, H, fin) {
  const a = clamp(fin.life / 600, 0, 1)
  ctx.globalAlpha = a
  const bw = Math.min(W * 0.82, 310), bh = 74
  const x = (W - bw) / 2, y = H * 0.33
  ctx.fillStyle = 'rgba(10,11,18,0.88)'
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 12)
  else ctx.rect(x, y, bw, bh)
  ctx.fill()
  ctx.strokeStyle = fin.nuevo ? 'rgba(255,212,94,0.55)' : 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = fin.nuevo ? '#ffd45e' : INK
  ctx.font = '700 13px ui-monospace, monospace'
  ctx.fillText(fin.nuevo ? '¡RÉCORD NUEVO!' : 'FIN DE LA PARTIDA', W / 2, y + 28)
  ctx.fillStyle = DIM
  ctx.font = '600 12px ui-monospace, monospace'
  ctx.fillText(`${fin.pts} pts · mejor ${fin.rec}`, W / 2, y + 52)
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1
}

function hud(ctx, left, right, W, tint) {
  ctx.font = '600 11px ui-monospace, monospace'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = tint || DIM
  ctx.fillText(left, 10, 9)
  if (right) { ctx.textAlign = 'right'; ctx.fillStyle = DIM; ctx.fillText(right, W - 10, 9) }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/* ══════════════════════════ 1 · 2D · PLATAFORMAS ══════════════════════════ */
export function createPlatformer() {
  const ap = autopilot()
  const ROWS = 13
  const VENTANA = 220     // columnas vivas a la vez
  const TIRADA = 30       // cuantas se reciclan cada vez
  let W = 1, H = 1, cell, cols, map, coins, spikes
  let gSuelo, gCalma, gIndex   // estado del generador, persistente entre tandas
  let px, py, vx, vy, onGround, cam, pts, anim, held, deaths = 0, stuck = 0, lastPx = 0, muerteX = -1e9, bucle = 0
  let pops   // "+50" flotantes al coger moneda: el premio se ve donde ocurre
  let fx     // particulas: polvo al aterrizar, chispas de moneda, golpe al morir
  let humano = false, rec = 0, batio = false, fin = null   // partida humana y record

  const solid = (c, r) => {
    if (c < 0 || c >= cols || r < 0) return false
    if (r >= ROWS) return false
    return map[c][r] === 1
  }

  // Genera UNA columna al final del mundo, continuando el estado anterior.
  // `gCalma` mantiene el suelo llano unas columnas tras cada cambio de altura
  // (y bajo los arcos de monedas), para que siempre haya carrerilla.
  const columna = () => {
    const c = map.length
    const col = Array(ROWS).fill(0)
    map.push(col)
    if (gCalma > 0) gCalma--
    if (gIndex > 8 && gCalma === 0 && Math.random() < 0.13) {
      gSuelo = clamp(gSuelo + (Math.random() < 0.5 ? -1 : 1), ROWS - 6, ROWS - 2)
      gCalma = 2
    }
    for (let r = gSuelo; r < ROWS; r++) col[r] = 1
    // Suelo continuo a proposito: los huecos eran el 100% de las caidas y
    // ninguna regla de salto los resolvia siempre. Quedan escalones y pinchos.
    // Densidad de pinchos FIJA a proposito: se probo subirla con la distancia
    // (0.045-0.062) y el piloto, que decide mirando 2 celdas por delante,
    // pasaba de 0 muertes a 6-7 en dos minutos. La dificultad progresiva vive
    // solo en la velocidad, que el salto simulado si absorbe.
    if (gIndex > 14 && gCalma === 0 && Math.random() < 0.032) spikes.push({ c, r: gSuelo - 1 })
    // 0.24 de monedas (antes 0.16): con menos, la camara pasaba tramos enteros
    // sin nada que coger y el paseo parecia un desierto.
    else if (gIndex > 6 && Math.random() < 0.24) coins.push({ c, r: gSuelo - 1, got: 0 })
    if (gIndex > 16 && gIndex % 16 === 0) {
      for (let k = 0; k < 5; k++) {
        coins.push({ c: c + k, r: gSuelo - 2 - Math.round(Math.sin((k / 4) * Math.PI) * 2), got: 0 })
      }
      gCalma = 6   // suelo llano bajo todo el arco
    }
    gIndex++
  }

  const build = () => {
    map = []; coins = []; spikes = []
    gSuelo = ROWS - 3; gCalma = 0; gIndex = 0
    for (let i = 0; i < VENTANA; i++) columna()
    cols = map.length
  }

  // Recicla el mundo: tira las columnas de atras, genera otras tantas delante y
  // desplaza todo hacia atras. Asi no hay final — antes el nivel se acababa y
  // el personaje aparecia de golpe en el principio.
  const reciclar = () => {
    map.splice(0, TIRADA)
    for (let i = 0; i < TIRADA; i++) columna()
    cols = map.length
    const d = TIRADA * cell
    px -= d; cam -= d; lastPx -= d; muerteX -= d
    for (const k of coins) k.c -= TIRADA
    for (const k of spikes) k.c -= TIRADA
    for (const k of fx) k.x -= d
    for (const k of pops) k.x -= d
    coins = coins.filter((k) => k.c >= 0)
    spikes = spikes.filter((k) => k.c >= 0)
  }

  const reset = (w, h) => {
    W = w; H = h
    cell = H / ROWS
    build()
    px = cell * 3; py = cell * (ROWS - 4); vx = 0; vy = 0
    onGround = false; cam = 0; pts = 0; anim = 0; stuck = 0; lastPx = px; muerteX = -1e9; bucle = 0
    held = { left: 0, right: 0 }
    pops = []; fx = []
    rec = record.get('platformer')
  }

  const jump = () => { if (onGround) { vy = -Math.min(820, H * 2.35); onGround = false; if (humano) sfx.jump() } }

  return {
    reset,
    state: () => ({ px, py, vx, pts, deaths, screenX: px - cam, cols }),
    key(k, down) {
      ap.touch()
      if (k === 'up' || k === 'fire') { if (down) jump(); return }
      if (k in held) held[k] = down ? 1 : 0
    },
    tap() { ap.touch(); jump() },
    update(dt, w, h) {
      if (w !== W || h !== H) reset(w, h)
      ap.tick(dt)
      // La partida humana empieza de cero al tomar el control: un record con
      // puntos heredados del piloto no seria de nadie.
      if (ap.on) humano = false
      else if (!humano) { humano = true; pts = 0; batio = false }
      if (humano && Math.floor(pts) > rec) { rec = Math.floor(pts); record.set('platformer', rec); batio = true }
      if (fin && (fin.life -= dt) <= 0) fin = null
      const s = Math.min(dt, 34) / 1000
      anim += dt

      let want
      if (ap.on) {
        want = 1
        // De pie, `py` queda justo ENCIMA del suelo, asi que esta fila es la de
        // aire que ocupa el personaje: el suelo esta en rf + 1. Mirar en rf era
        // el fallo original — veia "hueco" casi siempre, saltaba sin parar y no
        // detectaba los muros.
        const cc = Math.floor(px / cell)
        const rf = Math.floor(py / cell)

        // Hueco de verdad = ninguna celda solida por debajo en toda la columna.
        // Un escalon hacia abajo tiene suelo mas abajo y se baja andando.
        const isHole = (c) => {
          if (c < 0 || c >= cols) return false
          for (let r = rf + 1; r < ROWS; r++) if (map[c][r] === 1) return false
          return true
        }
        const wall = solid(cc + 1, rf)
        // El pincho se salta con el en la celda siguiente o la de despues: mas
        // pronto se llega a el BAJANDO y se roza al descender; en el punto alto
        // del salto se pasa limpio.
        const spike = spikes.some((k) => k.c === cc + 1 || k.c === cc + 2)

        // SIMULAR EL SALTO en vez de adivinar cuando toca. Se integra la misma
        // parabola del juego y se mira si el aterrizaje cae en suelo firme.
        // Las reglas de antes ("salta si el hueco esta a una celda") fallaban en
        // cuanto la carrerilla no estaba al maximo o el escalon no era el de
        // siempre; esto responde a la unica pregunta que importa: si salto
        // ahora, ¿caigo de pie?
        const caeBien = () => {
          const g = Math.min(2300, H * 6.6)
          const vJump = Math.min(820, H * 2.35)
          const dtS = 1 / 120
          let x = px, y = py, v = -vJump
          for (let i = 0; i < 240; i++) {
            v += g * dtS
            x += Math.abs(vx) * dtS
            y += v * dtS
            if (y > H + cell * 2) return false
            if (v > 0) {
              const c2 = Math.floor(x / cell), r2 = Math.floor(y / cell)
              if (c2 >= cols) return true
              if (solid(c2, r2)) {
                // Aterrizar encima de un pincho no cuenta como aterrizar bien.
                return !spikes.some((k) => k.c === c2)
              }
            }
          }
          return false
        }

        // Se decide con el obstaculo en la celda siguiente, y la simulacion
        // solo sirve para no saltar hacia un aterrizaje malo.
        if (onGround && (wall || spike || isHole(cc + 1))) {
          if (caeBien() || wall || isHole(cc + 1)) jump()
          // Pincho delante y aterrizaje sucio: FRENAR, no resignarse. Con
          // menos carrerilla el arco se acorta y unas decimas despues la
          // simulacion da verde. Antes seguia a toda velocidad hacia el
          // pincho — era la causa de las rachas de muertes de la auditoria,
          // y con la rampa de velocidad los casos marginales se multiplicaban.
          else want = 0.22
        } else if (onGround && !spike) {
          // Saltar A POR las monedas de los arcos. Andando solo se cogen las
          // de suelo, asi que el piloto nunca saltaba y el video era un paseo
          // llano. Bajo los arcos el suelo es llano a proposito (gCalma) y
          // caeBien confirma el aterrizaje igualmente.
          const enArco = coins.some((k) => !k.got && k.c >= cc && k.c <= cc + 3 && k.r <= rf - 1 && k.r >= rf - 4)
          if (enArco && caeBien()) jump()
        }

        // ANTI-ATASCO. Perseguir cada caso raro del generador (el canto de una
        // plataforma, un saliente doble) es interminable: lo que no puede pasar
        // es que se quede trabado saltando contra una pared. Si no avanza, se
        // le sube el escalon; y si aun asi sigue clavado, se le adelanta a la
        // siguiente columna con suelo.
        if (px - lastPx < cell * 0.05) stuck += dt
        else stuck = 0
        lastPx = px

        if (stuck > 600 && onGround) {
          if (solid(cc + 1, rf) && !solid(cc + 1, rf - 1)) { py -= cell; vy = 0 }
          else jump()
        }
        if (stuck > 2400) {
          let c3 = clamp(cc + 2, 0, cols - 3)
          while (c3 < cols - 3 && isHole(c3)) c3++
          let top = -1
          for (let r = 0; r < ROWS; r++) if (map[c3][r] === 1) { top = r; break }
          if (top > 0) { px = c3 * cell + cell / 2; py = top * cell - 0.01; vx = 0; vy = 0 }
          stuck = 0
        }
      } else {
        want = (held.right ? 1 : 0) - (held.left ? 1 : 0)
      }

      // Ritmo del dinosaurio de Chrome: cuanto mas lejos, mas rapido. El
      // piloto conserva su curva medida (+15% en ~6 min; con mas, la
      // auditoria subia de 0 a 6-7 muertes). A una persona esa rampa no le
      // llega a picar (medido: +4% en 2 min): en modo humano sube hasta +35%
      // en ~3 min, que es donde la partida empieza a exigir de verdad.
      const ritmo = 1 + (ap.on ? Math.min(0.15, gIndex / 13000) : Math.min(0.35, gIndex / 8000))
      vx = lerp(vx, want * W * 0.52 * ritmo, 0.2)
      vy += Math.min(2300, H * 6.6) * s

      // Ejes por separado: resolverlos juntos engancha en las esquinas.
      px += vx * s
      let c = Math.floor(px / cell)
      const rFeet = Math.floor((py - 1) / cell)
      if (solid(c, rFeet) || solid(c, rFeet - 1)) {
        px = vx > 0 ? c * cell - 0.5 : (c + 1) * cell + 0.5
        vx = 0
      }

      py += vy * s
      c = Math.floor(px / cell)
      const r = Math.floor(py / cell)
      const estabaEnSuelo = onGround
      onGround = false
      if (vy >= 0 && solid(c, r)) {
        // Polvo al aterrizar de una caida con cuerpo: el salto tiene peso.
        if (!estabaEnSuelo && vy > H * 0.9) {
          for (let i = 0; i < 5; i++) {
            fx.push({
              x: px + (Math.random() - 0.5) * cell * 0.5, y: r * cell,
              vx: (Math.random() - 0.5) * 150, vy: -Math.random() * 90,
              life: 300, c: 'rgba(235,215,190,0.65)',
            })
          }
        }
        py = r * cell - 0.01; vy = 0; onGround = true
      }
      else if (vy < 0 && solid(c, Math.floor((py - cell * 0.95) / cell))) { vy = 0 }

      // El personaje ocupa de py - 0.95·cell (cabeza) a py (pies). Se compara
      // la moneda contra ESA caja: antes se median dos puntos sueltos y las
      // monedas a ras de suelo nunca llegaban a contar.
      for (const k of coins) {
        if (k.got) continue
        const kx = k.c * cell + cell / 2, ky = k.r * cell + cell / 2
        if (Math.abs(kx - px) < cell * 0.62 && ky > py - cell * 1.15 && ky < py + cell * 0.25) {
          k.got = 1; pts += 50
          if (humano) sfx.coin()
          // La recompensa se celebra donde ocurre: "+50" y chispas doradas.
          pops.push({ x: kx, y: ky, txt: '+50', life: 650 })
          for (let i = 0; i < 6; i++) {
            fx.push({
              x: kx, y: ky,
              vx: (Math.random() - 0.5) * 170, vy: -Math.random() * 130,
              life: 340, c: '#ffd45e',
            })
          }
        }
      }
      let hurt = false
      for (const k of spikes) {
        if (Math.abs(k.c * cell + cell / 2 - px) < cell * 0.45 && Math.abs((k.r + 1) * cell - py) < cell * 0.5) hurt = true
      }
      if (hurt || py > H + cell * 3) {
        // El golpe se ve: estallido rojo en el punto de la muerte. Sin el, el
        // personaje se teletransportaba sin explicacion.
        for (let i = 0; i < 14; i++) {
          fx.push({
            x: px, y: py - cell * 0.5,
            vx: (Math.random() - 0.5) * 320, vy: -Math.random() * 280,
            life: 460, c: '#e0554b',
          })
        }
        // Reaparecer sobre SUELO firme, no 8 celdas atras a ciegas.
        // Y si muere DOS veces casi en el mismo sitio, es que ese punto no lo
        // pasa: entonces reaparece POR DELANTE del obstaculo en vez de detras.
        // Sin esto se quedaba en bucle de muerte, que era lo que se veia.
        const cd = Math.floor(px / cell)
        bucle = Math.abs(px - muerteX) < cell * 4 ? bucle + 1 : 0
        muerteX = px

        const suelo = (c) => {
          if (c < 2 || c >= cols - 2) return -1
          for (let r = 0; r < ROWS; r++) if (map[c][r] === 1) return r
          return -1
        }
        const limpio = (c) => suelo(c) > 2 && !spikes.some((k) => Math.abs(k.c - c) < 2)

        let c2 = -1
        if (bucle >= 2) {
          for (let c = cd + 3; c < cols - 3 && c2 < 0; c++) if (limpio(c)) c2 = c
          bucle = 0
        } else {
          for (let c = clamp(cd - 8, 2, cols - 3); c > 1 && c2 < 0; c--) if (limpio(c)) c2 = c
        }
        if (c2 < 0) c2 = 3

        px = c2 * cell + cell / 2
        py = suelo(c2) > 0 ? suelo(c2) * cell - 0.01 : cell * (ROWS - 4)
        vx = 0; vy = 0
        stuck = 0; lastPx = px
        // En modo humano la muerte CIERRA la partida: cartel con record y a
        // empezar de cero. La multa blanda de antes no generaba tension.
        if (humano) {
          fin = { pts: Math.floor(pts), rec, nuevo: batio, life: 2600 }
          pts = 0; batio = false
          sfx.boom(); if (fin.nuevo) sfx.record(); else sfx.fin()
        } else pts = Math.max(0, pts - 100)
        deaths++
      }
      if (px > (VENTANA - 70) * cell) reciclar()

      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i]
        p.x += p.vx * s; p.y += p.vy * s; p.vy += 900 * s; p.life -= dt
        if (p.life <= 0) fx.splice(i, 1)
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        if ((pops[i].life -= dt) <= 0) pops.splice(i, 1)
      }

      cam = lerp(cam, clamp(px - W * 0.32, 0, cols * cell - W), 0.11)
    },
    draw(ctx, w, h) {
      // Cielo al atardecer + dos capas de parallax que se aclaran hacia el fondo.
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#241a4d'); sky.addColorStop(0.55, '#6b3f6e'); sky.addColorStop(1, '#c96f52')
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h)
      // Estrellas fijas (hash, no random) que titilan despacio.
      for (let i = 0; i < 26; i++) {
        const hsx = ((i * 73856093) >>> 0) % 1000 / 1000
        const hsy = ((i * 19349663) >>> 0) % 1000 / 1000
        const tw = 0.35 + 0.35 * Math.sin(anim / 900 + i * 1.7)
        ctx.fillStyle = `rgba(255,240,220,${tw})`
        ctx.fillRect(hsx * w, hsy * h * 0.3, 2, 2)
      }
      // Sol con halo: la bola opaca de antes quedaba parduzca sobre el morado.
      const sunX = w * 0.76, sunY = h * 0.28, sunR = Math.min(w, h) * 0.1
      const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 3)
      halo.addColorStop(0, 'rgba(255,190,120,0.4)')
      halo.addColorStop(1, 'rgba(255,190,120,0)')
      ctx.fillStyle = halo
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2); ctx.fill()
      const sol = ctx.createRadialGradient(sunX - sunR * 0.3, sunY - sunR * 0.3, 0, sunX, sunY, sunR)
      sol.addColorStop(0, '#ffe9b8'); sol.addColorStop(1, '#f5b26b')
      ctx.fillStyle = sol
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill()
      // Nubes al 6% de la camara + deriva propia: la capa mas lejana del
      // parallax, entre las estrellas y los edificios.
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      for (let i = 0; i < 4; i++) {
        const span = w + w * 0.5
        const nx2 = (((i * 353 - cam * 0.06 - anim * 0.006) % span) + span) % span - w * 0.25
        const ny2 = h * (0.07 + (i % 3) * 0.065)
        ctx.beginPath()
        ctx.ellipse(nx2, ny2, w * 0.1, h * 0.018, 0, 0, Math.PI * 2)
        ctx.ellipse(nx2 + w * 0.06, ny2 + h * 0.008, w * 0.065, h * 0.014, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = '#3b2a5c'
      for (let i = 0; i < 30; i++) {
        const x = (((i * 131 - cam * 0.16) % (w + 280)) + w + 280) % (w + 280) - 140
        ctx.fillRect(x, h * 0.34 + (i % 3) * 16, 42, h)
      }
      ctx.fillStyle = '#2a2046'
      for (let i = 0; i < 16; i++) {
        const x = (((i * 233 - cam * 0.4) % (w + 460)) + w + 460) % (w + 460) - 230
        ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 140, h * 0.5); ctx.lineTo(x + 280, h); ctx.closePath(); ctx.fill()
      }

      const c0 = Math.max(0, Math.floor(cam / cell) - 1)
      const c1 = Math.min(cols, c0 + Math.ceil(w / cell) + 3)
      for (let c = c0; c < c1; c++) {
        for (let r = 0; r < ROWS; r++) {
          if (!map[c][r]) continue
          const x = c * cell - cam, y = r * cell
          const exp = !solid(c, r - 1)
          // Tierra abajo, hierba solo en la cara expuesta. La tierra se oscurece
          // con la profundidad: antes todo el subsuelo era un marron plano que
          // se comia el 40% del cuadro como un pegote.
          let prof = 0
          while (prof < 6 && solid(c, r - 1 - prof)) prof++
          const k = 1 - prof * 0.11
          ctx.fillStyle = exp ? '#5d4130' : `rgb(${(74 * k) | 0},${(51 * k) | 0},${(39 * k) | 0})`
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
          // Piedrecitas fijas por celda (hash, no random: no parpadean).
          if (!exp) {
            const hsh = (c * 73856093 ^ r * 19349663) >>> 0
            if (hsh % 3 === 0) {
              ctx.fillStyle = `rgba(255,235,210,${0.05 + (hsh % 5) * 0.012})`
              const pxr = (hsh % 100) / 100, pyr = ((hsh >> 7) % 100) / 100
              ctx.fillRect(x + pxr * cell * 0.8, y + pyr * cell * 0.8, cell * 0.1, cell * 0.08)
            }
          }
          if (exp) {
            ctx.fillStyle = '#4ba852'; ctx.fillRect(x, y, cell + 0.5, cell * 0.26)
            ctx.fillStyle = '#79d97a'; ctx.fillRect(x, y, cell + 0.5, 2.5)
          }
        }
      }
      // DECORADO del suelo por columna (hash estable, sin random): matas de
      // hierba que se mecen, flores, arbustos y arbolitos. Sin esto, cualquier
      // tramo llano era un desierto verde con medio cuadro de tierra vacia.
      for (let c = c0; c < c1; c++) {
        if (spikes.some((k) => k.c === c)) continue
        let top = -1
        for (let r = 0; r < ROWS; r++) if (map[c][r] === 1) { top = r; break }
        if (top <= 0) continue
        const hsh = (c * 2654435761) >>> 0
        const x = c * cell - cam, y = top * cell
        if (hsh % 5 === 0) {
          // Mata de hierba: tres briznas con vaiven propio.
          ctx.strokeStyle = '#79d97a'
          ctx.lineWidth = Math.max(1.5, cell * 0.05)
          for (let b = 0; b < 3; b++) {
            const bx = x + cell * (0.2 + b * 0.3)
            const sway = Math.sin(anim / 600 + c * 1.3 + b) * cell * 0.06
            const alto = cell * (0.28 + ((hsh >> (b * 2)) & 3) * 0.05)
            ctx.beginPath()
            ctx.moveTo(bx, y)
            ctx.quadraticCurveTo(bx + sway * 0.5, y - alto * 0.6, bx + sway, y - alto)
            ctx.stroke()
          }
        } else if (hsh % 13 === 3) {
          // Flor: tallo y corola clara.
          const bx = x + cell * 0.5
          ctx.strokeStyle = '#4ba852'; ctx.lineWidth = Math.max(1.5, cell * 0.045)
          ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx, y - cell * 0.32); ctx.stroke()
          ctx.fillStyle = hsh & 32 ? '#ffd9e8' : '#ffe9a8'
          ctx.beginPath(); ctx.arc(bx, y - cell * 0.38, cell * 0.09, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#c96f52'
          ctx.beginPath(); ctx.arc(bx, y - cell * 0.38, cell * 0.035, 0, Math.PI * 2); ctx.fill()
        } else if (hsh % 17 === 5) {
          // Arbusto: dos copas superpuestas.
          ctx.fillStyle = '#2f7a44'
          ctx.beginPath()
          ctx.ellipse(x + cell * 0.35, y - cell * 0.14, cell * 0.3, cell * 0.18, 0, 0, Math.PI * 2)
          ctx.ellipse(x + cell * 0.7, y - cell * 0.1, cell * 0.22, cell * 0.13, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#3f9a54'
          ctx.beginPath()
          ctx.ellipse(x + cell * 0.42, y - cell * 0.2, cell * 0.18, cell * 0.11, 0, 0, Math.PI * 2)
          ctx.fill()
        } else if (hsh % 29 === 11) {
          // Arbolito: tronco y copa a dos tonos, por detras de la accion.
          const bx = x + cell * 0.5
          ctx.fillStyle = '#4a3327'
          ctx.fillRect(bx - cell * 0.06, y - cell * 0.85, cell * 0.12, cell * 0.85)
          ctx.fillStyle = '#2f7a44'
          ctx.beginPath(); ctx.arc(bx, y - cell * 1.0, cell * 0.38, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#4ba852'
          ctx.beginPath(); ctx.arc(bx - cell * 0.14, y - cell * 1.12, cell * 0.24, 0, Math.PI * 2); ctx.fill()
        }
      }

      // Luciernagas al atardecer: puntos calidos que flotan con parallax.
      for (let i = 0; i < 7; i++) {
        const h1 = ((i + 1) * 40503) >>> 0
        const span = w + 120
        const lx = ((((h1 % span) - cam * 0.55 + Math.sin(anim / 1300 + i * 2.1) * 16) % span) + span) % span - 60
        const ly = h * (0.5 + ((h1 >> 5) % 100) / 100 * 0.3) + Math.cos(anim / 900 + i * 1.7) * 9
        const tw = 0.35 + 0.3 * Math.sin(anim / 340 + i * 2.6)
        ctx.fillStyle = `rgba(255,224,140,${tw})`
        ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, Math.PI * 2); ctx.fill()
      }

      ctx.fillStyle = '#e0554b'
      for (const k of spikes) {
        const x = k.c * cell - cam
        if (x < -cell || x > w) continue
        ctx.beginPath()
        ctx.moveTo(x, (k.r + 1) * cell)
        ctx.lineTo(x + cell / 2, k.r * cell + cell * 0.2)
        ctx.lineTo(x + cell, (k.r + 1) * cell)
        ctx.closePath(); ctx.fill()
      }
      for (const k of coins) {
        if (k.got) continue
        const x = k.c * cell + cell / 2 - cam
        if (x < -cell || x > w + cell) continue
        const b = 1 + Math.sin(anim / 210 + k.c) * 0.3
        ctx.shadowColor = '#ffd45e'; ctx.shadowBlur = 8
        ctx.fillStyle = '#ffd45e'
        ctx.beginPath()
        ctx.ellipse(x, k.r * cell + cell / 2, cell * 0.15 * b, cell * 0.25, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = '#fff3c4'
        ctx.beginPath()
        ctx.ellipse(x, k.r * cell + cell / 2, cell * 0.06 * b, cell * 0.13, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const p of fx) {
        ctx.globalAlpha = clamp(p.life / 380, 0, 1)
        ctx.fillStyle = p.c
        ctx.fillRect(p.x - cam - 2, p.y - 2, 4, 4)
      }
      ctx.globalAlpha = 1

      // PERSONAJE. Antes eran tres rectangulos y la cabeza un cuadrado blanco
      // sin cara: a tamaño de tarjeta parecia un fallo de render. Ahora tiene
      // sombra en el suelo, pelo, ojo y un brazo que acompaña a la zancada.
      const x = px - cam
      const step = onGround && Math.abs(vx) > 25 ? Math.sin(anim / 52) * cell * 0.18 : 0
      const mira = vx < -25 ? -1 : 1

      // Sombra proyectada al SUELO, no pegada a los pies: dibujada en py, al
      // saltar volaba con el personaje. Se busca la primera celda solida por
      // debajo y se encoge y aclara con la altura del salto.
      const cS = Math.floor(px / cell)
      let rS = Math.floor(py / cell)
      while (rS < ROWS && !solid(cS, rS)) rS++
      if (rS < ROWS) {
        const gy = rS * cell
        const alto = clamp((gy - py) / (cell * 4), 0, 1)
        ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - alto * 0.6)})`
        ctx.beginPath()
        ctx.ellipse(x, gy + cell * 0.02, cell * 0.26 * (1 - alto * 0.45), cell * 0.07, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = '#2b6fae'   // piernas
      ctx.fillRect(x - cell * 0.23, py - cell * 0.35, cell * 0.17, cell * 0.35 - Math.max(0, step))
      ctx.fillRect(x + cell * 0.06, py - cell * 0.35, cell * 0.17, cell * 0.35 - Math.max(0, -step))
      ctx.fillStyle = '#1d2733'   // zapatos
      ctx.fillRect(x - cell * 0.25, py - cell * 0.07 - Math.max(0, step), cell * 0.21, cell * 0.07)
      ctx.fillRect(x + cell * 0.05, py - cell * 0.07 - Math.max(0, -step), cell * 0.21, cell * 0.07)

      ctx.fillStyle = '#3aa0e8'   // torso
      ctx.fillRect(x - cell * 0.26, py - cell * 0.62, cell * 0.52, cell * 0.27)
      ctx.fillStyle = '#2f86c6'   // brazo, contrapeado con la pierna
      ctx.fillRect(x + mira * cell * 0.2 - cell * 0.07, py - cell * 0.58 + step * 0.5, cell * 0.14, cell * 0.22)

      ctx.fillStyle = '#f0c9a0'   // cabeza
      ctx.fillRect(x - cell * 0.22, py - cell * 0.95, cell * 0.44, cell * 0.33)
      ctx.fillStyle = '#3b2a22'   // pelo
      ctx.fillRect(x - cell * 0.24, py - cell * 0.99, cell * 0.48, cell * 0.12)
      ctx.fillRect(x - mira * cell * 0.24 - (mira > 0 ? 0 : cell * 0.06), py - cell * 0.95, cell * 0.06, cell * 0.16)
      ctx.fillStyle = '#1d2733'   // ojo, mirando hacia donde corre
      ctx.fillRect(x + mira * cell * 0.08 - cell * 0.03, py - cell * 0.8, cell * 0.06, cell * 0.07)

      // "+50" flotantes, como en Ladrillos: el premio a la vista, no solo en
      // el marcador de la esquina.
      ctx.font = `700 ${Math.max(11, h * 0.024)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      for (const p of pops) {
        ctx.globalAlpha = clamp(p.life / 450, 0, 1)
        ctx.fillStyle = '#ffe9a8'
        ctx.fillText(p.txt, p.x - cam, p.y - (650 - p.life) * 0.04)
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'

      // Rayos del sol al atardecer: cuñas suaves que giran despacio.
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const sunX2 = w * 0.76, sunY2 = h * 0.28
      for (let i = 0; i < 4; i++) {
        const a = anim / 14000 + i * 1.57
        const len = h * 0.85
        ctx.fillStyle = 'rgba(255,205,130,0.035)'
        ctx.beginPath()
        ctx.moveTo(sunX2, sunY2)
        ctx.lineTo(sunX2 + Math.cos(a) * len, sunY2 + Math.sin(a) * len)
        ctx.lineTo(sunX2 + Math.cos(a + 0.14) * len, sunY2 + Math.sin(a + 0.14) * len)
        ctx.closePath(); ctx.fill()
      }
      ctx.restore()
      bloom(ctx, w, h, 0.18)
      hud(ctx, String(pts).padStart(5, '0'), rec > 0 ? `MEJOR ${String(rec).padStart(5, '0')}` : 'OCASO · 2D', w, '#ffd45e')
      if (fin) finBanner(ctx, w, h, fin)
    },
  }
}

/* ═══════════════════════════ 2 · 2D · LADRILLOS ═══════════════════════════ */
export function createBricks() {
  const ap = autopilot()
  let W = 1, H = 1, pad, balls, bricks, bits, pts, shake, combo, lives, held, deaths = 0, inicial = 1
  let pops     // puntuaciones flotantes al romper ladrillo
  let caps = []   // power-ups cayendo: M = multibola, A = pala ancha
  let padT = 0    // tiempo restante de pala ancha
  let wob = 0  // vaiven del piloto: decide el punto de impacto en la pala
  let nivel = 1  // sube con cada muro limpiado; la bola coge velocidad
  let humano = false, rec = 0, batio = false, fin = null   // partida humana y record
  let bt = 0      // reloj del fondo (estrellas y auroras)
  let anillos = []   // ondas expansivas al romper ladrillo

  // Una fila, un color: el degradado hace de marcador de progreso.
  const HUES = ['#e5534b', '#e58b3a', '#e5c93a', '#54b45c', '#3f9ad8', '#8a6fd6']

  const layout = () => {
    const cols = clamp(Math.round(W / 54), 5, 12)
    const rows = clamp(Math.round(H / 62), 4, 8)
    const bw = (W * 0.9) / cols, bh = H * 0.036
    bricks = []
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      bricks.push({
        x: W * 0.05 + c * bw + 2, y: H * 0.1 + r * (bh * 1.3),
        w: bw - 4, h: bh, hp: r === 0 ? 2 : 1, c: HUES[r % HUES.length],
      })
    }
  }

  // La bola coge un 12% por nivel, con tope: al ritmo del dinosaurio de
  // Chrome — aguantar se paga con velocidad. El tope existe porque la pala
  // (tanto la del piloto como la de una persona) corre a W*1.2-1.35 y por
  // encima de x1.45 dejaria de llegar a las esquinas.
  const vel = () => 1 + Math.min(0.45, (nivel - 1) * 0.12)

  const mkBall = (x, y, vx, vy) => ({
    x, y, vx, vy,
    r: Math.max(3, Math.min(W, H) * 0.014),
    tr: [],   // cola luminosa propia: con multibola cada una arrastra la suya
  })

  const serve = () => {
    balls = [mkBall(W / 2, H * 0.6, (Math.random() < 0.5 ? -1 : 1) * W * 0.42 * vel(), -H * 0.8 * vel())]
    combo = 0
  }

  const reset = (w, h) => {
    W = w; H = h
    pad = { x: W / 2, bw: W * 0.19, w: W * 0.19, h: Math.max(6, H * 0.021) }
    bits = []; pops = []; anillos = []; caps = []; padT = 0; pts = 0; shake = 0; lives = 3
    held = { left: 0, right: 0 }
    rec = record.get('bricks')
    layout(); inicial = bricks.length; serve()
  }

  const burst = (x, y, n, col) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 300 + Math.random() * 340, c: col })
    }
  }

  return {
    reset,
    state: () => ({ x: pad.x, pts, bricks: bricks.length, deaths }),
    key(k, down) { ap.touch(); if (k in held) held[k] = down ? 1 : 0 },
    pointer(x) { ap.touch(); pad.x = x },
    update(dt, w, h) {
      if (w !== W || h !== H) reset(w, h)
      ap.tick(dt)
      if (ap.on) humano = false
      else if (!humano) { humano = true; pts = 0; batio = false }
      if (humano && Math.floor(pts) > rec) { rec = Math.floor(pts); record.set('bricks', rec); batio = true }
      if (fin && (fin.life -= dt) <= 0) fin = null
      const s = Math.min(dt, 34) / 1000
      shake = Math.max(0, shake - dt)
      bt += dt
      const py = H * 0.88

      if (ap.on) {
        // Anticipa donde va a caer, en vez de perseguir la bola. La caida se
        // pliega contra las paredes (onda triangular): la prediccion lineal
        // solo acertaba con bolas casi verticales. Con multibola se atiende a
        // la bola que ATERRIZA ANTES, no a la mas cercana.
        let target = W / 2, tMin = Infinity
        for (const b of balls) {
          if (b.vy <= 0) continue
          const t = (py - b.y) / b.vy
          if (t >= tMin) continue
          tMin = t
          const span = W - 2 * b.r
          let u = (((b.x + b.vx * t - b.r) % (2 * span)) + 2 * span) % (2 * span)
          if (u > span) u = 2 * span - u
          target = u + b.r
        }
        // Recoger DESCENTRADO a proposito: el punto de impacto decide el
        // angulo, y con el centro perfecto la bola salia vertical y se pasaba
        // el video paseando por la misma columna. El vaiven barre el muro.
        wob += dt
        target -= Math.sin(wob / 1300) * pad.w * 0.3
        pad.x += clamp(target - pad.x, -W * 1.35 * s, W * 1.35 * s)
      } else {
        pad.x += ((held.right ? 1 : 0) - (held.left ? 1 : 0)) * W * 1.2 * s
      }
      // Pala ancha temporal (power-up): el ancho vivo sale del ancho base.
      padT = Math.max(0, padT - dt)
      pad.w = pad.bw * (padT > 0 ? 1.55 : 1)
      pad.x = clamp(pad.x, pad.w / 2, W - pad.w / 2)

      for (let bi = balls.length - 1; bi >= 0; bi--) {
        const ball = balls[bi]
        ball.tr.push({ x: ball.x, y: ball.y })
        if (ball.tr.length > 14) ball.tr.shift()
        ball.x += ball.vx * s; ball.y += ball.vy * s
        if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) }
        if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx) }
        if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy) }

        if (ball.vy > 0 && ball.y > py - ball.r && ball.y < py + pad.h + 10 && Math.abs(ball.x - pad.x) < pad.w / 2 + ball.r) {
          ball.vy = -Math.abs(ball.vy)
          // El punto de impacto decide el angulo: es lo que lo convierte en juego.
          ball.vx = ((ball.x - pad.x) / (pad.w / 2)) * W * 0.62 * vel()
          combo = 0
        }
        if (ball.y > H + 40) {
          balls.splice(bi, 1)
          // Con multibola, perder una bola no es perder la vida: la vida se
          // pierde cuando cae la ULTIMA.
          if (balls.length === 0) {
            deaths++
            if (--lives <= 0) {
              if (humano) {
                fin = { pts: Math.floor(pts), rec, nuevo: batio, life: 2600 }; batio = false
                if (fin.nuevo) sfx.record(); else sfx.fin()
              }
              lives = 3; pts = 0; nivel = 1; layout()
            } else if (humano) sfx.boom()
            serve()
          }
          continue
        }

        for (let i = bricks.length - 1; i >= 0; i--) {
          const b = bricks[i]
          if (ball.x + ball.r < b.x || ball.x - ball.r > b.x + b.w) continue
          if (ball.y + ball.r < b.y || ball.y - ball.r > b.y + b.h) continue
          // Rebote por el lado de menor solape: si no, atraviesa por las esquinas.
          const ox = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r))
          const oy = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r))
          if (ox < oy) ball.vx *= -1; else ball.vy *= -1
          if (--b.hp <= 0) {
            bricks.splice(i, 1); burst(b.x + b.w / 2, b.y + b.h / 2, 14, b.c)
            anillos.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, life: 340, c: b.c })
            // Power-up en el 13% de las roturas: capsula que cae y se caza
            // con la pala. M = multibola, A = pala ancha.
            if (Math.random() < 0.13) {
              caps.push({
                x: b.x + b.w / 2, y: b.y + b.h / 2, vy: H * 0.22,
                tipo: Math.random() < 0.5 ? 'M' : 'A',
              })
            }
          }
          else b.flash = 140   // el ladrillo duro acusa el golpe: se ve que encajo
          if (humano) sfx.hit()
          combo++
          pts += 10 * combo
          // El "+N" flotante hace visible el combo: la unica pista era el
          // marcador del HUD y en video nadie lo mira.
          pops.push({ x: b.x + b.w / 2, y: b.y, txt: `+${10 * combo}`, life: 700 })
          shake = 130
          break
        }
      }

      // Capsulas cayendo: cazarlas con la pala aplica el power-up.
      for (let i = caps.length - 1; i >= 0; i--) {
        const c = caps[i]
        c.y += c.vy * s
        if (c.y > py - 6 && c.y < py + pad.h + 14 && Math.abs(c.x - pad.x) < pad.w / 2 + 8) {
          if (c.tipo === 'M') {
            // Cada bola viva se desdobla, con tope de 4: mas es confeti.
            const nuevas = []
            for (const b of balls) {
              if (balls.length + nuevas.length >= 4) break
              nuevas.push(mkBall(b.x, b.y, -b.vx * 0.9 + W * 0.05, -Math.abs(b.vy)))
            }
            balls.push(...nuevas)
            pops.push({ x: c.x, y: py - 14, txt: '¡MULTIBOLA!', life: 900 })
          } else {
            padT = 8000
            pops.push({ x: c.x, y: py - 14, txt: 'PALA ANCHA', life: 900 })
          }
          if (humano) sfx.level()
          caps.splice(i, 1)
        } else if (c.y > H + 20) caps.splice(i, 1)
      }
      if (bricks.length < inicial * 0.35) { nivel++; layout(); inicial = bricks.length }
      for (const b of bricks) if (b.flash) b.flash = Math.max(0, b.flash - dt)

      for (let i = bits.length - 1; i >= 0; i--) {
        const p = bits[i]
        p.x += p.vx * s; p.y += p.vy * s; p.vy += 420 * s; p.life -= dt
        if (p.life <= 0) bits.splice(i, 1)
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        if ((pops[i].life -= dt) <= 0) pops.splice(i, 1)
      }
      for (let i = anillos.length - 1; i >= 0; i--) {
        if ((anillos[i].life -= dt) <= 0) anillos.splice(i, 1)
      }
    },
    draw(ctx, w, h) {
      // FONDO. Antes era el negro del CSS y la mitad de abajo quedaba como un
      // agujero. Un degradado frio con halo tras el muro llena el cuadro sin
      // robarle protagonismo a los ladrillos.
      const cielo = ctx.createLinearGradient(0, 0, 0, h)
      cielo.addColorStop(0, '#16182b')
      cielo.addColorStop(0.55, '#101120')
      cielo.addColorStop(1, '#08090f')
      ctx.fillStyle = cielo
      ctx.fillRect(0, 0, w, h)
      const halo = ctx.createRadialGradient(w / 2, h * 0.22, 0, w / 2, h * 0.22, w * 0.8)
      halo.addColorStop(0, 'rgba(63,208,212,0.10)')
      halo.addColorStop(1, 'rgba(63,208,212,0)')
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, w, h)

      // Estrellas a la deriva y dos auroras tenues: la mitad inferior del
      // cuadro era un vacio negro donde no pasaba nada.
      for (let i = 0; i < 24; i++) {
        const h1 = ((i + 1) * 2654435761) >>> 0
        const sx2 = (((h1 % 1000) / 1000 + bt / 90000 * ((h1 >> 4) % 3 + 1)) % 1) * w
        const sy2 = ((h1 >> 8) % 1000) / 1000 * h
        const tw = 0.14 + 0.12 * Math.sin(bt / 700 + i * 2.1)
        ctx.fillStyle = `rgba(190,215,255,${tw})`
        ctx.fillRect(sx2, sy2, 2, 2)
      }
      const au1 = ctx.createRadialGradient(w * 0.25 + Math.sin(bt / 7000) * w * 0.15, h * 0.72, 0, w * 0.25, h * 0.72, w * 0.55)
      au1.addColorStop(0, 'rgba(63,208,212,0.05)'); au1.addColorStop(1, 'rgba(63,208,212,0)')
      ctx.fillStyle = au1; ctx.fillRect(0, 0, w, h)
      const au2 = ctx.createRadialGradient(w * 0.78 - Math.sin(bt / 9000) * w * 0.14, h * 0.6, 0, w * 0.78, h * 0.6, w * 0.5)
      au2.addColorStop(0, 'rgba(138,111,214,0.06)'); au2.addColorStop(1, 'rgba(138,111,214,0)')
      ctx.fillStyle = au2; ctx.fillRect(0, 0, w, h)

      ctx.save()
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 0.05, (Math.random() - 0.5) * shake * 0.05)

      for (const b of bricks) {
        const r = Math.min(3, b.h / 3)
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, r)
        else ctx.rect(b.x, b.y, b.w, b.h)
        // Degradado propio del ladrillo: el color plano era lo que lo hacia
        // parecer una barra de Excel en vez de una pieza.
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h)
        g.addColorStop(0, b.hp > 1 ? '#ffffff' : 'rgba(255,255,255,0.28)')
        g.addColorStop(0.12, b.c)
        g.addColorStop(1, 'rgba(0,0,0,0.45)')
        ctx.fillStyle = b.c
        ctx.fill()
        ctx.fillStyle = g
        ctx.globalAlpha = b.hp > 1 ? 0.55 : 0.9
        ctx.fill()
        ctx.globalAlpha = 1
        // Sombra proyectada: separa el muro del fondo.
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(b.x + 1.5, b.y + b.h, b.w - 1.5, 2)
        if (b.flash) {
          ctx.globalAlpha = (b.flash / 140) * 0.75
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, r)
          else ctx.rect(b.x, b.y, b.w, b.h)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }
      for (const p of bits) {
        ctx.globalAlpha = clamp(p.life / 600, 0, 1)
        ctx.fillStyle = p.c || INK
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
      }
      ctx.globalAlpha = 1

      // Onda expansiva al romper: un golpe con cuerpo, no solo confeti.
      for (const a of anillos) {
        const t2 = 1 - a.life / 340
        ctx.globalAlpha = (1 - t2) * 0.55
        ctx.strokeStyle = a.c
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(a.x, a.y, 6 + t2 * Math.min(w, h) * 0.09, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Puntuaciones flotantes: suben y se apagan.
      ctx.font = `700 ${Math.max(11, h * 0.024)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      for (const p of pops) {
        ctx.globalAlpha = clamp(p.life / 500, 0, 1)
        ctx.fillStyle = '#ffe9a8'
        ctx.fillText(p.txt, p.x, p.y - (700 - p.life) * 0.035)
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'

      // PALA con brillo, en vez de un rectangulo liso.
      const py2 = h * 0.88
      ctx.shadowColor = '#3fd0d4'; ctx.shadowBlur = 14
      const pg = ctx.createLinearGradient(0, py2, 0, py2 + pad.h)
      pg.addColorStop(0, '#9df3f5'); pg.addColorStop(1, '#2aa8ac')
      ctx.fillStyle = pg
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(pad.x - pad.w / 2, py2, pad.w, pad.h, pad.h / 2)
      else ctx.rect(pad.x - pad.w / 2, py2, pad.w, pad.h)
      ctx.fill()
      ctx.shadowBlur = 0

      // Capsulas de power-up: pildora con letra, cayendo hacia la pala.
      for (const c of caps) {
        ctx.fillStyle = c.tipo === 'M' ? '#ffd45e' : '#7bef99'
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(c.x - 13, c.y - 8, 26, 16, 8)
        else ctx.rect(c.x - 13, c.y - 8, 26, 16)
        ctx.fill()
        ctx.fillStyle = '#131314'
        ctx.font = '700 11px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(c.tipo, c.x, c.y + 4)
        ctx.textAlign = 'left'
      }

      // ESTELA: la bola sola sobre el vacio no se leia; la cola dice de donde
      // viene y a que velocidad. Cada bola arrastra la suya.
      for (const ball of balls) {
        for (let i = 0; i < ball.tr.length; i++) {
          const t = (i + 1) / ball.tr.length
          ctx.globalAlpha = t * 0.4
          ctx.fillStyle = '#3fd0d4'
          ctx.beginPath(); ctx.arc(ball.tr[i].x, ball.tr[i].y, ball.r * t * 0.9, 0, Math.PI * 2); ctx.fill()
        }
        ctx.globalAlpha = 1
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      }
      ctx.restore()
      bloom(ctx, w, h, 0.35)
      hud(ctx, String(pts).padStart(5, '0'), '●'.repeat(lives) + ` · N${nivel}` + (rec > 0 ? ` · MEJOR ${rec}` : ''), w, '#3fd0d4')
      if (fin) finBanner(ctx, w, h, fin)
    },
  }
}

/* ═══════════════════ 3 · 3D · LABERINTO (raycasting DDA) ══════════════════ */
function genMaze(cols, rows) {
  const g = Array.from({ length: rows }, () => Array(cols).fill(1))
  const stack = [[1, 1]]
  g[1][1] = 0
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].sort(() => Math.random() - 0.5)
    let moved = false
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy
      if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && g[ny][nx] === 1) {
        g[ny][nx] = 0; g[y + dy / 2][x + dx / 2] = 0
        stack.push([nx, ny]); moved = true; break
      }
    }
    if (!moved) stack.pop()
  }
  // Algunos muros de menos: el laberinto perfecto tiene un solo camino y
  // recorrerlo se hace claustrofobico.
  for (let i = 0; i < Math.floor(cols * rows * 0.04); i++) {
    g[2 + ((Math.random() * (rows - 4)) | 0)][2 + ((Math.random() * (cols - 4)) | 0)] = 0
  }
  return g
}

export function createMaze3D() {
  const N = 21
  const ap = autopilot()
  let W = 1, H = 1, grid, fx, fy, ang, orbs, pts, held, bob, destino, think
  let flash, pop   // recoger un orbe se nota: destello turquesa + "+100"
  let chain, chainT   // combo: encadenar orbes sin pausa multiplica el premio
  let airT = 0   // reloj del polvo ambiental: corre aunque la camara pare
  let braseros = []   // fuegos fijos que iluminan y dan vida a los pasillos
  let humano = false, rec = 0   // record (aqui no se muere: no hay fin)

  const wall = (x, y) => {
    const cx = Math.floor(x), cy = Math.floor(y)
    return cx < 0 || cy < 0 || cx >= N || cy >= N || grid[cy][cx] === 1
  }

  const reset = (w, h) => {
    W = w; H = h
    grid = genMaze(N, N)
    fx = 1.5; fy = 1.5; ang = 0
    orbs = []
    // 0.16 (antes 0.1): con menos, la camara pasaba pasillos enteros sin una
    // baliza a la vista y el video parecia un tunel sin objetivo.
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (!grid[y][x] && Math.random() < 0.16) orbs.push({ x: x + 0.5, y: y + 0.5, got: 0 })
    }
    if (!orbs.length) orbs.push({ x: N - 2.5, y: N - 2.5, got: 0 })
    // Braseros por hash de celda (deterministas): ni estorban ni se agotan.
    braseros = []
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (!grid[y][x] && (((x * 73856093) ^ (y * 19349663)) >>> 0) % 14 === 3) {
        braseros.push({ x: x + 0.5, y: y + 0.5 })
      }
    }
    pts = 0; held = { left: 0, right: 0, up: 0, down: 0 }; bob = 0; destino = null; think = 0
    flash = 0; pop = null; chain = 0; chainT = 0
    rec = record.get('maze3d')
  }

  /* Camino mas corto en la rejilla: lo usa el piloto para recorrer el mapa. */
  const bfs = (sx, sy) => {
    const seen = new Set([`${sx},${sy}`])
    const q = [{ x: sx, y: sy, first: null }]
    let guard = 0
    while (q.length && guard++ < 4000) {
      const n = q.shift()
      if (orbs.some((o) => !o.got && Math.floor(o.x) === n.x && Math.floor(o.y) === n.y)) return n.first
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = n.x + dx, ny = n.y + dy
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || grid[ny][nx] === 1 || seen.has(`${nx},${ny}`)) continue
        seen.add(`${nx},${ny}`)
        q.push({ x: nx, y: ny, first: n.first || [dx, dy] })
      }
    }
    return null
  }

  const move = (dx, dy) => {
    // Un margen para no pegarse a la pared y quedarse encallado en las esquinas.
    const m = 0.22
    if (!wall(fx + dx + Math.sign(dx) * m, fy)) fx += dx
    if (!wall(fx, fy + dy + Math.sign(dy) * m)) fy += dy
  }

  return {
    reset,
    state: () => ({ x: fx, y: fy, a: ang, pts }),
    key(k, down) { ap.touch(); if (k in held) held[k] = down ? 1 : 0 },
    update(dt, w, h) {
      if (w !== W || h !== H) reset(w, h)
      ap.tick(dt)
      if (ap.on) humano = false
      else if (!humano) { humano = true; pts = 0 }
      if (humano && Math.floor(pts) > rec) { rec = Math.floor(pts); record.set('maze3d', rec) }
      const s = Math.min(dt, 34) / 1000
      const spd = 2.3 * s, rot = 4.0 * s   // giro vivo: los pivotes en las esquinas se hacian eternos

      if (ap.on) {
        // El piloto va de centro de celda a centro de celda. Antes avanzaba en
        // la direccion del eje desde donde estuviese, asi que se comia las
        // esquinas y terminaba rozando la pared: la camara quedaba de morros
        // contra un muro y la pantalla entera era un rectangulo marron.
        think -= dt
        if (!destino || think <= 0 || Math.hypot(destino.x - fx, destino.y - fy) < 0.12) {
          const paso = bfs(Math.floor(fx), Math.floor(fy))
          destino = paso
            ? { x: Math.floor(fx) + paso[0] + 0.5, y: Math.floor(fy) + paso[1] + 0.5 }
            : null
          think = 1500   // si no llega en este tiempo, replantea
        }
        if (destino) {
          const want = Math.atan2(destino.y - fy, destino.x - fx)
          let d = want - ang
          while (d > Math.PI) d -= Math.PI * 2
          while (d < -Math.PI) d += Math.PI * 2
          ang += clamp(d, -rot * 1.7, rot * 1.7)
          // Avanza SIEMPRE hacia el centro de la celda destino, no hacia donde
          // mira. Asi el giro es solo de camara y el cuerpo no deja de andar:
          // parandose a girar, la camara se quedaba fija contra una pared y ese
          // segundo y medio de muro plano era medio video.
          const md = Math.hypot(destino.x - fx, destino.y - fy) || 1
          move(((destino.x - fx) / md) * spd, ((destino.y - fy) / md) * spd)
        } else {
          // Sin ruta: avanzar y girar al topar, nunca quedarse quieto.
          const ax = fx, ay = fy
          move(Math.cos(ang) * spd, Math.sin(ang) * spd)
          if (Math.hypot(fx - ax, fy - ay) < spd * 0.4) ang += rot * 2
        }
        bob += dt
      } else {
        if (held.left) ang -= rot
        if (held.right) ang += rot
        if (held.up) { move(Math.cos(ang) * spd, Math.sin(ang) * spd); bob += dt }
        if (held.down) { move(-Math.cos(ang) * spd, -Math.sin(ang) * spd); bob += dt }
      }

      // Al coger uno aparece otro lejos: nunca se agotan y no hace falta
      // regenerar el laberinto, que era un corte brusco a mitad de recorrido.
      for (const o of orbs) {
        if (o.got || Math.hypot(o.x - fx, o.y - fy) >= 0.72) continue
        o.got = 1
        // COMBO: el siguiente orbe en menos de 8 s vale mas (x2, x3... x5).
        // Es la tension que le faltaba al laberinto: sin rampa de dificultad,
        // el reto pasa a ser encadenar balizas sin perderse ni dudar.
        chain = chainT > 0 ? chain + 1 : 1
        chainT = 8000
        const gan = 100 * Math.min(5, chain)
        pts += gan
        if (humano) sfx.coin(Math.min(5, chain))   // el combo se oye subir de tono
        flash = 240; pop = { life: 700, txt: chain > 1 ? `+${gan} x${Math.min(5, chain)}` : `+${gan}` }
        for (let intento = 0; intento < 60; intento++) {
          const x = 1 + ((Math.random() * (N - 2)) | 0)
          const y = 1 + ((Math.random() * (N - 2)) | 0)
          if (grid[y][x] === 1) continue
          if (Math.hypot(x + 0.5 - fx, y + 0.5 - fy) < 5) continue   // que no salga encima
          orbs.push({ x: x + 0.5, y: y + 0.5, got: 0 })
          break
        }
      }
      // Los recogidos se descartan para que la lista no crezca sin fin.
      if (orbs.length > 60) orbs = orbs.filter((o) => !o.got)
      flash = Math.max(0, flash - dt)
      chainT = Math.max(0, chainT - dt)
      if (chainT === 0) chain = 0
      if (pop && (pop.life -= dt) <= 0) pop = null
      airT += dt
    },
    draw(ctx, w, h) {
      const horizon = h * 0.5 + Math.sin(bob / 180) * h * 0.012

      // Techo azul noche y suelo calido: separa arriba de abajo de un vistazo.
      const gTop = ctx.createLinearGradient(0, 0, 0, horizon)
      gTop.addColorStop(0, '#080a14'); gTop.addColorStop(1, '#1d2340')
      ctx.fillStyle = gTop; ctx.fillRect(0, 0, w, horizon + 1)
      // Estrellas fijas al mundo, no a la pantalla: panean al girar (2·atan(fov)
      // ≈ 1.52 rad de campo horizontal) y el cielo deja de ser un negro vacio.
      // Van antes que los muros, que las tapan donde toca.
      for (let i = 0; i < 42; i++) {
        const hx = ((i * 2654435761) >>> 0) % 1000 / 1000
        const hy = ((i * 40503) >>> 0) % 1000 / 1000
        const sxx = ((hx - ang / 1.52) % 1 + 1) % 1
        ctx.fillStyle = `rgba(215,225,255,${0.2 + ((i * 7919) % 100) / 100 * 0.5})`
        ctx.fillRect(sxx * w, hy * horizon * 0.55, 2, 2)
      }
      const gBot = ctx.createLinearGradient(0, horizon, 0, h)
      gBot.addColorStop(0, '#3a2c22'); gBot.addColorStop(1, '#120e0b')
      ctx.fillStyle = gBot; ctx.fillRect(0, horizon, w, h - horizon)

      // 0.95 (antes 0.85): con el campo estrecho, pivotar junto a una esquina
      // llenaba el cuadro entero de muro; mas angulo deja siempre contexto de
      // pasillo alrededor y el espacio respira.
      const fov = 0.95
      const cols = Math.ceil(w)
      const zbuf = new Float32Array(cols)

      for (let sx = 0; sx < cols; sx++) {
        const camX = (2 * sx) / w - 1
        const rx = Math.cos(ang) - Math.sin(ang) * camX * fov
        const ry = Math.sin(ang) + Math.cos(ang) * camX * fov

        // DDA: avanza celda a celda hasta topar con un muro.
        let mx = Math.floor(fx), my = Math.floor(fy)
        const dX = Math.abs(1 / (rx || 1e-9)), dY = Math.abs(1 / (ry || 1e-9))
        let sX, sY, stepX, stepY
        if (rx < 0) { stepX = -1; sX = (fx - mx) * dX } else { stepX = 1; sX = (mx + 1 - fx) * dX }
        if (ry < 0) { stepY = -1; sY = (fy - my) * dY } else { stepY = 1; sY = (my + 1 - fy) * dY }

        let side = 0, hit = false, guard = 0
        while (!hit && guard++ < 80) {
          if (sX < sY) { sX += dX; mx += stepX; side = 0 } else { sY += dY; my += stepY; side = 1 }
          if (mx < 0 || my < 0 || mx >= N || my >= N || grid[my][mx] === 1) hit = true
        }
        const dist = Math.max(0.05, side === 0 ? sX - dX : sY - dY)
        zbuf[sx] = dist

        const lh = Math.min(h * 5, h / dist)
        const y0 = horizon - lh / 2
        // Niebla por distancia + caras laterales mas oscuras: sin las dos cosas
        // el laberinto se lee plano y no como un espacio. El tono lo pone la
        // orientacion del muro, asi se distingue una esquina de una pared.
        const fog = clamp(1 - dist / 12, 0.05, 1)
        // Una celda de cada cinco va pintada (turquesa o añil): el hash por
        // celda es estable, asi que funcionan como mojones — de un vistazo se
        // sabe si ese muro ya se ha visto. Todo marron era un tunel monotono
        // en el que ningun pasillo se distinguia de otro.
        const hsh = ((mx * 73856093) ^ (my * 19349663)) >>> 0
        // 2 celdas de cada 5 van pintadas (antes 1/5): con tanto marron seguido
        // el pasillo se leia como carton. Sigue habiendo mayoria neutra para
        // que las pintadas funcionen de mojon.
        const tinte = hsh % 5
        const base = tinte === 0 ? (side === 1 ? [42, 96, 92] : [64, 148, 140])
          : tinte === 1 || tinte === 3 ? (side === 1 ? [58, 64, 110] : [88, 98, 168])
          : (side === 1 ? [122, 74, 60] : [186, 120, 84])
        ctx.fillStyle = fogged(base, fog)
        ctx.fillRect(sx, y0, 1.5, lh)

        // Junta vertical en cada cambio de celda, y zocalo y cornisa arriba y
        // abajo. Sin esto, quedarse de frente a un muro es un rectangulo de
        // color plano: no se entiende ni que es una pared ni a que distancia.
        // Juntas y cantos al 55% del color de la celda: en las pintadas quedan
        // del mismo tono, no marrones.
        const oscuro = [base[0] * 0.55, base[1] * 0.55, base[2] * 0.55]
        const wx = side === 0 ? fy + dist * ry : fx + dist * rx
        const frac = wx - Math.floor(wx)
        if (frac < 0.035 || frac > 0.965) {
          ctx.fillStyle = fogged(oscuro, fog)
          ctx.fillRect(sx, y0, 1.5, lh)
        }
        const edge = Math.max(1, lh * 0.055)
        ctx.fillStyle = fogged(oscuro, fog)
        ctx.fillRect(sx, y0, 1.5, edge)
        ctx.fillRect(sx, y0 + lh - edge, 1.5, edge)

        // APAREJO DE LADRILLO. Sin esto, ponerse de frente a un muro llenaba el
        // cuadro con un marron liso y no habia nada que mirar. Cuatro hiladas
        // con las juntas verticales trabadas dan textura y, sobre todo, escala:
        // se nota cuanto mide la pared y a que velocidad te acercas.
        // Solo en lo cercano — de lejos la niebla se lo come y seria gasto.
        if (fog > 0.25 && lh > 24) {
          const filas = 4
          const alto = lh / filas
          const junta = fogged(oscuro, fog)
          for (let i = 0; i < filas; i++) {
            const yTop = y0 + i * alto
            ctx.fillStyle = junta
            ctx.fillRect(sx, yTop, 1.5, Math.max(1, alto * 0.07))          // tendel
            // Llaga trabada: media pieza de desfase en las hiladas impares.
            const off = (i % 2) * 0.125
            const f = (frac + off) % 0.25
            if (f < 0.022) ctx.fillRect(sx, yTop, 1.5, alto)
          }
        }
      }

      // Polvo en suspension: motas que flotan y panean con el giro. Dan aire
      // y profundidad a los pasillos, que sin nada en medio parecian carton.
      for (let i = 0; i < 14; i++) {
        const h1 = ((i + 1) * 2654435761) >>> 0
        const u = ((((h1 % 1000) / 1000 - ang / 1.42 + Math.sin(airT / 2200 + i) * 0.02) % 1) + 1) % 1
        const my2 = horizon - h * 0.18 + ((h1 >> 6) % 1000) / 1000 * h * 0.42 + Math.sin(airT / 700 + i * 1.7) * 6
        const tw = 0.1 + 0.1 * Math.sin(airT / 500 + i * 2.3)
        ctx.fillStyle = `rgba(230,225,255,${tw})`
        ctx.fillRect(u * w, my2, 2, 2)
      }

      // Oscurecer techo y suelo del encuadre: el ojo va al centro y el espacio
      // deja de parecer un plano recortado.
      const vTop = ctx.createLinearGradient(0, 0, 0, h * 0.34)
      vTop.addColorStop(0, 'rgba(0,0,0,0.5)'); vTop.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = vTop; ctx.fillRect(0, 0, w, h * 0.34)
      const vBot = ctx.createLinearGradient(0, h, 0, h * 0.66)
      vBot.addColorStop(0, 'rgba(0,0,0,0.55)'); vBot.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = vBot; ctx.fillRect(0, h * 0.66, w, h * 0.34)

      // BRASEROS: fuego de pie en el suelo, recortado contra el z-buffer como
      // los orbes. La llama parpadea y proyecta un charco de luz calida: los
      // pasillos dejan de ser tuneles muertos entre baliza y baliza.
      const encendidos = braseros
        .map((b, i) => ({ b, i, d: (b.x - fx) ** 2 + (b.y - fy) ** 2 }))
        .sort((p, q) => q.d - p.d)
      for (const { b, i } of encendidos) {
        const dx = b.x - fx, dy = b.y - fy
        const depth = Math.cos(ang) * dx + Math.sin(ang) * dy
        if (depth <= 0.5) continue
        const lat = (-Math.sin(ang) * dx + Math.cos(ang) * dy) / fov
        const sx = (w / 2) * (1 + lat / depth)
        if (sx < -40 || sx > w + 40) continue
        const idx = clamp(Math.round(sx), 0, cols - 1)
        if (zbuf[idx] < depth) continue
        const size = clamp((h / depth) * 0.05, 2, h * 0.08)
        const a = clamp(1 - depth / 11, 0.15, 1)
        const base = horizon + h / (2 * depth)
        const flick = 0.8 + 0.3 * Math.sin(airT / 85 + i * 7.3)
        // Charco de luz en el suelo.
        const luz = ctx.createRadialGradient(sx, base, 0, sx, base, size * 2.4 * flick)
        luz.addColorStop(0, `rgba(255,160,70,${a * 0.3})`)
        luz.addColorStop(1, 'rgba(255,160,70,0)')
        ctx.fillStyle = luz
        ctx.beginPath(); ctx.ellipse(sx, base, size * 2.4 * flick, size * 0.9 * flick, 0, 0, Math.PI * 2); ctx.fill()
        // Cuenco.
        ctx.fillStyle = fogged([46, 36, 34], a)
        ctx.fillRect(sx - size * 0.55, base - size * 0.4, size * 1.1, size * 0.4)
        // Llama a dos tonos, con vaiven.
        const lean = Math.sin(airT / 150 + i * 3.1) * size * 0.14
        ctx.fillStyle = `rgba(255,150,60,${a * 0.9})`
        ctx.beginPath()
        ctx.moveTo(sx - size * 0.4, base - size * 0.38)
        ctx.quadraticCurveTo(sx + lean, base - size * (1.1 + 0.5 * flick), sx + size * 0.4, base - size * 0.38)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = `rgba(255,225,120,${a * 0.9})`
        ctx.beginPath()
        ctx.moveTo(sx - size * 0.2, base - size * 0.38)
        ctx.quadraticCurveTo(sx + lean * 0.6, base - size * (0.75 + 0.35 * flick), sx + size * 0.2, base - size * 0.38)
        ctx.closePath(); ctx.fill()
      }

      // Orbes como carteles planos, recortados contra el z-buffer.
      const vis = orbs.filter((o) => !o.got)
        .map((o) => ({ o, d: (o.x - fx) ** 2 + (o.y - fy) ** 2 }))
        .sort((a, b) => b.d - a.d)
      for (const { o } of vis) {
        const dx = o.x - fx, dy = o.y - fy
        const depth = Math.cos(ang) * dx + Math.sin(ang) * dy
        // Por debajo de 0.6 el orbe tapa media pantalla y no se entiende que
        // es; ademas a esa distancia ya esta practicamente recogido.
        if (depth <= 0.6) continue
        const lat = (-Math.sin(ang) * dx + Math.cos(ang) * dy) / fov
        const sx = (w / 2) * (1 + lat / depth)
        if (sx < -40 || sx > w + 40) continue
        const idx = clamp(Math.round(sx), 0, cols - 1)
        if (zbuf[idx] < depth) continue
        const size = clamp(h / depth * 0.075, 2, h * 0.1)
        const a = clamp(1 - depth / 12, 0.18, 1)
        // Haz vertical tipo baliza: en un pasillo largo el orbe era un punto y
        // medio video transcurria sin nada que perseguir a la vista. La
        // columna de luz se ve desde la otra punta y da destino a la camara.
        const beamW = Math.max(1.5, size * 0.5)
        const beam = ctx.createLinearGradient(0, horizon - size * 7, 0, horizon + size)
        beam.addColorStop(0, 'rgba(64,226,208,0)')
        beam.addColorStop(1, `rgba(64,226,208,${a * 0.55})`)
        ctx.fillStyle = beam
        ctx.fillRect(sx - beamW / 2, horizon - size * 7, beamW, size * 8)
        // Halo + nucleo: a lo lejos sigue leyendose como algo que recoger.
        const lat2 = Math.sin(bob / 260 + o.x * 7) * size * 0.25   // flota, no esta clavado
        ctx.fillStyle = `rgba(64,226,208,${a * 0.28})`
        ctx.beginPath(); ctx.arc(sx, horizon + size * 0.4 + lat2, size * 1.55, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = `rgba(120,255,235,${a})`
        ctx.beginPath(); ctx.arc(sx, horizon + size * 0.4 + lat2, size, 0, Math.PI * 2); ctx.fill()
      }

      // Recoger un orbe se celebra en pantalla: destello suave desde el centro
      // y "+100" flotante. Antes el orbe desaparecia y solo cambiaba el HUD.
      if (flash > 0) {
        const a = flash / 240
        const g2 = ctx.createRadialGradient(w / 2, horizon, 0, w / 2, horizon, Math.max(w, h) * 0.6)
        g2.addColorStop(0, `rgba(120,255,235,${a * 0.26})`)
        g2.addColorStop(1, 'rgba(120,255,235,0)')
        ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h)
      }
      if (pop) {
        ctx.globalAlpha = clamp(pop.life / 500, 0, 1)
        ctx.fillStyle = '#9dffee'
        ctx.font = `700 ${Math.max(13, h * 0.03)}px ui-monospace, monospace`
        ctx.textAlign = 'center'
        ctx.fillText(pop.txt || '+100', w / 2, h * 0.4 - (700 - pop.life) * 0.03)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      bloom(ctx, w, h, 0.33)

      // Minimapa: dentro del laberinto, sin el se pierde el sentido del sitio.
      const ms = Math.min(w, h) * 0.26, c = ms / N
      const ox = w - ms - 10, oy = h - ms - 10
      ctx.fillStyle = 'rgba(6,8,16,0.82)'
      ctx.fillRect(ox - 4, oy - 4, ms + 8, ms + 8)
      ctx.fillStyle = '#6b4436'
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (grid[y][x]) ctx.fillRect(ox + x * c, oy + y * c, c + 0.5, c + 0.5)
      }
      ctx.fillStyle = '#40e2d0'
      for (const o of orbs) if (!o.got) ctx.fillRect(ox + o.x * c - 1, oy + o.y * c - 1, 2.5, 2.5)
      ctx.fillStyle = '#ffd45e'
      ctx.beginPath(); ctx.arc(ox + fx * c, oy + fy * c, Math.max(2, c * 0.45), 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#ffd45e'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ox + fx * c, oy + fy * c)
      ctx.lineTo(ox + (fx + Math.cos(ang) * 1.8) * c, oy + (fy + Math.sin(ang) * 1.8) * c)
      ctx.stroke()

      hud(ctx, String(pts).padStart(5, '0'), rec > 0 ? `MEJOR ${String(rec).padStart(5, '0')}` : 'MINOTAURO · 3D', w, '#40e2d0')
    },
  }
}

/* ═══════════════ 4 · 3D · CIRCUITO (proyección de segmentos) ══════════════ */
export function createRacer() {
  const SEG = 200, N = 480
  const ap = autopilot()
  let W = 1, H = 1, road, pos, speed, playerX, rivals, pts, held, hits = 0
  let popFx = 0, popTxt = ''   // "+25 · P3" al adelantar: correr tiene premio visible
  let puesto = 7   // posicion en carrera: 6 rivales + tu. Adelantar sube; que te pasen, baja
  let humano = false, rec = 0   // record (sin muerte: no hay fin)

  const build = () => {
    road = []
    let curve = 0, hill = 0
    for (let i = 0; i < N; i++) {
      if (i % 42 === 0) curve = (Math.random() - 0.5) * 5
      if (i % 66 === 0) hill = (Math.random() - 0.5) * 800
      road.push({ curve, y: hill })
    }
  }

  // Indice siempre normalizado: aunque la posicion se fuera a negativo, esto
  // no puede devolver undefined y tumbar el bucle de dibujo.
  const at = (i) => road[((i % N) + N) % N]
  const seg = (z) => at(Math.floor(z / SEG))

  const reset = (w, h) => {
    W = w; H = h
    build()
    pos = 0; speed = 0; playerX = 0; pts = 0
    held = { left: 0, right: 0, up: 0, down: 0 }
    rec = record.get('racer')
    const COLS = [[86, 154, 232], [232, 196, 76], [126, 200, 118], [214, 112, 176], [236, 140, 72], [150, 132, 232]]
    rivals = Array.from({ length: 6 }, (_, i) => ({
      z: 1600 + i * 2400 + Math.random() * 800,
      x: (Math.random() - 0.5) * 1.4,
      s: 0.5 + Math.random() * 0.2,
      col: COLS[i % COLS.length],
      delante: true,   // todos arrancan por delante: se sale ultimo (P7)
    }))
    puesto = 7
  }

  const MAX = 11000

  // Palmera a contraluz: tronco curvado y abanico de frondas. `alto` es la
  // altura en pantalla; el hash decide hacia donde se inclina.
  const palma = (ctx, x, y, alto, near, hsh) => {
    const ink = fogged([14, 30, 27], near, [24, 30, 46])
    const dir = hsh & 16 ? 1 : -1
    ctx.strokeStyle = ink
    ctx.lineWidth = Math.max(1, alto * 0.07)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + dir * alto * 0.16, y - alto * 0.6, x + dir * alto * 0.28, y - alto)
    ctx.stroke()
    const tx = x + dir * alto * 0.28, ty = y - alto
    ctx.lineWidth = Math.max(1, alto * 0.045)
    for (let f = 0; f < 7; f++) {
      // Abanico de 194° a 345°: cada fronda sube desde la copa (control alto)
      // y solo la punta descuelga. Rectas hacia abajo parecian un paraguas roto.
      const a2 = Math.PI * (1.08 + (f / 6) * 0.84)
      const dxF = Math.cos(a2), dyF = Math.sin(a2)
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.quadraticCurveTo(
        tx + dxF * alto * 0.26, ty - alto * 0.22,
        tx + dxF * alto * 0.5, ty + dyF * alto * 0.1 + alto * 0.16
      )
      ctx.stroke()
    }
  }

  // Cartel DAYA junto a la pista: panel violeta de marca sobre un poste. El
  // texto solo se pinta cuando cabe; de lejos seria una mancha.
  const cartel = (ctx, x, y, s2, near) => {
    ctx.fillStyle = fogged([30, 32, 44], near, [24, 30, 46])
    ctx.fillRect(x - s2 * 0.04, y - s2 * 0.78, s2 * 0.08, s2 * 0.78)
    const bw = s2 * 1.1, bh = s2 * 0.5
    ctx.fillStyle = fogged([109, 92, 255], near, [24, 30, 46])
    ctx.fillRect(x - bw / 2, y - s2 * 1.28, bw, bh)
    const m2 = Math.max(1, s2 * 0.05)
    ctx.fillStyle = fogged([16, 17, 26], near, [24, 30, 46])
    ctx.fillRect(x - bw / 2 + m2, y - s2 * 1.28 + m2, bw - m2 * 2, bh - m2 * 2)
    if (bh > 15) {
      ctx.fillStyle = fogged([233, 231, 255], near, [24, 30, 46])
      ctx.font = `700 ${Math.round(bh * 0.42)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.fillText('DAYA', x, y - s2 * 1.28 + bh * 0.66)
      ctx.textAlign = 'left'
    }
  }

  return {
    reset,
    state: () => ({ x: playerX, speed, pts, hits, puesto }),
    key(k, down) { ap.touch(); if (k in held) held[k] = down ? 1 : 0 },
    update(dt, w, h) {
      if (w !== W || h !== H) reset(w, h)
      ap.tick(dt)
      if (ap.on) humano = false
      else if (!humano) { humano = true; pts = 0; batio = false }
      if (humano && Math.floor(pts) > rec) { rec = Math.floor(pts); record.set('racer', rec); batio = true }
      const s = Math.min(dt, 34) / 1000

      if (ap.on) {
        // Se levanta el pie si hay alguien cerca delante: llegar a tocarlo
        // cuesta mucha mas velocidad que pasar un segundo mas lento.
        // Se prueban nueve carriles y se puntua cada uno por el hueco real
        // que deja hasta el rival mas cercano por delante. Antes se elegia
        // "el lado contrario al que estorba", que con dos rivales en paralelo
        // metia el coche justo entre los dos.
        // El asfalto acaba en |x| = 0.83 (media anchura 1250 frente al 1500 con
        // el que se desplaza el coche). Los carriles llegaban a ±1.2: el piloto
        // apuntaba a la hierba a proposito y se pasaba la carrera frenado ahi.
        let mejor = -Infinity, want = 0, bd = Infinity
        for (let i = 0; i < 9; i++) {
          const lane = -0.72 + (i / 8) * 1.44
          let hueco = 9999
          for (const r of rivals) {
            const d = r.z - pos
            if (d < 0 || d > 7000) continue
            const sep = Math.abs(r.x - lane)
            if (sep < 0.85) {
              // Cuanto mas cerca esta y menos separado, peor carril.
              const malo = (7000 - d) / 700 + (0.85 - sep) * 12
              if (malo < hueco) hueco = -malo
              else hueco = Math.min(hueco, -malo)
            }
            if (d < bd && Math.abs(r.x - playerX) < 1.0) bd = d
          }
          // Preferir carriles centrados y no salirse a la hierba.
          const score = hueco - Math.abs(lane) * 1.5 - Math.abs(lane - playerX) * 0.8
          if (score > mejor) { mejor = score; want = lane }
        }
        // Levantar el pie solo cuando el rival esta de verdad encima, y menos.
        // Con 2600/0.66 el coche pasaba 4 de cada 5 segundos frenado y el video
        // no transmitia velocidad, que es de lo que va el juego.
        const close = bd < 1800
        speed = lerp(speed, MAX * (close ? 0.76 : 0.94), 0.05)
        // Correccion mas viva (0.1 -> 0.2): con la lenta, el empuje de la curva
        // ganaba al volante y el coche se equilibraba fuera del carril elegido.
        playerX = lerp(playerX, clamp(want, -0.72, 0.72), 0.2)
      } else {
        if (held.up) speed = Math.min(MAX, speed + MAX * 0.6 * s)
        else if (held.down) speed = Math.max(0, speed - MAX * 1.2 * s)
        else speed = Math.max(0, speed - MAX * 0.22 * s)
        // El volante tiene que GANAR siempre al empuje de la curva (hasta
        // ~2.25/s a fondo): con 2.2 el coche se quedaba clavado en la hierba
        // exterior de una curva fuerte, remando a 0.01/s. Probado con la
        // auditoria de jugabilidad: girar contra curva dura ahora recupera.
        playerX += ((held.right ? 1 : 0) - (held.left ? 1 : 0)) * 3.4 * s * clamp(speed / MAX, 0.3, 1)
      }

      // La curva empuja hacia fuera: sin esto no se siente que gire. Va por
      // SEGUNDO (× s). Sin eso empujaba una vez por fotograma —unas 60 veces
      // mas fuerte— y el coche vivia fuera de la pista, frenado al minimo.
      playerX -= seg(pos + 600).curve * (speed / MAX) * 0.9 * s
      if (Math.abs(playerX) > 1.5) speed = Math.max(speed * 0.96, MAX * 0.2)
      // Quien juega puede irse a la hierba; el piloto no. Es el tope final tras
      // el empuje de la curva, que es lo que lo sacaba de la pista.
      playerX = clamp(playerX, -2.3, 2.3)
      if (ap.on) playerX = clamp(playerX, -0.78, 0.78)

      pos += speed * s
      pts += (speed / MAX) * dt * 0.05
      popFx = Math.max(0, popFx - dt)
      for (const r of rivals) {
        r.z += MAX * r.s * s
        const rel = r.z - pos
        // Adelantar puntua, sube el puesto y se anuncia: es de lo que va una
        // carrera. Cuenta al cruzar de delante a detras sin roce (si hubo
        // golpe, `tocado` esta puesto y no hay premio). Y al reves: si un
        // rival te pasa de verdad (solo ocurre si vas frenado o chocando),
        // el puesto baja — perder posiciones tambien tiene que doler.
        if (r.delante && rel < -240) {
          r.delante = false
          if (!r.tocado) {
            puesto = Math.max(1, puesto - 1)
            pts += 25; popFx = 800; popTxt = `+25 · P${puesto}`
            if (humano) sfx.over()
          }
        } else if (!r.delante && rel > 240) {
          r.delante = true
          puesto = Math.min(7, puesto + 1)
        }
        if (rel > N * SEG * 0.85) r.z -= N * SEG * 0.85
        if (rel < -600) {
          // El relevo aparece por delante como coche "nuevo": no cuenta como
          // que te hayan adelantado, o P1 seria imposible de mantener.
          r.z += N * SEG * 0.8; r.x = (Math.random() - 0.5) * 1.4
          r.delante = true
          // Cada relevo llega algo mas rapido (tope +0.22 en ~30 vueltas):
          // sin pasar del 0.94 del jugador, para que siempre se pueda adelantar.
          r.s = 0.5 + Math.random() * 0.2 + Math.min(0.22, pos / (N * SEG * 30))
        }
        // 0.6 de margen lateral era casi un tercio de la pista: se contaba
        // golpe con el rival a un coche de distancia. El coche mide w*0.21 en
        // pantalla, que en estas unidades son ~0.35.
        const tocando = Math.abs(rel) < 240 && Math.abs(r.x - playerX) < 0.38
        if (tocando) {
          speed *= 0.94
          if (!r.tocado) { pts = Math.max(0, pts - 30); hits++; r.tocado = 1; if (humano) sfx.hit() }
        } else if (Math.abs(rel) > 500) r.tocado = 0
      }
    },
    draw(ctx, w, h) {
      const horizon = h * 0.42
      // Atardecer: el degradado y el sol dan el punto de fuga sin dibujarlo.
      const sky = ctx.createLinearGradient(0, 0, 0, horizon)
      sky.addColorStop(0, '#1b1b47'); sky.addColorStop(0.6, '#8c3f6b'); sky.addColorStop(1, '#f08a4b')
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon + 1)
      // Sol con halo, como el de Plataformas: el disco plano de antes parecia
      // una pegatina sobre el degradado.
      const sunR = Math.min(w, h) * 0.13
      const halo = ctx.createRadialGradient(w / 2, horizon, sunR * 0.5, w / 2, horizon, sunR * 3)
      halo.addColorStop(0, 'rgba(255,190,110,0.35)'); halo.addColorStop(1, 'rgba(255,190,110,0)')
      ctx.fillStyle = halo
      ctx.beginPath(); ctx.arc(w / 2, horizon, sunR * 3, 0, Math.PI * 2); ctx.fill()
      const sol = ctx.createRadialGradient(w / 2 - sunR * 0.3, horizon - sunR * 0.35, 0, w / 2, horizon, sunR)
      sol.addColorStop(0, '#ffe9b0'); sol.addColorStop(1, 'rgba(245,164,90,0.8)')
      ctx.fillStyle = sol
      ctx.beginPath(); ctx.arc(w / 2, horizon, sunR, 0, Math.PI * 2); ctx.fill()
      // Cordillera lejana, quieta como fondo de era arcade: da profundidad al
      // horizonte, que era una linea seca entre cielo y hierba.
      ctx.fillStyle = '#2c1c40'
      ctx.beginPath()
      ctx.moveTo(0, horizon + 1)
      for (let i = 0; i <= 14; i++) {
        const alto = (Math.abs(Math.sin(i * 2.7)) * 0.55 + (i % 3 === 0 ? 0.45 : 0.18)) * h * 0.05
        ctx.lineTo((i / 14) * w, horizon + 1 - alto)
      }
      ctx.lineTo(w, horizon + 1)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#123028'; ctx.fillRect(0, horizon, w, h - horizon)

      const base = Math.floor(pos / SEG)
      const camY = 1100 + seg(pos).y
      let x = 0, dx = 0
      const proj = []
      for (let i = 0; i < 130; i++) {
        const sg = at(base + i)
        const z = (base + i) * SEG - pos + SEG
        dx += sg.curve
        x += dx
        if (z <= 60) continue
        const scale = 340 / z
        // Anchura 1800 (antes 2500): con 2500 el asfalto llenaba todo el
        // cuadro abajo, los pianos quedaban fuera de pantalla y el coche
        // parecia perdido en un parking. Mas estrecha = corredor de circuito.
        // La escala lateral (1080) mantiene la MISMA proporcion: un x de
        // fisica cae en el mismo sitio visual de la pista que antes.
        proj.push({
          sx: w / 2 + (x - playerX * 1080) * scale,
          sy: horizon + (camY - sg.y) * scale * 0.3,
          sw: scale * 1800,
          i, z,
        })
      }

      const band = (a, b, x1, w1, x2, w2, fill) => {
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.moveTo(x1 - w1, a.sy); ctx.lineTo(x1 + w1, a.sy)
        ctx.lineTo(x2 + w2, b.sy); ctx.lineTo(x2 - w2, b.sy)
        ctx.closePath(); ctx.fill()
      }
      // De lejos a cerca: el pintor tapa lo que queda detras.
      for (let k = proj.length - 1; k > 0; k--) {
        const a = proj[k], b = proj[k - 1]
        const alt = (Math.floor((base + a.i) / 3) % 2) === 0
        // Hierba, banda roja y asfalto. Las bandas alternas son lo que da
        // sensacion de velocidad: sin ellas la carretera parece quieta.
        const near = clamp(1 - a.z / 9000, 0.25, 1)
        ctx.fillStyle = fogged(alt ? [40, 96, 62] : [30, 80, 52], near, [24, 30, 46])
        ctx.beginPath()
        ctx.moveTo(0, a.sy); ctx.lineTo(w, a.sy); ctx.lineTo(w, b.sy); ctx.lineTo(0, b.sy)
        ctx.closePath(); ctx.fill()
        band(a, b, a.sx, a.sw * 0.6, b.sx, b.sw * 0.6,
             fogged(alt ? [214, 74, 66] : [238, 238, 238], near, [24, 30, 46]))
        band(a, b, a.sx, a.sw * 0.5, b.sx, b.sw * 0.5,
             fogged(alt ? [62, 62, 70] : [54, 54, 62], near, [24, 30, 46]))
        if (alt) band(a, b, a.sx, a.sw * 0.018, b.sx, b.sw * 0.018, fogged([245, 245, 235], near, [24, 30, 46]))

        // DECORADO del arcen, dentro del mismo barrido lejos->cerca para que
        // el pintor lo tape donde toca. Hash por segmento del anillo (modulo
        // N): cada palmera y cartel viven en un sitio fijo del circuito.
        const m = (((base + a.i) % N) + N) % N
        const hsh = (m * 2654435761) >>> 0
        if (m % 3 === 0 && hsh % 4 !== 0) {
          const lado = hsh & 8 ? 1 : -1
          const px2 = a.sx + lado * a.sw * (0.72 + ((hsh >> 5) % 23) / 100)
          // Margen ancho: una palmera cercana con el tronco fuera de cuadro
          // aun mete las frondas en pantalla.
          if (px2 > -w * 0.35 && px2 < w * 1.35) {
            palma(ctx, px2, a.sy, Math.min(h * 0.42, a.sw * 0.28) * (0.8 + ((hsh >> 9) % 40) / 100), near, hsh)
          }
        } else if (m % 61 === 0) {
          const lado = hsh & 4 ? 1 : -1
          const px2 = a.sx + lado * a.sw * 0.95
          if (px2 > -100 && px2 < w + 100) cartel(ctx, px2, a.sy, Math.min(h * 0.28, a.sw * 0.2), near)
        }
      }

      // Rivales: cuanto mas lejos, mas pequeños y desvaidos.
      // Desde 600: mas cerca la escala se dispara y el rival se dibuja como un
      // muro que tapa media pantalla.
      const seen = rivals
        .filter((r) => r.z > pos + 600 && r.z < pos + 120 * SEG)
        .sort((a, b) => b.z - a.z)
      for (const r of seen) {
        const rel = r.z - pos
        const n = Math.floor(rel / SEG)
        const p = proj[clamp(n, 0, proj.length - 1)]
        if (!p) continue
        const scale = 340 / rel
        // Misma escala lateral que el coche propio (1080). Con otra distinta
        // la x de un rival no significaria lo mismo que la del jugador, y ni
        // la eleccion de carril ni el choque compararian lo que creen.
        const sx = p.sx + r.x * 1080 * scale
        // 600 (antes 820): los rivales estaban dimensionados para la pista
        // ancha; en la estrecha parecian camiones. ~1/3 del asfalto, como el
        // coche propio.
        const cw = Math.min(w * 0.32, scale * 600), ch = cw * 0.6
        const near = clamp(1 - rel / 9000, 0.2, 1)
        // Mismo tratamiento que el coche propio: sombra, ruedas, luneta y
        // pilotos traseros. El rectangulo liso de antes parecia una caja
        // flotando al lado de un coche con volumen.
        const ink = fogged([18, 20, 30], near, [24, 30, 46])
        ctx.fillStyle = `rgba(0,0,0,${0.35 * near})`
        ctx.beginPath(); ctx.ellipse(sx, p.sy, cw * 0.55, ch * 0.13, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = fogged(r.col, near, [24, 30, 46])
        ctx.fillRect(sx - cw / 2, p.sy - ch, cw, ch)
        // Techo algo mas claro: insinua la luz del atardecer sin otro color.
        ctx.fillStyle = fogged([Math.min(255, r.col[0] + 46), Math.min(255, r.col[1] + 46), Math.min(255, r.col[2] + 46)], near, [24, 30, 46])
        ctx.fillRect(sx - cw / 2, p.sy - ch, cw, ch * 0.12)
        ctx.fillStyle = ink
        ctx.fillRect(sx - cw * 0.31, p.sy - ch * 0.88, cw * 0.62, ch * 0.4)
        ctx.fillRect(sx - cw * 0.52, p.sy - ch * 0.3, cw * 0.16, ch * 0.3)
        ctx.fillRect(sx + cw * 0.36, p.sy - ch * 0.3, cw * 0.16, ch * 0.3)
        if (cw > 12) {
          ctx.fillStyle = fogged([255, 92, 74], near, [24, 30, 46])
          ctx.fillRect(sx - cw * 0.42, p.sy - ch * 0.34, cw * 0.13, ch * 0.11)
          ctx.fillRect(sx + cw * 0.29, p.sy - ch * 0.34, cw * 0.13, ch * 0.11)
        }
      }

      // (Hubo aqui unas "rafagas de velocidad" por los flancos: con la pista
      // ocupando media pantalla caian sobre el asfalto y parecian arañazos o
      // lluvia sucia. La velocidad ya la cuentan las bandas y el decorado.)

      // El coche propio, inclinandose en las curvas. 0.18 de ancho: se probo
      // 0.24 con la pista estrecha y quedaba tosco — un cochazo hinchado.
      // Fino y proporcionado a unas 3 calles de asfalto.
      const cw = w * 0.18, ch = cw * 0.48
      ctx.save()
      ctx.translate(w / 2 + playerX * 20, h * 0.9)
      ctx.rotate(clamp(-seg(pos + 600).curve * 0.028, -0.09, 0.09))
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.beginPath(); ctx.ellipse(0, ch * 0.14, cw * 0.54, ch * 0.15, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e5433c'; ctx.fillRect(-cw / 2, -ch, cw, ch)
      ctx.fillStyle = '#ff6f63'; ctx.fillRect(-cw / 2, -ch, cw, ch * 0.14)
      ctx.fillStyle = '#7fd4ea'; ctx.fillRect(-cw * 0.31, -ch * 0.94, cw * 0.62, ch * 0.44)
      ctx.fillStyle = '#15161c'
      ctx.fillRect(-cw * 0.52, -ch * 0.16, cw * 0.17, ch * 0.32)
      ctx.fillRect(cw * 0.35, -ch * 0.16, cw * 0.17, ch * 0.32)
      ctx.restore()

      // Destello de lente del sol: circulos translucidos sobre el eje que une
      // el centro de pantalla con el sol, como una camara real al contraluz.
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const fcx = w / 2, fcy = h / 2, fsx = w / 2, fsy = horizon
      for (const [t2, fr2, fa] of [[0.45, 0.06, 0.06], [0.85, 0.028, 0.1], [1.0, 0.13, 0.05], [1.35, 0.045, 0.07]]) {
        const px3 = fcx + (fsx - fcx) * t2, py3 = fcy + (fsy - fcy) * t2
        const rad = Math.min(w, h) * fr2
        const gfl = ctx.createRadialGradient(px3, py3, 0, px3, py3, rad)
        gfl.addColorStop(0, `rgba(255,220,150,${fa})`)
        gfl.addColorStop(1, 'rgba(255,220,150,0)')
        ctx.fillStyle = gfl
        ctx.beginPath(); ctx.arc(px3, py3, rad, 0, Math.PI * 2); ctx.fill()
      }
      // Raya horizontal de lente atravesando el sol.
      const streak = ctx.createLinearGradient(fsx - w * 0.3, 0, fsx + w * 0.3, 0)
      streak.addColorStop(0, 'rgba(255,220,150,0)')
      streak.addColorStop(0.5, 'rgba(255,230,170,0.14)')
      streak.addColorStop(1, 'rgba(255,220,150,0)')
      ctx.fillStyle = streak
      ctx.fillRect(fsx - w * 0.3, fsy - 1.5, w * 0.6, 3)
      ctx.restore()
      bloom(ctx, w, h, 0.22)

      if (popFx > 0) {
        ctx.globalAlpha = clamp(popFx / 500, 0, 1)
        ctx.fillStyle = '#ffe9a8'
        ctx.font = `700 ${Math.max(12, h * 0.026)}px ui-monospace, monospace`
        ctx.textAlign = 'center'
        ctx.fillText(popTxt || '+25', w / 2 + playerX * 20, h * 0.9 - ch * 1.25 - (800 - popFx) * 0.03)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      hud(ctx, String(Math.floor(pts)).padStart(5, '0'), `P${puesto} · ${Math.round(speed / 45)} km/h` + (rec > 0 ? ` · MEJOR ${rec}` : ''), w, '#ffd45e')
    },
  }
}

/* ═════════════════ 5 · MODERNO · SUPERVIVIENTE (oleadas) ══════════════════ */
export function createSurvivor() {
  const ap = autopilot()
  let W = 1, H = 1, me, foes, shots, orbs, bits, held, pts, lvl, xp, cool, spawn, t, hp, deaths = 0
  let lvlFx = 0   // subir de nivel se anuncia: sin esto la barra se vaciaba y ya
  let humano = false, rec = 0, batio = false, fin = null   // partida humana y record
  let pops = []   // numeros de daño flotantes: el "+25" se ve donde matas
  let fogo = 0    // fogonazo del cañon al disparar
  // Cuenta atras del JEFE. El primero a los 20 s — una run media dura poco y
  // con 45 s la mayoria no lo conocia (ni salia en el video) — y los
  // siguientes cada 45 s.
  let jefeT = 20000

  const reset = (w, h) => {
    W = w; H = h
    // Al 1.6% del lienzo el protagonista era un punto de 6 px y no se leia la
    // partida. Mismo criterio que en Neon: 3%.
    me = { x: W / 2, y: H / 2, r: Math.max(7, Math.min(W, H) * 0.030) }
    foes = []; shots = []; orbs = []; bits = []; pops = []; fogo = 0; jefeT = 20000
    held = { left: 0, right: 0, up: 0, down: 0 }
    pts = 0; lvl = 1; xp = 0; cool = 0; spawn = 0; t = 0; hp = 3
    rec = record.get('survivor')
    // Arranca ya poblado: vacio los primeros segundos, la tarjeta de la
    // landing parece un juego roto.
    for (let i = 0; i < 7; i++) emit()
  }

  const emit = () => {
    const unit = Math.min(W, H)
    const e = (Math.random() * 4) | 0, p = Math.random()
    foes.push({
      x: e === 0 ? -20 : e === 1 ? W + 20 : p * W,
      y: e === 2 ? -20 : e === 3 ? H + 20 : p * H,
      r: unit * 0.030, hp: 1 + Math.floor(t / 30000),
      nace: 380,   // animacion de entrada: antes aparecian de golpe, como bugs
    })
  }

  const burst = (x, y, n) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 120
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 260 + Math.random() * 280 })
    }
  }

  return {
    reset,
    state: () => ({ x: me.x, y: me.y, lvl, pts, foes: foes.length, deaths }),
    key(k, down) { ap.touch(); if (k in held) held[k] = down ? 1 : 0 },
    update(dt, w, h) {
      if (w !== W || h !== H) reset(w, h)
      ap.tick(dt)
      if (ap.on) humano = false
      else if (!humano) { humano = true; pts = 0; batio = false }
      if (humano && Math.floor(pts) > rec) { rec = Math.floor(pts); record.set('survivor', rec); batio = true }
      if (fin && (fin.life -= dt) <= 0) fin = null
      const s = Math.min(dt, 34) / 1000
      const unit = Math.min(W, H)
      t += dt; cool -= dt; spawn -= dt

      // Tope de enemigos vivos y aparicion sostenible. Sin tope el ritmo
      // bajaba a 130 ms —casi 8 por segundo, mas de los que se pueden matar—
      // y la horda crecia sin limite: morir no era un fallo del piloto, era
      // cuestion de tiempo.
      if (spawn <= 0 && foes.length < 12) { spawn = clamp(620 - t / 120, 300, 620); emit() }
      else if (spawn <= 0) spawn = 260
      // Con la horda diezmada, refuerzos casi al instante: en video (y en
      // juego) un lienzo con 3 enemigos perdidos parecia un campo muerto.
      if (foes.length < 5) spawn = Math.min(spawn, 120)

      // JEFE cada 45 s: grande, lento y con vida propia. Estructura la
      // partida en oleadas con climax en vez de un goteo uniforme.
      jefeT -= dt
      if (jefeT <= 0) {
        jefeT = 45000
        const e2 = (Math.random() * 4) | 0, p2 = Math.random()
        const vida = 14 + Math.floor(t / 45000) * 4
        foes.push({
          x: e2 === 0 ? -40 : e2 === 1 ? W + 40 : p2 * W,
          y: e2 === 2 ? -40 : e2 === 3 ? H + 40 : p2 * H,
          r: unit * 0.075, hp: vida, hpMax: vida, boss: true, nace: 600,
        })
      }

      let mx = 0, my = 0
      if (ap.on) {
        // MIRAR ANTES DE MOVERSE. Se prueban 16 direcciones, se calcula donde
        // estaria el jugador dentro de medio segundo y donde estarian para
        // entonces los enemigos (que van a por el), y se elige la salida con
        // mas hueco. Un campo de fuerzas, como antes, se mete solo en las
        // esquinas: la suma de empujones apunta a un sitio sin salida.
        const paso = unit * 0.62 * 0.5
        const avance = unit * 0.33 * 0.5      // lo que avanza un enemigo
        // El orbe mas cercano tira un poco del piloto. Antes solo huia: los
        // orbes caducaban sin recoger y la pantalla era un confeti verde. El
        // peso es bajo a proposito — el hueco libre puntua hasta 0.55·unit y
        // esto añade como mucho ±0.11·unit — para que nunca gane a la
        // supervivencia, que es la metrica que esta afinada.
        let orbe2 = null, od = Infinity
        for (const o of orbs) {
          const d = (o.x - me.x) ** 2 + (o.y - me.y) ** 2
          if (d < od) { od = d; orbe2 = o }
        }
        let mejor = -Infinity
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          const nx = clamp(me.x + Math.cos(a) * paso, me.r, W - me.r)
          const ny = clamp(me.y + Math.sin(a) * paso, me.r, H - me.r)
          let cerca = Infinity
          for (const f of foes) {
            const fd = Math.hypot(me.x - f.x, me.y - f.y) || 1
            const fx = f.x + ((me.x - f.x) / fd) * avance
            const fy = f.y + ((me.y - f.y) / fd) * avance
            const d = Math.hypot(nx - fx, ny - fy)
            if (d < cerca) cerca = d
          }
          if (cerca === Infinity) cerca = unit
          // Penaliza pegarse a los bordes: ahi se pierde salida. El peso importa
          // tanto como la idea: con 0.8 frente a un hueco valorado hasta 0.7*unit
          // huir siempre ganaba y el piloto acababa clavado contra el borde de
          // arriba, medio cuerpo fuera de cuadro.
          const pared = Math.min(nx, W - nx, ny, H - ny)
          const gana = orbe2 ? -Math.hypot(nx - orbe2.x, ny - orbe2.y) * 0.35 : 0
          const score = Math.min(cerca, unit * 0.55) + Math.min(pared, unit * 0.25) * 2.2 + gana
          if (score > mejor) { mejor = score; mx = Math.cos(a); my = Math.sin(a) }
        }
      } else {
        mx = (held.right ? 1 : 0) - (held.left ? 1 : 0)
        my = (held.down ? 1 : 0) - (held.up ? 1 : 0)
        const m = Math.hypot(mx, my) || 1
        if (mx || my) { mx /= m; my /= m }
      }
      me.x = clamp(me.x + mx * unit * 0.62 * s, me.r, W - me.r)
      me.y = clamp(me.y + my * unit * 0.62 * s, me.r, H - me.r)

      // Dispara solo al mas cercano: el jugador solo se mueve, como el genero.
      if (cool <= 0 && foes.length) {
        let best = foes[0], bd = Infinity
        for (const f of foes) {
          const d = (f.x - me.x) ** 2 + (f.y - me.y) ** 2
          if (d < bd) { bd = d; best = f }
        }
        const a = Math.atan2(best.y - me.y, best.x - me.x)
        const n = 1 + Math.floor(lvl / 3)
        for (let i = 0; i < n; i++) {
          const sp = a + (i - (n - 1) / 2) * 0.18
          shots.push({ x: me.x, y: me.y, vx: Math.cos(sp) * unit, vy: Math.sin(sp) * unit, life: 900 })
        }
        cool = Math.max(130, 460 - lvl * 25)
        fogo = 90
      }

      for (let i = shots.length - 1; i >= 0; i--) {
        const b = shots[i]
        b.x += b.vx * s; b.y += b.vy * s; b.life -= dt
        if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) { shots.splice(i, 1); continue }
        for (let j = foes.length - 1; j >= 0; j--) {
          const f = foes[j]
          if (Math.hypot(f.x - b.x, f.y - b.y) < f.r + 3) {
            shots.splice(i, 1)
            if (--f.hp <= 0) {
              foes.splice(j, 1)
              if (f.boss) {
                // Derribar al jefe es el momentazo: recompensa a la altura.
                pts += 250; burst(f.x, f.y, 30)
                for (let k = 0; k < 5; k++) {
                  orbs.push({ x: f.x + (Math.random() - 0.5) * f.r * 2, y: f.y + (Math.random() - 0.5) * f.r * 2, life: 9000 })
                }
                pops.push({ x: f.x, y: f.y, txt: '+250 ¡JEFE!', life: 900 })
                if (humano) sfx.boom()
              } else {
                pts += 25; burst(f.x, f.y, 8)
                orbs.push({ x: f.x, y: f.y, life: 7000 })
                pops.push({ x: f.x, y: f.y, txt: '+25', life: 600 })
                if (humano) sfx.hit()
              }
            }
            break
          }
        }
      }

      for (const f of foes) {
        const d = Math.hypot(me.x - f.x, me.y - f.y) || 1
        // El jefe va a medio paso: amenaza que se acerca, no bala que caza.
        const sp = unit * (0.18 + Math.min(0.1, t / 320000)) * s * (f.boss ? 0.5 : 1)
        f.x += ((me.x - f.x) / d) * sp
        f.y += ((me.y - f.y) / d) * sp
        if (d < me.r + f.r) {
          if (--hp <= 0) {
            // Fin de partida humana: cartel y RUN NUEVO de verdad (nivel y
            // reloj de dificultad a cero). El piloto conserva la multa blanda.
            if (humano) {
              fin = { pts: Math.floor(pts), rec, nuevo: batio, life: 2600 }
              pts = 0; lvl = 1; xp = 0; t = 0; batio = false; jefeT = 20000
              sfx.boom(); if (fin.nuevo) sfx.record(); else sfx.fin()
            } else pts = Math.max(0, pts - 150)
            hp = 3; foes.length = 0; burst(me.x, me.y, 24); deaths++
          }
          else { f.x -= ((me.x - f.x) / d) * unit * 0.12; f.y -= ((me.y - f.y) / d) * unit * 0.12 }
        }
      }

      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i]
        o.life -= dt
        const d = Math.hypot(me.x - o.x, me.y - o.y)
        // Iman generoso: se mata mas rapido de lo que se recoge y los orbes se
        // acumulaban como confeti; con mas radio la pantalla se limpia sola y
        // ademas se ven volar hacia el jugador.
        if (d < unit * 0.36) {
          o.x += (me.x - o.x) * 5 * s; o.y += (me.y - o.y) * 5 * s
          // Estela al volar hacia el jugador: se ve el iman trabajando.
          if (Math.random() < 0.5) bits.push({ x: o.x, y: o.y, vx: 0, vy: 0, life: 170, g: 1 })
        }
        if (d < me.r + 7) {
          orbs.splice(i, 1); xp++
          if (xp >= lvl * 5) { xp = 0; lvl++; pts += 100; lvlFx = 900; if (humano) sfx.level() }
        } else if (o.life <= 0) orbs.splice(i, 1)
      }

      for (let i = bits.length - 1; i >= 0; i--) {
        const p = bits[i]
        p.x += p.vx * s; p.y += p.vy * s; p.life -= dt
        if (p.life <= 0) bits.splice(i, 1)
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        if ((pops[i].life -= dt) <= 0) pops.splice(i, 1)
      }
      for (const f of foes) if (f.nace > 0) f.nace -= dt
      fogo = Math.max(0, fogo - dt)
      lvlFx = Math.max(0, lvlFx - dt)
    },
    draw(ctx, w, h) {
      const unit = Math.min(w, h)
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
      bg.addColorStop(0, '#151a2e'); bg.addColorStop(1, '#0a0c16')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)

      // Nebulosas a la deriva: dos manchas de color muy tenues que quitan la
      // sensacion de lienzo negro muerto sin robar contraste al juego.
      const nx1 = w * 0.5 + Math.sin(t / 9000) * w * 0.3
      const ny1 = h * 0.35 + Math.cos(t / 11000) * h * 0.2
      const neb1 = ctx.createRadialGradient(nx1, ny1, 0, nx1, ny1, unit * 0.55)
      neb1.addColorStop(0, 'rgba(90,110,220,0.07)'); neb1.addColorStop(1, 'rgba(90,110,220,0)')
      ctx.fillStyle = neb1; ctx.fillRect(0, 0, w, h)
      const nx2 = w * 0.5 - Math.sin(t / 12000) * w * 0.32
      const ny2 = h * 0.68 + Math.sin(t / 8000) * h * 0.18
      const neb2 = ctx.createRadialGradient(nx2, ny2, 0, nx2, ny2, unit * 0.5)
      neb2.addColorStop(0, 'rgba(64,200,190,0.06)'); neb2.addColorStop(1, 'rgba(64,200,190,0)')
      ctx.fillStyle = neb2; ctx.fillRect(0, 0, w, h)

      ctx.strokeStyle = 'rgba(96,132,220,0.13)'
      ctx.lineWidth = 1
      const g = unit * 0.12
      for (let x = 0; x < w; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
      for (let y = 0; y < h; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }

      // Luz radial que acompaña al jugador: foco de atencion y sensacion de
      // antorcha en la oscuridad — el campo dejaba al heroe perdido en negro.
      const luz = ctx.createRadialGradient(me.x, me.y, 0, me.x, me.y, unit * 0.5)
      luz.addColorStop(0, 'rgba(120,190,255,0.11)')
      luz.addColorStop(1, 'rgba(120,190,255,0)')
      ctx.fillStyle = luz
      ctx.fillRect(0, 0, w, h)

      // Chispas y orbes suman luz: sobre el fondo oscuro pasan de ser puntos
      // planos a parecer material incandescente.
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const chispa = Math.max(2, unit * 0.008)
      for (const p of bits) {
        // Naranja = metralla de enemigo; verde = estela de orbe imantado.
        ctx.fillStyle = p.g
          ? `rgba(123,239,153,${clamp(p.life / 200, 0, 1) * 0.7})`
          : `rgba(255,170,90,${clamp(p.life / 520, 0, 1)})`
        ctx.fillRect(p.x - chispa / 2, p.y - chispa / 2, chispa, chispa)
      }
      // Los orbes de experiencia en verde: se distinguen del enemigo al vuelo.
      const orbe = Math.max(4, unit * 0.014)
      for (const o of orbs) {
        ctx.fillStyle = 'rgba(110,230,140,0.25)'
        ctx.beginPath(); ctx.arc(o.x, o.y, orbe * 2.2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#7bef99'
        ctx.beginPath(); ctx.arc(o.x, o.y, orbe, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()

      ctx.lineWidth = Math.max(2, unit * 0.007)
      for (const f of foes) {
        // Animacion de nacer: crece desde el 40% y entra en fundido. Antes
        // aparecian de golpe en el borde, como un fallo de render.
        const vida = f.nace > 0 ? 1 - f.nace / (f.boss ? 600 : 380) : 1
        const fr = f.r * (0.4 + 0.6 * vida)
        ctx.globalAlpha = 0.25 + 0.75 * vida
        // Naranja = aguanta un golpe; rojo = aguanta mas; violeta = JEFE.
        ctx.strokeStyle = f.boss ? '#d76bff' : f.hp > 1 ? '#ff5f52' : '#ff9d4d'
        // Cuerpo relleno + halo: el hexagono hueco se leia como un icono suelto
        // y no como una amenaza con volumen.
        ctx.fillStyle = f.boss ? 'rgba(215,107,255,0.2)' : f.hp > 1 ? 'rgba(255,95,82,0.22)' : 'rgba(255,157,77,0.18)'
        ctx.shadowColor = f.boss ? '#d76bff' : f.hp > 1 ? '#ff5f52' : '#ff9d4d'
        ctx.shadowBlur = Math.max(6, unit * 0.022)
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + t / (f.boss ? 1600 : 900)
          const x = f.x + Math.cos(a) * fr, y = f.y + Math.sin(a) * fr
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
        }
        ctx.closePath(); ctx.fill(); ctx.stroke()
        if (f.boss) {
          // Anillo interior + barra de vida en arco: se ve cuanto le queda.
          ctx.strokeStyle = 'rgba(215,107,255,0.45)'
          ctx.beginPath(); ctx.arc(f.x, f.y, fr * 0.55, 0, Math.PI * 2); ctx.stroke()
          ctx.strokeStyle = '#f2c4ff'
          ctx.lineWidth = Math.max(2.5, unit * 0.009)
          ctx.beginPath()
          ctx.arc(f.x, f.y, fr * 1.35, -Math.PI / 2, -Math.PI / 2 + (f.hp / f.hpMax) * Math.PI * 2)
          ctx.stroke()
          ctx.lineWidth = Math.max(2, unit * 0.007)
        }
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = '#ffe15c'
      ctx.shadowColor = '#ffe15c'; ctx.shadowBlur = Math.max(5, unit * 0.018)
      const bala = Math.max(3, unit * 0.011)
      for (const b of shots) {
        // Estela corta: dice hacia donde vuela; el punto suelto parecia ruido.
        ctx.strokeStyle = 'rgba(255,225,92,0.4)'
        ctx.lineWidth = Math.max(1.5, bala * 0.5)
        ctx.beginPath()
        ctx.moveTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.fillRect(b.x - bala / 2, b.y - bala / 2, bala, bala)
      }

      ctx.shadowColor = '#5ad6ff'; ctx.shadowBlur = Math.max(10, unit * 0.035)
      ctx.fillStyle = 'rgba(90,214,255,0.22)'
      ctx.beginPath(); ctx.arc(me.x, me.y, me.r * 2.1, 0, Math.PI * 2); ctx.fill()
      // Cañon hacia el enemigo mas cercano: la bola lisa no decia ni quien
      // era el jugador ni por que salian balas.
      let cerca = null, cd = 1e9
      for (const f of foes) {
        const d2 = (f.x - me.x) ** 2 + (f.y - me.y) ** 2
        if (d2 < cd) { cd = d2; cerca = f }
      }
      if (cerca) {
        const a = Math.atan2(cerca.y - me.y, cerca.x - me.x)
        ctx.fillStyle = '#bdeeff'
        ctx.save()
        ctx.translate(me.x, me.y); ctx.rotate(a)
        ctx.fillRect(0, -Math.max(2, me.r * 0.22), me.r * 1.7, Math.max(4, me.r * 0.44))
        // Fogonazo en la boca del cañon: el disparo tiene origen visible.
        if (fogo > 0) {
          const fa = fogo / 90
          ctx.fillStyle = `rgba(255,240,180,${fa * 0.9})`
          ctx.beginPath()
          ctx.arc(me.r * 1.85, 0, me.r * 0.42 * (1.4 - fa * 0.4), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      ctx.fillStyle = '#5ad6ff'
      ctx.beginPath(); ctx.arc(me.x, me.y, me.r, 0, Math.PI * 2); ctx.fill()
      const late = 1 + Math.sin(t / 240) * 0.12   // latido suave
      ctx.fillStyle = '#e9fbff'
      ctx.beginPath(); ctx.arc(me.x, me.y, me.r * 0.45 * late, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0

      // Subir de nivel se celebra sobre el jugador: anillo que se expande y
      // rotulo. La barra de abajo sola no se ve mientras esquivas.
      if (lvlFx > 0) {
        const t2 = 1 - lvlFx / 900
        ctx.strokeStyle = `rgba(123,239,153,${(1 - t2) * 0.85})`
        ctx.lineWidth = Math.max(2, unit * 0.008)
        ctx.beginPath(); ctx.arc(me.x, me.y, me.r * (1.4 + t2 * 5), 0, Math.PI * 2); ctx.stroke()
        ctx.globalAlpha = 1 - t2
        ctx.fillStyle = '#b8ffcc'
        ctx.font = `700 ${Math.max(12, unit * 0.042)}px ui-monospace, monospace`
        ctx.textAlign = 'center'
        ctx.fillText(`NIVEL ${lvl}`, me.x, me.y - me.r * 2.8 - t2 * unit * 0.05)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      bloom(ctx, w, h, 0.45)

      // Numeros de daño flotantes: la recompensa de cada muerte, en el sitio.
      ctx.font = `700 ${Math.max(10, unit * 0.026)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      for (const p of pops) {
        ctx.globalAlpha = clamp(p.life / 420, 0, 1)
        ctx.fillStyle = '#ffd9a8'
        ctx.fillText(p.txt, p.x, p.y - (600 - p.life) * 0.04)
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'

      // Vineta: cierra el encuadre, igual que en Neon.
      const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72)
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)')
      ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h)

      const bw = w * 0.34
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fillRect((w - bw) / 2, h - 14, bw, 3)
      ctx.fillStyle = '#7bef99'
      ctx.fillRect((w - bw) / 2, h - 14, bw * clamp(xp / (lvl * 5), 0, 1), 3)
      hud(ctx, String(pts).padStart(5, '0'), `nv ${lvl} · ${'♥'.repeat(Math.max(0, hp))}` + (rec > 0 ? ` · MEJOR ${rec}` : ''), w, '#5ad6ff')
      if (fin) finBanner(ctx, w, h, fin)
    },
  }
}

/* ═════════════════ 6 · MODERNO · NEÓN (rejilla elástica) ══════════════════ */
export function createNeon() {
  const ap = autopilot()
  let W = 1, H = 1, nodes, cols, rows, gap
  let me, foes, shots, bits, held, pts, spawn, t, aim, cool, deaths = 0
  let humano = false, rec = 0, batio = false, fin = null   // partida humana y record

  const buildGrid = () => {
    gap = Math.max(22, Math.min(W, H) / 10)
    cols = Math.ceil(W / gap) + 1
    rows = Math.ceil(H / gap) + 1
    nodes = []
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      nodes.push({ ox: x * gap, oy: y * gap, x: x * gap, y: y * gap, vx: 0, vy: 0 })
    }
  }

  const reset = (w, h) => {
    W = w; H = h
    buildGrid()
    // Piezas al 3% del lienzo. Al 1.6% la nave eran 6 px en la tarjeta de la
    // landing: no se distinguia quien eras ni a que disparabas.
    me = { x: W / 2, y: H / 2, r: Math.max(7, Math.min(W, H) * 0.030) }
    foes = []; shots = []; bits = []
    held = { left: 0, right: 0, up: 0, down: 0 }
    pts = 0; spawn = 0; t = 0; aim = 0; cool = 0
    rec = record.get('neon')
    for (let i = 0; i < 8; i++) emit()
  }

  const emit = () => {
    const unit = Math.min(W, H)
    const e = (Math.random() * 4) | 0, p = Math.random()
    // 1 de cada 10 es DIVISOR: mas grande, violeta, y al morir se parte en
    // dos normales. Da variedad tactica (¿lo revientas ya o lo dejas lejos?).
    // La tasa se afino con la auditoria: al 20% el piloto pasaba de 2 a 19
    // muertes en 2 minutos; al 10% con crias mansas queda en un digito.
    const divisor = Math.random() < 0.1
    const f = {
      x: e === 0 ? -20 : e === 1 ? W + 20 : p * W,
      y: e === 2 ? -20 : e === 3 ? H + 20 : p * H,
      r: unit * (divisor ? 0.046 : 0.032), a: Math.random() * 6,
      divisor,
    }
    foes.push(f)
    return f
  }

  /* La onda que deforma la rejilla: es el efecto que define el juego. */
  const shock = (x, y, power) => {
    for (const p of nodes) {
      const dx = p.x - x, dy = p.y - y
      const d2 = dx * dx + dy * dy
      const d = Math.sqrt(d2) || 1
      if (d > gap * 5) continue
      const f = (power * gap * 14) / (d2 + gap * 10)
      p.vx += (dx / d) * f
      p.vy += (dy / d) * f
    }
  }

  const burst = (x, y, n) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 180
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 300 + Math.random() * 340 })
    }
  }

  return {
    reset,
    state: () => ({ x: me.x, y: me.y, pts, foes: foes.length, deaths }),
    key(k, down) { ap.touch(); if (k in held) held[k] = down ? 1 : 0 },
    pointer(x, y) { ap.touch(); aim = Math.atan2(y - me.y, x - me.x) },
    update(dt, w, h) {
      if (w !== W || h !== H) reset(w, h)
      ap.tick(dt)
      if (ap.on) humano = false
      else if (!humano) { humano = true; pts = 0; batio = false }
      if (humano && Math.floor(pts) > rec) { rec = Math.floor(pts); record.set('neon', rec); batio = true }
      if (fin && (fin.life -= dt) <= 0) fin = null
      const s = Math.min(dt, 34) / 1000
      const unit = Math.min(W, H)
      t += dt; spawn -= dt; cool -= dt

      // Muelle hacia su sitio + rozamiento: asi la rejilla ondea y vuelve.
      for (const p of nodes) {
        p.vx += (p.ox - p.x) * 13 * s
        p.vy += (p.oy - p.y) * 13 * s
        p.vx *= 0.92; p.vy *= 0.92
        p.x += p.vx * s * 58
        p.y += p.vy * s * 58
      }

      // Menos enemigos ahora que son mas grandes: con 18 el lienzo se saturaba.
      // El tope se queda en 11: se probo crecer hasta 13-15 y el piloto moria
      // por cerco (de 1 muerte a 6-12 en la auditoria). La rampa infinita va
      // en la velocidad de los enemigos, que el esquive si sabe absorber.
      if (spawn <= 0 && foes.length < 11) {
        spawn = clamp(300 - t / 65, 150, 300)
        const f = emit(); shock(f.x, f.y, 0.6)
      } else if (spawn <= 0) spawn = 150

      let mx = 0, my = 0
      if (ap.on) {
        // Mismo criterio que en Superviviente: se prueban 16 salidas y se elige
        // la que deja mas hueco dentro de medio segundo, contando que los
        // enemigos vienen hacia aqui.
        const paso = unit * 0.6 * 0.5
        // El mismo factor de rampa que llevan los enemigos: si ellos aceleran
        // y el piloto sigue previendo la velocidad base, llega tarde.
        const avance = unit * 0.17 * (1 + Math.min(0.25, t / 400000)) * 0.5
        let best = null, bd = Infinity
        for (const f of foes) {
          const d = Math.hypot(f.x - me.x, f.y - me.y)
          if (d < bd) { bd = d; best = f }
        }
        let mejor = -Infinity
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          const nx = clamp(me.x + Math.cos(a) * paso, me.r, W - me.r)
          const ny = clamp(me.y + Math.sin(a) * paso, me.r, H - me.r)
          let cerca = Infinity
          for (const f of foes) {
            const fd = Math.hypot(me.x - f.x, me.y - f.y) || 1
            const fx = f.x + ((me.x - f.x) / fd) * avance
            const fy = f.y + ((me.y - f.y) / fd) * avance
            const d = Math.hypot(nx - fx, ny - fy)
            if (d < cerca) cerca = d
          }
          if (cerca === Infinity) cerca = unit
          // Mismo reequilibrio que en Superviviente: sin el, la nave se iba al
          // borde y se quedaba ahi toda la partida.
          const pared = Math.min(nx, W - nx, ny, H - ny)
          const score = Math.min(cerca, unit * 0.55) + Math.min(pared, unit * 0.25) * 2.2
          if (score > mejor) { mejor = score; mx = Math.cos(a); my = Math.sin(a) }
        }
        if (best) aim = Math.atan2(best.y - me.y, best.x - me.x)
      } else {
        mx = (held.right ? 1 : 0) - (held.left ? 1 : 0)
        my = (held.down ? 1 : 0) - (held.up ? 1 : 0)
        const m = Math.hypot(mx, my) || 1
        if (mx || my) { mx /= m; my /= m; aim = Math.atan2(my, mx) }
      }
      me.x = clamp(me.x + mx * unit * 0.6 * s, me.r, W - me.r)
      me.y = clamp(me.y + my * unit * 0.6 * s, me.r, H - me.r)
      if (Math.abs(mx) + Math.abs(my) > 0.1) {
        shock(me.x, me.y, 0.05)
        // Estela del propulsor: chispas cian que caen por detras de la nave.
        // Sin ellas la nave patinaba por el lienzo como un cursor.
        bits.push({
          x: me.x - Math.cos(aim) * me.r * 1.1 + (Math.random() - 0.5) * me.r * 0.6,
          y: me.y - Math.sin(aim) * me.r * 1.1 + (Math.random() - 0.5) * me.r * 0.6,
          vx: -mx * unit * 0.14, vy: -my * unit * 0.14,
          life: 240, cyan: 1,
        })
      }

      if (cool <= 0 && foes.length) {
        cool = 230
        shots.push({ x: me.x, y: me.y, vx: Math.cos(aim) * unit * 1.4, vy: Math.sin(aim) * unit * 1.4, life: 800 })
      }

      for (let i = shots.length - 1; i >= 0; i--) {
        const b = shots[i]
        b.x += b.vx * s; b.y += b.vy * s; b.life -= dt
        if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) { shots.splice(i, 1); continue }
        for (let j = foes.length - 1; j >= 0; j--) {
          const f = foes[j]
          if (Math.hypot(f.x - b.x, f.y - b.y) < f.r + 4) {
            shots.splice(i, 1); foes.splice(j, 1)
            pts += 50; burst(f.x, f.y, 13); shock(f.x, f.y, 1.8)
            // El divisor se parte en dos crias normales. Las crias nacen
            // APARTADAS del jugador y con 300 ms inofensivas: sin eso, el
            // piloto (que dispara al mas cercano) reventaba divisores a
            // quemarropa y las crias le aparecian encima — la auditoria paso
            // de 2 muertes a 19 en 2 minutos.
            if (f.divisor) {
              const unit2 = Math.min(W, H)
              const away = Math.atan2(f.y - me.y, f.x - me.x)
              for (const lado of [-1, 1]) {
                // Las crias respetan el cupo de 11 (el esquive esta afinado a
                // ese numero) y nunca nacen a menos del 30% del lienzo del
                // jugador: la primera version subia la horda a 13 y ponia
                // crias casi encima — 17-19 muertes del piloto en 2 minutos.
                if (foes.length >= 11) break
                const a2 = away + lado * 0.9
                let nx2 = f.x + Math.cos(a2) * f.r * 2.2
                let ny2 = f.y + Math.sin(a2) * f.r * 2.2
                const dm = Math.hypot(nx2 - me.x, ny2 - me.y) || 1
                const min2 = unit2 * 0.3
                if (dm < min2) {
                  nx2 = me.x + ((nx2 - me.x) / dm) * min2
                  ny2 = me.y + ((ny2 - me.y) / dm) * min2
                }
                foes.push({
                  x: clamp(nx2, 10, W - 10), y: clamp(ny2, 10, H - 10),
                  r: unit2 * 0.032, a: Math.random() * 6, nace: 800,
                })
              }
              pts += 25
            }
            if (humano) sfx.hit()
            break
          }
        }
      }

      for (const f of foes) {
        // Cria recien nacida: quieta e inofensiva mientras aparece.
        if (f.nace > 0) { f.nace -= dt; f.a += s * 2; continue }
        const d = Math.hypot(me.x - f.x, me.y - f.y) || 1
        // Rampa infinita, moderada: +25% de velocidad como mucho. Con +45% y
        // cupo 15 el piloto pasaba de 1 a 12 muertes en la auditoria.
        const sp = unit * 0.17 * (1 + Math.min(0.25, t / 400000)) * s
        f.x += ((me.x - f.x) / d) * sp
        f.y += ((me.y - f.y) / d) * sp
        f.a += s * 2
        if (d < me.r + f.r) {
          // Un toque = fin de partida en modo humano, como manda el genero.
          if (humano) {
            fin = { pts: Math.floor(pts), rec, nuevo: batio, life: 2600 }
            pts = 0; t = 0; batio = false
            sfx.boom(); if (fin.nuevo) sfx.record(); else sfx.fin()
          } else pts = Math.max(0, pts - 100)
          burst(me.x, me.y, 20); shock(me.x, me.y, 2.4)
          foes.length = 0
          deaths++
          break
        }
      }

      for (let i = bits.length - 1; i >= 0; i--) {
        const p = bits[i]
        p.x += p.vx * s; p.y += p.vy * s
        p.vx *= 0.97; p.vy *= 0.97; p.life -= dt
        if (p.life <= 0) bits.splice(i, 1)
      }
    },
    draw(ctx, w, h) {
      const unit = Math.min(w, h)
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75)
      bg.addColorStop(0, '#101a34'); bg.addColorStop(1, '#05070f')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)

      // La rejilla deformada: cuanto mas lejos de su sitio, mas brilla, y de
      // paso vira de azul a magenta. La onda se ve aunque no haya explosion.
      const at = (x, y) => nodes[y * cols + x]
      // 'lighter' hace el trabajo de un bloom sin coste: donde se cruzan dos
      // hilos la luz se suma y la rejilla brilla de verdad. Un juego que se
      // llama Neon no puede dibujarse con lineas planas.
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineWidth = 1.2
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const p = at(x, y)
          const st = clamp((Math.abs(p.x - p.ox) + Math.abs(p.y - p.oy)) / 24, 0, 1)
          ctx.strokeStyle = `rgba(${(70 + st * 185) | 0},${(130 - st * 60) | 0},${(230 - st * 20) | 0},${0.18 + st * 0.7})`
          if (x < cols - 1) {
            const q = at(x + 1, y)
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke()
          }
          if (y < rows - 1) {
            const q = at(x, y + 1)
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke()
          }
        }
      }

      ctx.restore()

      const chispa = Math.max(2, unit * 0.008)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const p of bits) {
        // Rosa = explosion; cian = propulsor de la nave.
        ctx.fillStyle = p.cyan
          ? `rgba(125,249,255,${clamp(p.life / 300, 0, 1) * 0.8})`
          : `rgba(255,120,220,${clamp(p.life / 580, 0, 1)})`
        ctx.fillRect(p.x - chispa / 2, p.y - chispa / 2, chispa, chispa)
      }
      ctx.restore()

      // Los pocos objetos vivos si llevan halo real: son contados, asi que el
      // shadowBlur no pasa factura.
      for (const f of foes) {
        // Rosa = normal; violeta = divisor (se parte en dos al morir).
        const col = f.divisor ? '#b981ff' : '#ff5ecb'
        ctx.shadowColor = col; ctx.shadowBlur = Math.max(8, unit * 0.03)
        ctx.save()
        if (f.nace > 0) ctx.globalAlpha = clamp(1 - f.nace / 800, 0.15, 1)   // fundido al nacer
        ctx.translate(f.x, f.y); ctx.rotate(f.a)
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, unit * 0.007)
        ctx.strokeRect(-f.r, -f.r, f.r * 2, f.r * 2)
        ctx.strokeStyle = f.divisor ? 'rgba(185,129,255,0.4)' : 'rgba(255,94,203,0.4)'
        ctx.strokeRect(-f.r * 0.45, -f.r * 0.45, f.r * 0.9, f.r * 0.9)
        // La cruz interior del divisor insinua la particion.
        if (f.divisor) {
          ctx.beginPath()
          ctx.moveTo(0, -f.r * 0.9); ctx.lineTo(0, f.r * 0.9)
          ctx.stroke()
        }
        ctx.restore()
      }

      ctx.fillStyle = '#7df9ff'
      ctx.shadowColor = '#7df9ff'; ctx.shadowBlur = Math.max(6, unit * 0.025)
      const bl = Math.max(10, unit * 0.045), bg2 = Math.max(3, unit * 0.011)
      for (const b of shots) {
        ctx.save()
        ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx))
        ctx.fillRect(-bl / 2, -bg2 / 2, bl, bg2)
        ctx.restore()
      }

      ctx.save()
      ctx.translate(me.x, me.y); ctx.rotate(aim)
      ctx.fillStyle = 'rgba(125,249,255,0.25)'
      ctx.beginPath(); ctx.arc(0, 0, me.r * 2.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(me.r * 1.8, 0); ctx.lineTo(-me.r, me.r)
      ctx.lineTo(-me.r * 0.35, 0); ctx.lineTo(-me.r, -me.r)
      ctx.closePath(); ctx.fill()
      ctx.restore()
      ctx.shadowBlur = 0
      bloom(ctx, w, h, 0.55)

      // Vineta: cierra el encuadre y empuja la mirada al centro.
      const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h)

      hud(ctx, String(pts).padStart(5, '0'), rec > 0 ? `MEJOR ${String(rec).padStart(5, '0')}` : 'NEÓN', w, '#7df9ff')
      if (fin) finBanner(ctx, w, h, fin)
    },
  }
}

/* ══════════════════════════════ 7 · FICHAS · 2048 ═════════════════════════
   El juego del panel del login.

   Los otros seis se juegan contrarreloj: aciertas o mueres. Este va del revés
   —no hay prisa, puedes dejarlo a medias y volver a tu contraseña— y engancha
   por otra vía: la ESCALERA. Cada potencia de dos que tocas por primera vez es
   un peldaño que se queda contigo (512, luego 1024, luego 2048), y el rótulo
   de abajo te enseña siempre el siguiente. Ahí está la ambición: no es batir un
   número abstracto, es que te falta UNA ficha.

   Por eso se guardan dos cosas y no una: la mejor puntuación, como en el resto
   del arcade, y la mejor ficha, que es el trofeo de verdad.

   No entra en ARCADE: esa lista son los seis que la landing enseña en vídeo, y
   de este no hay grabación.
   ========================================================================== */

/* Cada peldaño con su color. Hasta 32 son grises que van aclarando —el tablero
   respira con el resto de la app—, de 64 en adelante entra el violeta de marca
   y 2048 es blanco: el trofeo se ve desde la otra punta de la pantalla. */
const T2048 = [
  null,
  ['#1e1e1f', '#9aa0a6'],   // 2
  ['#26262a', '#c4c7c5'],   // 4
  ['#2f3036', '#e3e3e3'],   // 8
  ['#3a3b43', '#f1f3f4'],   // 16
  ['#474954', '#f8f9fa'],   // 32
  ['#3b3270', '#e9e6ff'],   // 64
  ['#4a3d99', '#efecff'],   // 128
  ['#5a49c4', '#f5f3ff'],   // 256
  ['#6d5cff', '#ffffff'],   // 512
  ['#8b7bff', '#ffffff'],   // 1024
  ['#f1f3f4', '#131314'],   // 2048
]
const paso2048 = (e) => T2048[Math.min(e, T2048.length - 1)] || T2048[T2048.length - 1]

export function create2048() {
  const ap = autopilot()
  const N = 4                      // 4x4. Con 5x5 la partida se alarga y deja de doler
  const DUR = 110                  // ms que tarda una ficha en deslizarse
  let W = 1, H = 1
  let grid = []                    // exponentes: 0 vacío, 1 = "2", 2 = "4"...
  let pts = 0, rec = 0, mejorFicha = 0, batio = false
  let humano = false
  let anim = []                    // fichas en movimiento durante DUR ms
  let animT = 0
  let brotes = []                  // {i, t} fichas que acaban de nacer o fusionarse
  let fin = null
  let subeT = 0, subeFicha = 0     // aviso de peldaño nuevo
  let autoT = 0                    // el piloto no juega a 60 movimientos por segundo

  const idx = (c, r) => r * N + c
  const libres = () => { const a = []; for (let i = 0; i < N * N; i++) if (!grid[i]) a.push(i); return a }

  const brotar = () => {
    const l = libres()
    if (!l.length) return
    const i = l[(Math.random() * l.length) | 0]
    grid[i] = Math.random() < 0.9 ? 1 : 2      // 90% un "2", 10% un "4"
    brotes.push({ i, t: 1 })
  }

  const nueva = () => {
    grid = new Array(N * N).fill(0)
    pts = 0; anim = []; animT = 0; brotes = []; fin = null; subeT = 0
    brotar(); brotar()
  }

  const reset = (w, h) => {
    W = w; H = h
    rec = record.get('2048')
    try { mejorFicha = Number(localStorage.getItem('daya-arcade-tile-2048')) || 0 } catch { mejorFicha = 0 }
    batio = false
    nueva()
  }

  /* Un movimiento sobre una copia del tablero. Devuelve el tablero resultante,
     los puntos ganados y de dónde viene cada ficha, que es lo que permite
     animar el deslizamiento en vez de teletransportarlas. */
  const simular = (g, dir) => {
    const out = new Array(N * N).fill(0)
    const movs = []          // {de, a, exp, fusion}
    let ganado = 0, cambio = false
    // dx/dy marcan el sentido; se recorre cada línea desde el borde de destino.
    const horiz = dir === 'left' || dir === 'right'
    const atras = dir === 'right' || dir === 'down'
    for (let linea = 0; linea < N; linea++) {
      // Celdas de la línea, ya ordenadas hacia el destino.
      const celdas = []
      for (let k = 0; k < N; k++) {
        const kk = atras ? N - 1 - k : k
        celdas.push(horiz ? idx(kk, linea) : idx(linea, kk))
      }
      let destino = 0, ultimo = -1   // ultimo = índice EN out de la ficha que puede fusionar
      for (const de of celdas) {
        const e = g[de]
        if (!e) continue
        const pos = celdas[destino]
        if (ultimo >= 0 && out[celdas[ultimo]] === e) {
          // Fusión: la ficha viaja hasta la anterior y las dos se convierten en una.
          out[celdas[ultimo]] = e + 1
          ganado += 1 << (e + 1)
          movs.push({ de, a: celdas[ultimo], exp: e, fusion: true })
          ultimo = -1                 // una ficha solo fusiona una vez por movimiento
          cambio = true
        } else {
          if (pos !== de) { cambio = true }
          out[pos] = e
          movs.push({ de, a: pos, exp: e, fusion: false })
          ultimo = destino
          destino++
        }
      }
    }
    return { out, movs, ganado, cambio }
  }

  const hayMovimiento = (g) => ['left', 'right', 'up', 'down'].some((d) => simular(g, d).cambio)

  /* Corta el deslizamiento en curso y deja el tablero listo. Sin esto, quien
     encadena pulsaciones —que es como se juega de verdad al 2048— perdía todas
     las que caían dentro de esos 110 ms: pulsabas seis veces y se movía una. */
  const rematar = () => {
    if (animT > 0) { animT = 0; anim = []; brotar() }
  }

  const mover = (dir) => {
    if (fin) return
    rematar()
    const { out, movs, ganado, cambio } = simular(grid, dir)
    if (!cambio) return
    anim = movs; animT = DUR
    grid = out
    pts += ganado
    if (ganado && humano) sfx.coin(1 + Math.min(3, Math.log2(ganado) - 1))

    // ¿Peldaño nuevo? Es el corazón del juego: se guarda siempre, pero solo se
    // celebra a partir de 32. Felicitar por llegar a un "2" —la ficha con la
    // que empiezas— convierte el aviso en ruido y le quita valor al de 512.
    const alta = Math.max(...grid)
    if (humano && alta > mejorFicha) {
      mejorFicha = alta
      try { localStorage.setItem('daya-arcade-tile-2048', String(alta)) } catch {}
      if (alta >= 5) { subeFicha = alta; subeT = 1400; sfx.level() }
    }
    if (humano && pts > rec) { rec = pts; record.set('2048', rec); batio = true }
  }

  /* Piloto automático. No pretende ganar: pretende que el panel esté vivo y que
     la partida se vea sensata. Prefiere no subir —así las fichas grandes se
     quedan abajo, que es como se juega— y entre las demás elige la que deja más
     hueco y más fusiona. */
  const pensar = () => {
    let mejor = null, mejorV = -Infinity
    for (const d of ['down', 'left', 'right', 'up']) {
      const s = simular(grid, d)
      if (!s.cambio) continue
      const huecos = s.out.filter((v) => !v).length
      const v = huecos * 12 + s.ganado + (d === 'up' ? -40 : 0) + Math.random() * 3
      if (v > mejorV) { mejorV = v; mejor = d }
    }
    return mejor
  }

  return {
    reset,
    state: () => ({ pts, mejorFicha, ficha: Math.max(...grid), llenas: grid.filter(Boolean).length }),
    key(k, down) {
      if (!down) return
      const era = ap.on
      ap.touch()
      // Al coger los mandos empieza TU partida: heredar el tablero del piloto
      // sería empezar con los deberes hechos, y el récord dejaría de valer.
      if (era) { humano = true; batio = false; nueva(); return }
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') mover(k)
    },
    update(dt, w, h) {
      if (w !== W || h !== H) reset(w, h)
      ap.tick(dt)
      if (ap.on && humano) { humano = false; nueva() }

      if (animT > 0) { animT -= dt; if (animT <= 0) { animT = 0; anim = []; brotar() } }
      for (const b of brotes) b.t -= dt / 260
      brotes = brotes.filter((b) => b.t > 0)
      if (subeT > 0) subeT -= dt

      if (fin) {
        fin.life -= dt
        if (fin.life <= 0) { fin = null; nueva() }
      } else if (!animT && !hayMovimiento(grid)) {
        // Fin de partida: el cartel es el que cierra el bucle — cuánto has
        // hecho, cuánto tenías, y otra vez.
        fin = { life: 2600, pts, rec, nuevo: humano && batio }
        if (humano) (batio ? sfx.record : sfx.fin)()
      }

      if (ap.on) {
        autoT -= dt
        if (autoT <= 0 && !animT && !fin) { autoT = 210; const d = pensar(); if (d) mover(d) }
      }
    },
    draw(ctx, w, h) {
      ctx.fillStyle = '#0e0e10'
      ctx.fillRect(0, 0, w, h)

      // El tablero es cuadrado y se centra: el panel del login es alto y
      // estrecho en unas pantallas y ancho y bajo en otras.
      const lado = Math.min(w * 0.82, h * 0.58, 460)
      const x0 = (w - lado) / 2, y0 = (h - lado) / 2
      const hueco = lado * 0.028
      const celda = (lado - hueco * (N + 1)) / N
      const px = (c) => x0 + hueco + c * (celda + hueco)
      const py = (r) => y0 + hueco + r * (celda + hueco)
      const radio = celda * 0.14

      const caja = (x, y, s, color) => {
        ctx.fillStyle = color
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(x, y, s, s, radio)
        else ctx.rect(x, y, s, s)
        ctx.fill()
      }

      // Bandeja y huecos.
      ctx.fillStyle = 'rgba(255,255,255,0.035)'
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(x0, y0, lado, lado, radio * 1.4)
      else ctx.rect(x0, y0, lado, lado)
      ctx.fill()
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) caja(px(c), py(r), celda, 'rgba(255,255,255,0.03)')

      const ficha = (x, y, s, exp, escala = 1) => {
        const [bg, fg] = paso2048(exp)
        const d = s * escala, o = (s - d) / 2
        caja(x + o, y + o, d, bg)
        const txt = String(1 << exp)
        // El cuerpo baja según los dígitos: "1024" con el mismo tamaño que "2"
        // se sale de la ficha.
        const cuerpo = d * (txt.length > 3 ? 0.3 : txt.length > 2 ? 0.36 : 0.44)
        ctx.fillStyle = fg
        ctx.font = `700 ${cuerpo}px ui-monospace, monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(txt, x + s / 2, y + s / 2 + cuerpo * 0.04)
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      }

      if (animT > 0) {
        // Durante el deslizamiento manda `anim`: las fichas se dibujan entre su
        // origen y su destino, y el tablero nuevo todavía no se enseña.
        const t = 1 - animT / DUR
        const k = t * t * (3 - 2 * t)      // suavizado: arranca y frena
        for (const m of anim) {
          const c0 = m.de % N, r0 = (m.de / N) | 0
          const c1 = m.a % N, r1 = (m.a / N) | 0
          ficha(lerp(px(c0), px(c1), k), lerp(py(r0), py(r1), k), celda, m.exp)
        }
      } else {
        for (let i = 0; i < N * N; i++) {
          if (!grid[i]) continue
          const b = brotes.find((x) => x.i === i)
          // Nacer y fusionar se notan: la ficha entra pequeña y crece de golpe.
          const escala = b ? 1 - 0.35 * b.t : 1
          ficha(px(i % N), py((i / N) | 0), celda, grid[i], escala)
        }
      }

      // Marcador arriba y escalera abajo.
      hud(ctx, `PUNTOS ${pts}`, rec > 0 ? `MEJOR ${rec}` : '2048', w, '#c4c7c5')

      // Anclado al borde inferior si hace falta: en paneles bajos la escalera
      // caía fuera del lienzo y el visitante no veía su siguiente meta, que es
      // justo lo que le tiene que picar.
      const base = Math.min(y0 + lado + 34, h - 30)
      ctx.textAlign = 'center'
      ctx.font = '600 11px ui-monospace, monospace'
      if (subeT > 0) {
        // Acabas de tocar una potencia nueva: el aviso pisa a la escalera.
        ctx.globalAlpha = clamp(subeT / 500, 0, 1)
        ctx.fillStyle = '#8b7bff'
        ctx.fillText(`¡${1 << subeFicha}!`, w / 2, base)
        ctx.globalAlpha = 1
      } else if (mejorFicha >= 3) {
        // La escalera solo aparece cuando ya hay algo que presumir (8 arriba):
        // "MEJOR FICHA 2" el primer día no motiva a nadie.
        ctx.fillStyle = DIM
        const meta = 1 << (mejorFicha + 1)
        ctx.fillText(`MEJOR FICHA ${1 << mejorFicha}`, w / 2, base)
        ctx.fillStyle = '#8b7bff'
        ctx.fillText(`SIGUIENTE ${meta}`, w / 2, base + 17)
      } else {
        ctx.fillStyle = DIM
        ctx.fillText('LLEGA A 2048', w / 2, base)
      }
      ctx.textAlign = 'left'

      if (fin) finBanner(ctx, w, h, fin)
    },
  }
}

/* ════════════════════════════════ CATALOGO ═══════════════════════════════ */

export const ARCADE = [
  { id: 'maze3d', label: 'Minotauro', kind: 'Laberinto 3D', hint: '◀ ▶ giran · ▲ ▼ avanzan', make: createMaze3D },
  { id: 'racer', label: 'Ruta 88', kind: 'Carrera 3D', hint: '◀ ▶ conducen · ▲ acelera · ▼ frena', make: createRacer },
  { id: 'neon', label: 'Neón', kind: 'Rejilla elástica', hint: '◀ ▲ ▼ ▶ mueven · dispara solo', make: createNeon },
  { id: 'survivor', label: 'Horda', kind: 'Supervivencia', hint: '◀ ▲ ▼ ▶ mueven · apunta solo', make: createSurvivor },
  { id: 'platformer', label: 'Ocaso', kind: 'Plataformas', hint: '◀ ▶ mueven · ▲ salta', make: createPlatformer },
  { id: 'bricks', label: 'Prisma', kind: 'Ladrillos', hint: '◀ ▶ mueven la pala', make: createBricks },
]

/* Uno al azar. Se llama en el cliente para que cada visita reciba otro. */
export const randomGame = () => ARCADE[(Math.random() * ARCADE.length) | 0]
