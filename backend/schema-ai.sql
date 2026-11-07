-- 启用 pgvector 向量扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建文本块表
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  source_version_id TEXT,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  locator TEXT,
  chunk_hash TEXT,
  access_scope TEXT NOT NULL CHECK (access_scope IN ('ai_allowed','internal','forbidden')),
  char_count INTEGER,
  created_at TEXT NOT NULL
);

-- 创建向量嵌入表（bge-m3 维度为 1024）
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id TEXT PRIMARY KEY REFERENCES document_chunks(id) ON DELETE CASCADE,
  embedding vector(1024),
  embedding_model TEXT NOT NULL,
  updated_at TEXT NOT NULL
);