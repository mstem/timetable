/**
 * in-the-library (2026-09-07): matching a topic to the Civic Tech Field
 * Guide, and the comment that gets pre-composed from the answer.
 *
 * The matcher is ctfg-guidefinder's public endpoint
 * (github.com/Civic-Tech-Field-Guide/ctfg-guidefinder) — a paragraph in,
 * up to three library entries out, each a category, issue or community
 * with a link into app.civictech.guide. Everything here is pure: the
 * request and its cache live in `apps/api/src/library.ts`, the shaping and
 * the comment text are unit-tested from here, and the web app composes the
 * same body the API would.
 */

export type LibraryMatchKind = "category" | "issue" | "community";

export type LibraryMatch = {
  name: string;
  description: string | null;
  url: string;
  kind: LibraryMatchKind;
};

/** The matcher's own ceiling — it will not return more than three. */
export const LIBRARY_MATCH_LIMIT = 3;

/** The endpoint's documented input cap. */
export const LIBRARY_TEXT_MAX = 5000;

/**
 * Relevance order, and it is the matcher's rather than ours: within each
 * group the endpoint returns its own ranking, and the groups run
 * categories → issues → communities (the widget's order). A category is
 * the most specific thing the library can point at, so it leads.
 */
const KIND_ORDER = ["category", "issue", "community"] as const;

/** Which payload array holds each kind. */
const KIND_FIELD: Record<LibraryMatchKind, string> = {
  category: "categories",
  issue: "issues",
  community: "communities",
};

/** What the topic is matched on: its title and body, capped at the
 * endpoint's input limit. */
export function libraryQueryText(topic: {
  title: string;
  body: string;
}): string {
  return `${topic.title}\n\n${topic.body}`.trim().slice(0, LIBRARY_TEXT_MAX);
}

/**
 * An absolute http(s) URL, or null. The link goes straight into a comment
 * body that `splitLinks`/`CommentBody` turn into an anchor, so a
 * `javascript:` or `data:` href from a third-party response must never
 * reach it.
 *
 * A regex rather than `new URL` because this package targets both the
 * browser and Node with no DOM lib, and because the shape of an accepted
 * link matters more here than its parseability: no whitespace, so a
 * pasted URL can't smuggle a second token into the comment, and nothing
 * that would break autolinking.
 */
const HTTP_URL = /^https?:\/\/[^\s<>"]+$/i;

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return HTTP_URL.test(trimmed) ? trimmed : null;
}

/** Issue and community names come back lowercased; categories are already
 * cased as the library writes them. */
function displayName(name: string, kind: LibraryMatchKind): string {
  if (kind === "category") return name;
  return name
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Record ids the matcher returns that are not real entries. Seeded with the
 * "Community" record (Matt, 2026-09-11), which is the top of the communities
 * taxonomy rather than a community anyone can go and join. Add ids here as
 * they turn up; the structural test below catches the common shape without
 * needing a list.
 */
const BLOCKED_RECORD_IDS = new Set(["recs9xea7ulk8NQRV"]);

/** The Airtable record id out of a softrUrl, or "". */
function recordId(url: string): string {
  return /[?&]recordId=([A-Za-z0-9]+)/.exec(url)?.[1] ?? "";
}

/**
 * A top-level taxonomy entry rather than something to explore: the
 * communities table's own "Community" row, and its siblings in the other
 * tables. Recommending one is like answering "what is this about?" with the
 * name of the filing cabinet.
 *
 * The test is structural on purpose — an entry named after its own kind is
 * the category, not a member of it — so "Categories" and "Issues" are caught
 * without anybody maintaining a list.
 */
function isTaxonomyRoot(name: string, kind: LibraryMatchKind): boolean {
  const n = name.trim().toLowerCase();
  const plural = kind.endsWith("y") ? `${kind.slice(0, -1)}ies` : `${kind}s`;
  return n === kind || n === plural;
}

function readMatch(raw: unknown, kind: LibraryMatchKind): LibraryMatch | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  const url = httpUrl(entry.softrUrl);
  if (!name || !url) return null;
  if (isTaxonomyRoot(name, kind) || BLOCKED_RECORD_IDS.has(recordId(url))) {
    return null;
  }
  const description =
    typeof entry.description === "string" && entry.description.trim()
      ? entry.description.trim()
      : null;
  return { name: displayName(name, kind), description, url, kind };
}

/** One of the payload's three arrays, as the entries we could read. */
function readGroup(raw: unknown, kind: LibraryMatchKind): LibraryMatch[] {
  if (!Array.isArray(raw)) return [];
  const group: LibraryMatch[] = [];
  for (const entry of raw) {
    const match = readMatch(entry, kind);
    if (match) group.push(match);
  }
  return group;
}

/**
 * The matcher's JSON, shaped and capped. Unknown or malformed entries are
 * dropped rather than surfaced: a response we can't read is the same to us
 * as no match, and the composer just stays empty.
 *
 * `dailyCapReached` means the endpoint's 400-a-day budget (shared by every
 * caller of the public API) is spent for the day.
 */
export function parseLibraryMatches(
  payload: unknown,
  limit: number = LIBRARY_MATCH_LIMIT,
): LibraryMatch[] {
  if (typeof payload !== "object" || payload === null) return [];
  const body = payload as Record<string, unknown>;
  if (body.dailyCapReached === true) return [];

  const capped = Math.max(1, Math.min(LIBRARY_MATCH_LIMIT, Math.trunc(limit)));
  const matches: LibraryMatch[] = [];
  const seen = new Set<string>();
  for (const kind of KIND_ORDER) {
    for (const match of readGroup(body[KIND_FIELD[kind]], kind)) {
      if (seen.has(match.url)) continue;
      seen.add(match.url);
      matches.push(match);
      if (matches.length === capped) return matches;
    }
  }
  return matches;
}

/** The one line above the links (2026-09-08). It was a heading plus a
 * sentence; a colon and the list say it once. */
export const LIBRARY_COMMENT_LEAD = "Real-world examples from the library:";

/**
 * The pre-composed comment. Plain text with bare URLs, because that is
 * what a comment body is here — no markdown, and `splitLinks` autolinks
 * anything starting `https://`. One entry per line so three of them read
 * as a list rather than a paragraph.
 *
 * Empty when there is nothing to point at, which is the signal not to
 * touch the composer at all.
 */
export function composeLibraryComment(
  matches: readonly { name: string; url: string }[],
): string {
  if (matches.length === 0) return "";
  return [
    LIBRARY_COMMENT_LEAD,
    ...matches.map((match) => `${match.name}: ${match.url}`),
  ].join("\n");
}
