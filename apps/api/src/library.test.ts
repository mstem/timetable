import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findLibraryMatches, resetLibraryCache } from "./library";

/**
 * The matcher is a public endpoint on a budget shared by every caller (400
 * requests a day), so what matters here is how FEW requests go out — the
 * cache, the in-flight dedupe, and that a failure is never cached.
 */
const ENDPOINT = "https://curator.example/api/recommend";

const PAYLOAD = {
  categories: [
    {
      name: "Deliberation",
      description: "Platforms for deliberating together.",
      softrUrl: "https://app.civictech.guide/category?recordId=recMdk",
      type: "category",
    },
  ],
};

function ok(body: unknown = PAYLOAD) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetLibraryCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findLibraryMatches", () => {
  it("asks the matcher and shapes the answer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());

    const matches = await findLibraryMatches({
      endpoint: ENDPOINT,
      text: "Deliberative democracy in cities",
    });

    expect(matches).toEqual([
      {
        name: "Deliberation",
        description: "Platforms for deliberating together.",
        url: "https://app.civictech.guide/category?recordId=recMdk",
        kind: "category",
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(ENDPOINT);
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "Deliberative democracy in cities",
      limit: 3,
    });
  });

  it("answers a repeat question from the cache", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());

    await findLibraryMatches({ endpoint: ENDPOINT, text: "same text" });
    await findLibraryMatches({ endpoint: ENDPOINT, text: "same text" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("spends one request when two callers arrive together", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());

    await Promise.all([
      findLibraryMatches({ endpoint: ENDPOINT, text: "at once" }),
      findLibraryMatches({ endpoint: ENDPOINT, text: "at once" }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps the limit at three and floors it at one", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());

    await findLibraryMatches({ endpoint: ENDPOINT, text: "a", limit: 99 });
    await findLibraryMatches({ endpoint: ENDPOINT, text: "b", limit: 0 });

    const limits = fetchMock.mock.calls.map(
      (call) => JSON.parse(String(call[1]?.body)).limit,
    );
    expect(limits).toEqual([3, 1]);
  });

  it("returns nothing rather than throwing when the endpoint fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );

    await expect(
      findLibraryMatches({ endpoint: ENDPOINT, text: "over budget" }),
    ).resolves.toEqual([]);
  });

  it("does not cache a failure — the next open tries again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(ok());

    expect(await findLibraryMatches({ endpoint: ENDPOINT, text: "x" })).toEqual(
      [],
    );
    expect(
      await findLibraryMatches({ endpoint: ENDPOINT, text: "x" }),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never asks about an empty topic", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());

    expect(
      await findLibraryMatches({ endpoint: ENDPOINT, text: "   " }),
    ).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
