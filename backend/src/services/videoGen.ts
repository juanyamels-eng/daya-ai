const FAL_KEY = process.env.FAL_KEY

export type VideoModel = 'kling-turbo' | 'kling-pro' | 'wan'

export interface VideoGenerateOptions {
  prompt: string
  model?: VideoModel
  duration?: 5 | 10 | 15
  resolution?: '720p' | '1080p'
  imageUrl?: string // for image-to-video
  aspectRatio?: string
}

export interface VideoGenerateResult {
  requestId: string
  status: string
}

const MODEL_ENDPOINTS: Record<VideoModel, string> = {
  'kling-turbo': 'https://fal.run/fal-ai/kling-video/v2.5-turbo/text-to-video',
  'kling-pro': 'https://fal.run/fal-ai/kling-video/v3/pro/text-to-video',
  'wan': 'https://fal.run/fal-ai/wan/v2.6/text-to-video',
}

/**
 * Submit a video generation request to fal.ai
 */
export async function submitVideoGeneration(options: VideoGenerateOptions): Promise<VideoGenerateResult> {
  if (!FAL_KEY) throw new Error('FAL_KEY no configurado')

  const model = options.model || 'kling-turbo'
  const endpoint = MODEL_ENDPOINTS[model]
  const duration = options.duration || 5

  const body: {
    prompt: string
    duration: number
    resolution?: string
    aspect_ratio?: string
    image_url?: string
  } = {
    prompt: options.prompt.slice(0, 500),
    duration: duration,
  }

  if (model === 'kling-turbo') {
    body.resolution = options.resolution || '720p'
    body.aspect_ratio = options.aspectRatio || '16:9'
  }

  if (options.imageUrl && (model === 'kling-pro' || model === 'kling-turbo')) {
    body.image_url = options.imageUrl
  }

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!r.ok) {
    const err = await r.text()
    throw new Error(`fal.ai error (${r.status}): ${err}`)
  }

  const data = await r.json()
  return {
    requestId: data.request_id || data.status?.request_id || '',
    status: 'processing',
  }
}

/**
 * Check status of a video generation request
 */
export async function checkVideoStatus(requestId: string): Promise<{ status: string; url?: string; thumbnailUrl?: string }> {
  if (!FAL_KEY) throw new Error('FAL_KEY no configurado')

  const r = await fetch(`https://queue.fal.run/fal-ai/${requestId}/status`, {
    headers: { Authorization: `Key ${FAL_KEY}` },
  })

  if (!r.ok) throw new Error(`fal.ai status error: ${r.status}`)
  const data = await r.json()

  if (data.status === 'COMPLETED') {
    // Get the result
    const resultR = await fetch(`https://queue.fal.run/fal-ai/${requestId}`, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    })
    if (resultR.ok) {
      const result = await resultR.json()
      const videoUrl = result?.video?.url || result?.videos?.[0]?.url || ''
      const thumbUrl = result?.thumbnail_url || result?.images?.[0]?.url || ''
      return { status: 'completed', url: videoUrl, thumbnailUrl: thumbUrl }
    }
  }

  return { status: data.status === 'COMPLETED' ? 'completed' : data.status === 'FAILED' ? 'failed' : 'processing' }
}
