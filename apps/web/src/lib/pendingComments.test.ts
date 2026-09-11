// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearHeld,
  deferHeld,
  dueHeld,
  holdComment,
  listHeld,
  nextRetryAt,
  releaseHeld,
} from "./pendingComments";

/**
 * held-comments: what the API turns away for rate limiting is kept and sent
 * later. The cases that matter are the ones where a person's writing could
 * be lost — a reload, a storage that refuses, a stored shape from an older
 * build.
 */
const HOUR = 60 * 60 * 1000;

/** This vitest jsdom environment gives a `window` with no `localStorage` on
 * it, so the store gets one here. Keeping it explicit also means the
 * "storage refuses" case below is a real swap rather than a mock of a mock. */
function installStorage(): void {
  const map = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
    },
  });
}

function breakStorage(): void {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
}

const comment = (body: string, retryAfterSeconds?: number) =>
  holdComment({
    topicId: "t1",
    visibility: "public",
    body,
    topicTitle: "Separatist Utopias",
    retryAfterSeconds,
    now: 1_000_000,
  });

beforeEach(() => {
  installStorage();
  clearHeld();
});

describe("held comments", () => {
  it("keeps what was written, with the topic it belongs to", () => {
    comment("Real-world examples from the library: …");
    const [held] = listHeld();
    expect(held?.body).toBe("Real-world examples from the library: …");
    expect(held?.topicId).toBe("t1");
    expect(held?.topicTitle).toBe("Separatist Utopias");
  });

  it("survives the tab closing — it is in storage, not memory", () => {
    comment("written before lunch");
    const raw = window.localStorage.getItem("timetable:held-comments");
    expect(raw).toContain("written before lunch");
  });

  it("uses the server's own retry figure when it sends one", () => {
    const held = comment("soon", 120);
    expect(held.retryAt).toBe(1_000_000 + 120_000);
  });

  it("falls back to the hourly window when the server doesn't say", () => {
    const held = comment("no figure");
    expect(held.retryAt).toBe(1_000_000 + HOUR);
  });

  it("only offers up what is actually due", () => {
    comment("later", 3600);
    expect(dueHeld(1_000_000)).toHaveLength(0);
    expect(dueHeld(1_000_000 + HOUR + 1)).toHaveLength(1);
  });

  it("reports when the next one can go", () => {
    comment("a", 600);
    comment("b", 60);
    expect(nextRetryAt()).toBe(1_000_000 + 60_000);
  });

  it("pushes a refused one out again and counts the attempt", () => {
    const held = comment("refused twice");
    deferHeld(held.id, 300, 2_000_000);
    const [after] = listHeld();
    expect(after?.attempts).toBe(1);
    expect(after?.retryAt).toBe(2_000_000 + 300_000);
  });

  it("releases one without touching the others", () => {
    const a = comment("a");
    comment("b");
    releaseHeld(a.id);
    expect(listHeld().map((e) => e.body)).toEqual(["b"]);
  });

  it("ignores entries stored by an older build", () => {
    window.localStorage.setItem(
      "timetable:held-comments",
      JSON.stringify([{ nonsense: true }, null, "a string"]),
    );
    expect(listHeld()).toEqual([]);
  });

  it("ignores storage that isn't valid JSON", () => {
    window.localStorage.setItem("timetable:held-comments", "{{{");
    expect(listHeld()).toEqual([]);
  });

  it("does not throw when storage itself refuses", () => {
    // A private window, or a browser set to block site data: the accessor
    // throws on touch. Failing to hold must never break posting.
    breakStorage();
    expect(() => comment("into the void")).not.toThrow();
    expect(listHeld()).toEqual([]);
    expect(nextRetryAt()).toBeNull();
  });

  it("does not throw when there is no storage at all", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: undefined,
    });
    expect(() => comment("nowhere to put it")).not.toThrow();
    expect(listHeld()).toEqual([]);
  });
});
