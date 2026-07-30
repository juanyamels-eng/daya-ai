'use client'
import { useEffect } from 'react'

// Pone el título de la pestaña del navegador para esta página.
// Uso: <PageTitle title="Ajustes" />
export default function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    const prev = document.title
    document.title = `${title} · Daya AI`
    return () => { document.title = prev }
  }, [title])
  return null
}
