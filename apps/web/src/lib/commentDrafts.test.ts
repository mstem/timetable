import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDraft,
  draftKey,
  getDraft,
  hasDraft,
  setDraft,
} from "./commentDrafts";

/**
 * The store's non-React surface. `setDraft`/`getDraft` are what
 * in-the-library writes through: the pre-composed comment arrives from a
 * fetch the composer never made, and the caller has to be able to see
 * whether the box is already occupied before overwriting it.
 */
const KEY = draftKey.comment("topic-1", "public");

beforeEach(() => {
  clearDraft(KEY);
});

describe("comment-draft-store", () => {
  it("reads back what was written from outside a composer", () => {
    setDraft(KEY, "In the Library\n…");
    expect(getDraft(KEY)).toBe("In the Library\n…");
    expect(hasDraft(KEY)).toBe(true);
  });

  it("reports an untouched key as empty rather than undefined", () => {
    expect(getDraft(KEY)).toBe("");
    expect(hasDraft(KEY)).toBe(false);
  });

  it("keys drafts per visibility thread, so the public box is its own", () => {
    setDraft(draftKey.comment("topic-1", "admin_only"), "drafting note");
    expect(getDraft(KEY)).toBe("");
  });

  it("clears a draft", () => {
    setDraft(KEY, "something");
    clearDraft(KEY);
    expect(hasDraft(KEY)).toBe(false);
  });
});
