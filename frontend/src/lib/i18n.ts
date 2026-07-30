'use client'
// ============================================
// Daya IA — i18n ligero (es / en)
// Detecta el idioma del navegador y permite cambiarlo.
// Crecer a más idiomas = añadir entradas a DICT.
// ============================================
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Lang = 'es' | 'en'

type Dict = Record<string, { es: string; en: string }>

// Diccionario de la interfaz. Clave neutral → traducciones.
export const DICT: Dict = {
  newChat:        { es: 'Nueva conversación', en: 'New chat' },
  search:         { es: 'Buscar', en: 'Search' },
  library:        { es: 'Biblioteca', en: 'Library' },
  settings:       { es: 'Ajustes', en: 'Settings' },
  logout:         { es: 'Cerrar sesión', en: 'Log out' },
  recentActivity: { es: 'Actividad reciente', en: 'Recent activity' },
  noConversations:{ es: 'Sin conversaciones', en: 'No conversations' },
  startNew:       { es: 'Inicia una nueva conversación', en: 'Start a new conversation' },
  loadMore:       { es: 'Cargar más', en: 'Load more' },
  loading:        { es: 'Cargando...', en: 'Loading...' },
  pin:            { es: 'Fijar', en: 'Pin' },
  unpin:          { es: 'Quitar fijado', en: 'Unpin' },
  rename:         { es: 'Renombrar', en: 'Rename' },
  download:       { es: 'Descargar', en: 'Download' },
  share:          { es: 'Compartir', en: 'Share' },
  delete:         { es: 'Eliminar', en: 'Delete' },
  searchConversations: { es: 'Buscar conversaciones', en: 'Search conversations' },
  documentLibrary:{ es: 'Biblioteca', en: 'Library' },
  howCanIHelp:    { es: '¿En qué puedo ayudarte?', en: 'How can I help you?' },
  goodMorning:    { es: 'Buenos días', en: 'Good morning' },
  goodAfternoon:  { es: 'Buenas tardes', en: 'Good afternoon' },
  goodEvening:    { es: 'Buenas noches', en: 'Good evening' },
  regenerate:     { es: 'Regenerar respuesta', en: 'Regenerate response' },
  copy:           { es: 'Copiar', en: 'Copy' },
  copied:         { es: 'Copiado', en: 'Copied' },
  thinking:       { es: 'Pensando', en: 'Thinking' },
  noResults:      { es: 'Sin resultados', en: 'No results' },
  tryAnother:     { es: 'Prueba con otro término', en: 'Try another term' },

  // Auth - login
  welcomeBack:    { es: 'Bienvenido de vuelta', en: 'Welcome back' },
  signInToContinue:{ es: 'Inicia sesión para continuar', en: 'Sign in to continue' },
  continueGoogle: { es: 'Continuar con Google', en: 'Continue with Google' },
  connecting:     { es: 'Conectando...', en: 'Connecting...' },
  orWithEmail:    { es: 'O con tu email', en: 'Or with your email' },
  email:          { es: 'Email', en: 'Email' },
  password:       { es: 'Contraseña', en: 'Password' },
  yourPassword:   { es: 'Tu contraseña', en: 'Your password' },
  signIn:         { es: 'Iniciar sesión', en: 'Sign in' },
  signingIn:      { es: 'Entrando...', en: 'Signing in...' },
  forgotAccess:   { es: '¿Olvidaste tu acceso?', en: 'Forgot your access?' },
  noAccount:      { es: '¿Sin cuenta?', en: 'No account?' },
  signUpFree:     { es: 'Regístrate gratis', en: 'Sign up free' },
  enterEmail:     { es: 'Ingresa tu email', en: 'Enter your email' },
  enterPassword:  { es: 'Ingresa tu contraseña', en: 'Enter your password' },

  // Auth - register
  createAccount:  { es: 'Crea tu cuenta', en: 'Create your account' },
  fullName:       { es: 'Nombre completo', en: 'Full name' },
  yourName:       { es: 'Tu nombre', en: 'Your name' },
  min8:           { es: 'Mínimo 8 caracteres', en: 'At least 8 characters' },
  acceptTerms:    { es: 'Acepto los', en: 'I accept the' },
  termsConditions:{ es: 'Términos y Condiciones', en: 'Terms & Conditions' },
  acceptPrivacy:  { es: 'Acepto la', en: 'I accept the' },
  privacyPolicy:  { es: 'Política de Privacidad', en: 'Privacy Policy' },
  createMyAccount:{ es: 'Crear mi cuenta', en: 'Create my account' },
  creating:       { es: 'Creando...', en: 'Creating...' },
  alreadyAccount: { es: '¿Ya tienes cuenta?', en: 'Already have an account?' },

  // Settings
  controlPanel:   { es: 'Panel de Control', en: 'Control Panel' },
  currentPlan:    { es: 'Plan actual', en: 'Current plan' },
  expandCapabilities:{ es: 'Ampliar capacidades', en: 'Upgrade plan' },
  save:           { es: 'Guardar', en: 'Save' },
  saving:         { es: 'Guardando...', en: 'Saving...' },
  cancel:         { es: 'Cancelar', en: 'Cancel' },
  operatingLanguage:{ es: 'Idioma de operación', en: 'Operating language' },
  downloadMyData: { es: 'Descargar mis datos', en: 'Download my data' },
  deleteAccount:  { es: 'Eliminar mi cuenta', en: 'Delete my account' },
  back:           { es: 'Volver', en: 'Back' },

  // Planes
  choosePlan:     { es: 'Elige tu plan', en: 'Choose your plan' },
  popular:        { es: 'POPULAR', en: 'POPULAR' },
  freeForever:    { es: 'Gratis para siempre', en: 'Free forever' },
  processing:     { es: 'Procesando...', en: 'Processing...' },
  securePayment:  { es: 'Pago seguro · Tarjeta de crédito o débito', en: 'Secure payment · Credit or debit card' },
  choosePayment:  { es: 'Elige cómo pagar', en: 'Choose how to pay' },
  payWithPaypal:  { es: 'Pagar con PayPal', en: 'Pay with PayPal' },
  payWithPayoneer:{ es: 'Pagar con Payoneer', en: 'Pay with Payoneer' },
  cardsWorldwide: { es: 'PayPal y Payoneer aceptan tarjetas de crédito y débito de todo el mundo', en: 'PayPal and Payoneer accept credit & debit cards worldwide' },
  paymentSuccess: { es: '¡Pago exitoso! Tu plan está activo. 🎉', en: 'Payment successful! Your plan is active. 🎉' },
  paymentFailed:  { es: 'El pago no se pudo procesar.', en: 'Payment could not be processed.' },
  paymentError:   { es: 'Error en el pago.', en: 'Payment error.' },
  paymentsNotActive:{ es: 'Los pagos aún no están activados.', en: 'Payments are not active yet.' },

  // Settings - secciones
  identity:       { es: 'Perfil', en: 'Profile' },
  subscription:   { es: 'Plan y consumo', en: 'Plan & Usage' },
  operatingConfig:{ es: 'Preferencias', en: 'Preferences' },
  security:       { es: 'Datos y memoria', en: 'Data & Memory' },
  support:        { es: 'Soporte', en: 'Support' },
  platform:       { es: 'Acerca de', en: 'About' },
  usageInsights:  { es: 'Uso e Insights', en: 'Usage & Insights' },
  displayName:    { es: 'Nombre para mostrar', en: 'Display name' },
  emailLabel:     { es: 'Correo electrónico', en: 'Email' },
  responseStyle:  { es: 'Estilo de respuesta', en: 'Response style' },
  responseDensity:{ es: 'Densidad de respuesta', en: 'Response length' },
  confirm:        { es: 'Confirmar', en: 'Confirm' },
  execute:        { es: 'Ejecutar', en: 'Run' },
}

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'es'
  const n = (navigator.language || 'es').toLowerCase()
  return n.startsWith('es') ? 'es' : 'en'
}

interface I18nState {
  lang: Lang
  setLang: (l: Lang) => void
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: detectLang(),
      setLang: (lang) => set({ lang }),
    }),
    { name: 'daya-lang' }
  )
)

// Hook de traducción: const t = useT(); t('newChat')
export function useT() {
  const lang = useI18n((s) => s.lang)
  return (key: keyof typeof DICT) => DICT[key]?.[lang] ?? String(key)
}
