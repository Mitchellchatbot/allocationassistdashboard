-- Enable pgvector (Supabase projects have it pre-installed; this is idempotent)
create extension if not exists vector with schema extensions;

-- ── Lead embeddings ───────────────────────────────────────────────────────────
create table if not exists public.lead_embeddings (
  id          text primary key,             -- Zoho lead ID (record.id)
  content     text        not null,         -- human-readable text blob used for embedding
  embedding   extensions.vector(1536),      -- OpenAI text-embedding-3-small
  metadata    jsonb       default '{}',     -- quick-access fields (no join needed)
  updated_at  timestamptz default now()
);

-- HNSW index — fast ANN search, works well on datasets < 1 M rows
create index if not exists lead_embeddings_hnsw_idx
  on public.lead_embeddings
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Row-level security (edge functions use the service role, which bypasses RLS)
alter table public.lead_embeddings enable row level security;

-- ── Similarity search RPC ─────────────────────────────────────────────────────
-- Returns the top-k leads whose embedding is closest to the query embedding.
-- search_path must include extensions so the <=> cosine operator is in scope.
create or replace function public.match_leads(
  query_embedding extensions.vector(1536),
  match_count     int   default 25,
  min_similarity  float default 0.0
)
returns table (
  id          text,
  content     text,
  metadata    jsonb,
  similarity  float
)
language sql stable
set search_path = extensions, public, pg_catalog
as $$
  select
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from public.lead_embeddings
  where 1 - (embedding <=> query_embedding) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;
