import { Langfuse } from 'langfuse';
import { logger } from './logger';

let langfuse: Langfuse | null = null;

export function initLangfuse() {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    logger.warn('[Langfuse] Disabled (set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable)');
    return null;
  }

  try {
    langfuse = new Langfuse({
      publicKey,
      secretKey,
      baseUrl: host,
      flushAt: 10,
      flushInterval: 5000,
    });

    logger.info('[Langfuse] Initialized');
    
    process.on('SIGTERM', () => {
      langfuse?.shutdownAsync().catch(() => {});
    });
  } catch (e) {
    logger.error({ error: String(e) }, '[Langfuse] Failed to init');
  }

  return langfuse;
}

export function getLangfuse() {
  return langfuse;
}

export async function traceChatGeneration(params: {
  userId: string;
  conversationId: string;
  model: string;
  prompt: string;
  response: string;
  tokens?: { prompt: number; completion: number };
  latencyMs: number;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
}) {
  if (!langfuse) return;

  try {
    await langfuse.trace({
      name: 'chat-generation',
      userId: params.userId,
      sessionId: params.conversationId,
      input: { prompt: params.prompt },
      output: { response: params.response },
      metadata: {
        model: params.model,
        tokens: params.tokens,
        latencyMs: params.latencyMs,
        toolsUsed: params.toolsUsed,
        ...params.metadata,
      },
    });
  } catch (e) {
    console.error('[Langfuse] Trace failed:', e instanceof Error ? e.message : e);
  }
}

export async function scoreGeneration(params: {
  traceId: string;
  score: number; // 1 = good, -1 = bad
  comment?: string;
  userId: string;
}) {
  if (!langfuse) return;

  try {
    await langfuse.score({
      traceId: params.traceId,
      name: 'user-feedback',
      value: params.score,
      comment: params.comment,
      dataType: 'CATEGORICAL',
    });
  } catch (e) {
    console.error('[Langfuse] Score failed:', e instanceof Error ? e.message : e);
  }
}

export async function createDataset(name: string, description: string) {
  if (!langfuse) return;
  return langfuse.createDataset({ name, description });
}

export async function addDatasetItem(datasetName: string, input: unknown, expectedOutput?: unknown) {
  if (!langfuse) return;
  return langfuse.createDatasetItem({
    datasetName,
    input,
    expectedOutput,
  });
}