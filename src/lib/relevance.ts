/**
 * In-process document activation scoring.
 *
 * Embeds text via AI SDK, then scores documents by cosine similarity
 * of their activation phrases against the prompt. At hundreds of
 * documents this is microseconds — no vector DB needed.
 */

import type { Activation, Document } from "@/capabilities/context";
import { cosineSimilarity, embed, embedMany } from "ai";

/** Embedding model routed through the shared gateway. */
const EMBED_MODEL = "openai/text-embedding-3-small";

// –
// Embedding
// –

/** Embed a single text string. */
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBED_MODEL,
    value: text,
  });
  return embedding;
}

/** Embed multiple strings in a single call. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: EMBED_MODEL,
    values: texts,
  });
  return embeddings;
}

// –
// Scoring
// –

/**
 * Score a document's activation against a prompt embedding.
 *
 * Returns max(positive similarity) - max(negative similarity).
 * Documents with no activation return undefined (always inject).
 */
export function score(
  promptEmbedding: number[],
  activation: Activation,
): number | undefined {
  const pos = activation.embeddings?.positive;
  const neg = activation.embeddings?.negative;
  if (!pos?.length && !neg?.length) return undefined;

  const maxPos = pos?.length
    ? Math.max(...pos.map((e) => cosineSimilarity(promptEmbedding, e)))
    : 0;
  const maxNeg = neg?.length
    ? Math.max(...neg.map((e) => cosineSimilarity(promptEmbedding, e)))
    : 0;
  return maxPos - maxNeg;
}

// –
// Activation embedding
// –

/** Module-level cache for default document activation embeddings. */
const defaultEmbeddingCache = new Map<string, Activation["embeddings"]>();

/**
 * Ensure an activation has its embeddings computed.
 *
 * For default documents, embeddings are cached by path for the process
 * lifetime. For user documents, embeddings are stored in the DB.
 */
export async function ensureEmbeddings(
  activation: Activation,
  cacheKey?: string,
): Promise<Activation> {
  if (activation.embeddings) return activation;

  // Check cache for defaults.
  if (cacheKey) {
    const cached = defaultEmbeddingCache.get(cacheKey);
    if (cached) return { ...activation, embeddings: cached };
  }

  const pos = (activation.positive ?? []).filter(Boolean);
  const neg = (activation.negative ?? []).filter(Boolean);
  const all = [...pos, ...neg];
  if (all.length === 0) return activation;

  const vecs = await embedTexts(all);
  const embeddings = {
    negative: vecs.slice(pos.length),
    positive: vecs.slice(0, pos.length),
  };

  if (cacheKey) {
    defaultEmbeddingCache.set(cacheKey, embeddings);
  }

  return { ...activation, embeddings };
}

// –
// Filtering
// –

/** Partition documents into injected and omitted based on activation scores. */
export async function filterDocuments(
  documents: Document[],
  promptEmbedding: number[],
): Promise<{ injected: Document[]; omitted: Document[] }> {
  // Ensure all activations have embeddings (defaults use cache).
  const resolved = await Promise.all(
    documents.map(async (doc) => {
      if (!doc.activation) return doc;
      const activation = await ensureEmbeddings(
        doc.activation,
        doc.default ? doc.path : undefined,
      );
      return { ...doc, activation };
    }),
  );

  const injected: Document[] = [];
  const omitted: Document[] = [];

  for (const doc of resolved) {
    if (!doc.activation) {
      injected.push(doc);
      continue;
    }
    const s = score(promptEmbedding, doc.activation);
    if (s === undefined || s > 0) {
      injected.push(doc);
    } else {
      omitted.push(doc);
    }
  }

  return { injected, omitted };
}
