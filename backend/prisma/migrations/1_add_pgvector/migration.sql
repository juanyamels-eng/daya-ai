-- Add pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Change embedding column type from float[] to vector(1536)
-- Memory table
ALTER TABLE "Memory" 
  ALTER COLUMN "embedding" TYPE vector(1536) 
  USING "embedding"::vector(1536);

-- DocChunk table
ALTER TABLE "DocChunk" 
  ALTER COLUMN "embedding" TYPE vector(1536) 
  USING "embedding"::vector(1536);

-- Create HNSW indexes for fast similarity search
CREATE INDEX IF NOT EXISTS "memory_embedding_hnsw" ON "Memory" 
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "docchunk_embedding_hnsw" ON "DocChunk" 
  USING hnsw ("embedding" vector_cosine_ops);