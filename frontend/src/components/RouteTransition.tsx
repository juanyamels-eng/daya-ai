'use client'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [display, setDisplay] = useState(children)
  const [state, setState] = useState<'in' | 'out'>('in')
  const prev = useRef(pathname)

  useEffect(() => {
    if (pathname === prev.current) return
    prev.current = pathname
    setState('out')
    const t = setTimeout(() => {
      setDisplay(children)
      setState('in')
    }, 120)
    return () => clearTimeout(t)
  }, [pathname, children])

  return (
    <div style={{
      transition: 'opacity 0.12s ease, transform 0.12s ease',
      opacity: state === 'in' ? 1 : 0,
      transform: state === 'in' ? 'translateY(0)' : 'translateY(4px)',
    }}>
      {state === 'out' ? display : children}
    </div>
  )
}
