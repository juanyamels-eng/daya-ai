'use client'
import SettingsContent from '../../components/SettingsContent'

// La página /settings solo envuelve el contenido (como página completa).
// El mismo contenido se reutiliza como modal desde el Sidebar.
export default function SettingsPage() {
  return <SettingsContent />
}
