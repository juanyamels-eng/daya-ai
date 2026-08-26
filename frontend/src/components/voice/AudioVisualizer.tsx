'use client'
import { useEffect, useRef } from 'react'

interface AudioVisualizerProps {
  isActive: boolean
  color?: string
  barCount?: number
  className?: string
}

export function AudioVisualizer({ isActive, color = 'var(--brand)', barCount = 40, className }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(animRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      // Draw idle state
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          const barW = canvas.width / barCount * 0.6
          const gap = canvas.width / barCount * 0.4
          for (let i = 0; i < barCount; i++) {
            const x = i * (barW + gap) + gap / 2
            ctx.fillStyle = color
            ctx.globalAlpha = 0.2
            ctx.fillRect(x, canvas.height / 2 - 1, barW, 2)
          }
          ctx.globalAlpha = 1
        }
      }
      return
    }

    let cancelled = false

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 128
        source.connect(analyser)
        analyserRef.current = analyser

        const canvas = canvasRef.current
        if (!canvas) return
        const canvasCtx = canvas.getContext('2d')
        if (!canvasCtx) return

        const data = new Uint8Array(analyser.frequencyBinCount)
        const barW = canvas.width / barCount * 0.6
        const gap = canvas.width / barCount * 0.4

        function draw() {
          if (cancelled || !canvas || !canvasCtx) return
          analyser.getByteFrequencyData(data)
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height)

          for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor(i * data.length / barCount)
            const value = data[dataIndex] / 255
            const barH = Math.max(2, value * canvas.height * 0.8)
            const x = i * (barW + gap) + gap / 2
            const y = canvas.height / 2 - barH / 2

            canvasCtx.fillStyle = color
            canvasCtx.globalAlpha = 0.3 + value * 0.7
            canvasCtx.beginPath()
            if (canvasCtx.roundRect) {
              canvasCtx.roundRect(x, y, barW, barH, barW / 2)
            } else {
              canvasCtx.rect(x, y, barW, barH)
            }
            canvasCtx.fill()
          }
          canvasCtx.globalAlpha = 1

          animRef.current = requestAnimationFrame(draw)
        }
        draw()
      } catch {
        // Microphone not available — draw static bars
        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            const barW = canvas.width / barCount * 0.6
            const gap = canvas.width / barCount * 0.4
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            for (let i = 0; i < barCount; i++) {
              const x = i * (barW + gap) + gap / 2
              ctx.fillStyle = color
              ctx.globalAlpha = 0.15
              ctx.fillRect(x, canvas.height / 2 - 1, barW, 2)
            }
            ctx.globalAlpha = 1
          }
        }
      }
    }
    setup()

    return () => {
      cancelled = true
      cancelAnimationFrame(animRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [isActive, color, barCount])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={80}
      className={className}
      style={{ width: '100%', height: 80, display: 'block' }}
    />
  )
}
