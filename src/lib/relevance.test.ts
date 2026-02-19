/**
 * Unit tests for the relevance scoring module.
 *
 * Scoring and filtering are tested with synthetic embeddings.
 * Embedding round-trips require AI_GATEWAY_API_KEY.
 */

import { cosineSimilarity, createGateway } from "ai";
import { describe, expect, test } from "bun:test";
import type { Activation, Document } from "@/capabilities/context";
import { embedText, embedTexts, filterDocuments, score } from "./relevance";

const HAS_API_KEY = !!process.env.AI_GATEWAY_API_KEY;
const MODEL_TIMEOUT = 30_000;

// –
// Helpers
// –

/** Normalized unit vector in the given direction. */
function vec(...components: number[]): number[] {
  const mag = Math.sqrt(components.reduce((sum, c) => sum + c * c, 0));
  return components.map((c) => c / mag);
}

function doc(path: string, contents: string, activation?: Activation): Document {
  return { activation, contents, path, priority: 0 };
}

// –
// score
// –

describe("score", () => {
  test("returns undefined when no embeddings", () => {
    const result = score([1, 0, 0], { positive: ["x"], negative: ["y"] });
    expect(result).toBeUndefined();
  });

  test("positive match scores > 0", () => {
    const prompt = vec(1, 0, 0);
    const activation: Activation = {
      embeddings: {
        negative: [vec(0, 1, 0)],
        positive: [vec(1, 0, 0)],
      },
    };
    const s = score(prompt, activation)!;
    expect(s).toBeGreaterThan(0);
  });

  test("negative match scores < 0", () => {
    const prompt = vec(0, 1, 0);
    const activation: Activation = {
      embeddings: {
        negative: [vec(0, 1, 0)],
        positive: [vec(1, 0, 0)],
      },
    };
    const s = score(prompt, activation)!;
    expect(s).toBeLessThan(0);
  });

  test("orthogonal embeddings score near 0", () => {
    const prompt = vec(0, 0, 1);
    const activation: Activation = {
      embeddings: {
        negative: [vec(0, 1, 0)],
        positive: [vec(1, 0, 0)],
      },
    };
    const s = score(prompt, activation)!;
    expect(Math.abs(s)).toBeLessThan(0.01);
  });
});

// –
// filterDocuments
// –

describe("filterDocuments", () => {
  test("documents without activation always inject", async () => {
    const docs = [doc("soul", "Be kind"), doc("identity", "I am bot")];
    const prompt = vec(1, 0, 0);
    const { injected, omitted } = await filterDocuments(docs, prompt);
    expect(injected).toHaveLength(2);
    expect(omitted).toHaveLength(0);
  });

  test("positive-matching documents inject, negative-matching omit", async () => {
    const docs = [
      doc("tools/email_send", "Email guide", {
        embeddings: {
          negative: [vec(0, 1, 0)],
          positive: [vec(1, 0, 0)],
        },
      }),
      doc("tools/http_get", "HTTP guide", {
        embeddings: {
          negative: [vec(1, 0, 0)],
          positive: [vec(0, 1, 0)],
        },
      }),
    ];

    // Prompt aligns with email, not http.
    const prompt = vec(1, 0, 0);
    const { injected, omitted } = await filterDocuments(docs, prompt);

    expect(injected.map((d) => d.path)).toContain("tools/email_send");
    expect(omitted.map((d) => d.path)).toContain("tools/http_get");
  });
});

// –
// Integration: real embeddings
// –

describe.skipIf(!HAS_API_KEY)("embedding round-trip", () => {
  test("embedText returns a vector", async () => {
    const vec = await embedText("hello world");
    expect(Array.isArray(vec)).toBe(true);
    expect(vec.length).toBeGreaterThan(0);
    expect(typeof vec[0]).toBe("number");
  }, MODEL_TIMEOUT);

  test("embedTexts returns parallel vectors", async () => {
    const vecs = await embedTexts(["hello", "world"]);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]!.length).toBe(vecs[1]!.length);
  }, MODEL_TIMEOUT);

  test("similar texts have higher cosine similarity than dissimilar", async () => {
    const [a, b, c] = await Promise.all([
      embedText("send an email to Alice"),
      embedText("compose and send a message to someone"),
      embedText("list the files in my home directory"),
    ]);
    const simAB = cosineSimilarity(a, b);
    const simAC = cosineSimilarity(a, c);
    expect(simAB).toBeGreaterThan(simAC);
  }, MODEL_TIMEOUT);
});
