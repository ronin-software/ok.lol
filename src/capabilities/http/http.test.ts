/**
 * Tests for the HTTP GET capability.
 *
 * URL validation is tested directly. Fetch behavior uses mocks.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { validateUrl } from ".";

// –
// URL validation
// –

describe("validateUrl", () => {
  test("accepts https URLs", () => {
    const url = validateUrl("https://example.com/path");
    expect(url.hostname).toBe("example.com");
  });

  test("accepts http URLs", () => {
    const url = validateUrl("http://example.com");
    expect(url.hostname).toBe("example.com");
  });

  test("rejects file:// URLs", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow("Unsupported protocol");
  });

  test("rejects ftp:// URLs", () => {
    expect(() => validateUrl("ftp://example.com")).toThrow("Unsupported protocol");
  });

  test("rejects localhost", () => {
    expect(() => validateUrl("http://localhost:3000")).toThrow("Private/local");
  });

  test("rejects 127.x.x.x", () => {
    expect(() => validateUrl("http://127.0.0.1")).toThrow("Private/local");
  });

  test("rejects 10.x.x.x", () => {
    expect(() => validateUrl("http://10.0.0.1")).toThrow("Private/local");
  });

  test("rejects 192.168.x.x", () => {
    expect(() => validateUrl("http://192.168.1.1")).toThrow("Private/local");
  });

  test("rejects 172.16.x.x", () => {
    expect(() => validateUrl("http://172.16.0.1")).toThrow("Private/local");
  });

  test("rejects 169.254.x.x (link-local)", () => {
    expect(() => validateUrl("http://169.254.1.1")).toThrow("Private/local");
  });
});

// –
// Body truncation
// –

describe("httpGet body truncation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("truncates response body to 64 KB", async () => {
    const bigBody = "x".repeat(128 * 1024);
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(bigBody, { status: 200 })),
    ) as unknown as typeof fetch;

    // Re-import to pick up the mocked fetch.
    const { default: httpGet } = await import(".");
    const ectx = {
      principal: {
        accountId: "1",
        credits: 0n,
        documents: [],
        id: "p1",
        name: "Test",
        username: "test",
      },
    };

    const result = await httpGet.call(ectx, { url: "https://example.com/big" });
    expect(result.body.length).toBeLessThanOrEqual(64 * 1024);
    expect(result.status).toBe(200);
  });
});
