import { describe, expect, it } from "vitest";

import {
  composeLibraryComment,
  libraryQueryText,
  parseLibraryMatches,
} from "./library";

/** A trimmed-down copy of a real response from the matcher (recorded
 * 2026-09-07 against a participatory-budgeting paragraph). */
const PAYLOAD = {
  categories: [
    {
      name: "Participatory budgeting",
      description: "Collaboratively raising and allocating public funds",
      softrUrl: "https://app.civictech.guide/category?recordId=recFRE",
      type: "category",
    },
    {
      name: "Deliberation",
      description: "Platforms that assist participants in deliberating.",
      softrUrl: "https://app.civictech.guide/category?recordId=recMdk",
      type: "category",
    },
  ],
  issues: [
    {
      name: "local government",
      description: "",
      softrUrl: "https://app.civictech.guide/issue?recordId=recIss",
      type: "issue",
    },
  ],
  communities: [],
};

describe("parseLibraryMatches", () => {
  it("keeps the matcher's order: categories, then issues, then communities", () => {
    expect(parseLibraryMatches(PAYLOAD).map((m) => m.kind)).toEqual([
      "category",
      "category",
      "issue",
    ]);
  });

  it("title-cases issue and community names but leaves categories alone", () => {
    const matches = parseLibraryMatches(PAYLOAD);
    expect(matches[0]?.name).toBe("Participatory budgeting");
    expect(matches[2]?.name).toBe("Local Government");
  });

  it("reads an empty description as none at all", () => {
    expect(parseLibraryMatches(PAYLOAD)[2]?.description).toBeNull();
  });

  it("caps at the requested limit, and never above three", () => {
    expect(parseLibraryMatches(PAYLOAD, 1)).toHaveLength(1);
    expect(parseLibraryMatches(PAYLOAD, 0)).toHaveLength(1);
    expect(parseLibraryMatches(PAYLOAD, 99)).toHaveLength(3);
  });

  it("drops entries with a non-http(s) link", () => {
    const matches = parseLibraryMatches({
      categories: [
        { name: "Bad", softrUrl: "javascript:alert(1)" },
        { name: "Also bad", softrUrl: "/relative" },
        { name: "Fine", softrUrl: "https://app.civictech.guide/x" },
      ],
    });
    expect(matches.map((m) => m.name)).toEqual(["Fine"]);
  });

  it("drops entries with no name, and duplicate links", () => {
    const matches = parseLibraryMatches({
      categories: [
        { name: "  ", softrUrl: "https://app.civictech.guide/a" },
        { name: "One", softrUrl: "https://app.civictech.guide/b" },
        { name: "One again", softrUrl: "https://app.civictech.guide/b" },
      ],
    });
    expect(matches.map((m) => m.name)).toEqual(["One"]);
  });

  it("returns nothing when the day's shared request budget is spent", () => {
    expect(parseLibraryMatches({ ...PAYLOAD, dailyCapReached: true })).toEqual(
      [],
    );
  });

  it("returns nothing for a response it can't read", () => {
    expect(parseLibraryMatches(null)).toEqual([]);
    expect(parseLibraryMatches("nope")).toEqual([]);
    expect(parseLibraryMatches({ categories: "nope" })).toEqual([]);
    expect(parseLibraryMatches({ categories: [null, 7] })).toEqual([]);
  });
});

describe("libraryQueryText", () => {
  it("matches on the title and the body together", () => {
    expect(libraryQueryText({ title: "Budgets", body: "How and why." })).toBe(
      "Budgets\n\nHow and why.",
    );
  });

  it("caps at the endpoint's 5000-character input limit", () => {
    const text = libraryQueryText({ title: "T", body: "x".repeat(6000) });
    expect(text).toHaveLength(5000);
  });
});

describe("composeLibraryComment", () => {
  it("writes the lead, then one line per entry", () => {
    expect(composeLibraryComment(parseLibraryMatches(PAYLOAD))).toBe(
      [
        "Real-world examples from the library:",
        "Participatory budgeting: https://app.civictech.guide/category?recordId=recFRE",
        "Deliberation: https://app.civictech.guide/category?recordId=recMdk",
        "Local Government: https://app.civictech.guide/issue?recordId=recIss",
      ].join("\n"),
    );
  });

  it("is empty with nothing to point at, so the composer stays untouched", () => {
    expect(composeLibraryComment([])).toBe("");
  });
});

describe("taxonomy roots", () => {
  /** The communities table's own "Community" record (Matt, 2026-09-11):
   * shaped like any other result, but it is the filing cabinet. */
  it("drops an entry named after its own kind", () => {
    const matches = parseLibraryMatches({
      communities: [
        {
          name: "community",
          softrUrl:
            "https://ctfg.softr.app/community?recordId=recs9xea7ulk8NQRV",
        },
        { name: "code for all", softrUrl: "https://ctfg.softr.app/c?r=1" },
      ],
    });
    expect(matches.map((m) => m.name)).toEqual(["Code For All"]);
  });

  it("drops the plural forms too, in every table", () => {
    const matches = parseLibraryMatches({
      categories: [{ name: "Categories", softrUrl: "https://x.test/a" }],
      issues: [{ name: "Issues", softrUrl: "https://x.test/b" }],
      communities: [{ name: "Communities", softrUrl: "https://x.test/c" }],
    });
    expect(matches).toEqual([]);
  });

  it("drops a blocked record id whatever it calls itself", () => {
    const matches = parseLibraryMatches({
      categories: [
        {
          name: "Something Else Entirely",
          softrUrl: "https://app.civictech.guide/x?recordId=recs9xea7ulk8NQRV",
        },
      ],
    });
    expect(matches).toEqual([]);
  });

  it("keeps a real entry whose name merely contains the word", () => {
    const matches = parseLibraryMatches({
      categories: [
        { name: "Community wifi", softrUrl: "https://x.test/d" },
        { name: "Community-building resources", softrUrl: "https://x.test/e" },
      ],
    });
    expect(matches.map((m) => m.name)).toEqual([
      "Community wifi",
      "Community-building resources",
    ]);
  });
});
