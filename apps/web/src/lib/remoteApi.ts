/**
 * remote-dev-api (2026-09-08): run the local web app against the HOSTED DEV
 * API, so the topics on screen are the real ones from dev.timetable.love and
 * a comment written here is posted back there for everyone to see.
 *
 * Why this can't just be a URL swap:
 *
 * 1. **Auth.** The hosted API verifies Clerk session tokens, and this machine
 *    has no Clerk keys ([[local-dev-user]]). The way in is a personal API
 *    token (`tpk_`), which the API accepts on the same Authorization header
 *    (`auth/api-token.ts`) and gates by scope — `comments:write` covers
 *    `addComment`. Scopes are a ceiling, not a grant: the token can only do
 *    what its owner could do in the app, and comments post as its owner.
 * 2. **The token must not reach the browser.** So the browser posts to a
 *    same-origin route handler (`/api/remote-graphql`) which adds the header
 *    server-side. That also sidesteps CORS twice over: same origin for the
 *    CSP's `connect-src 'self'`, and the hosted API's WEB_ORIGIN never has
 *    to list a localhost port.
 * 3. **Personal tokens are GraphQL-only.** REST stays pointed at the local
 *    API, so uploads, invites and forum creation are not part of this mode.
 * 4. **`libraryMatches` only exists locally.** It is not deployed, so the
 *    lookup keeps going to the local API via `localGql` — which works
 *    because `db:seed` is deterministic: every topic in the hosted dev
 *    forum has the same id and the same text locally (checked 2026-09-08,
 *    50/50 ids identical).
 *
 * Server-only module: the token is read here and never in `@/env`, which
 * client components import.
 */
import "server-only";

const url = (process.env.DEV_API_URL ?? "").trim().replace(/\/+$/, "");
const token = (process.env.DEV_API_TOKEN ?? "").trim();

/** Both halves or neither — a URL with no token would silently downgrade
 * every write to an anonymous 401, which reads as "commenting is broken". */
export const remoteApiConfigured = url !== "" && token !== "";

/** Where the hosted GraphQL lives, and the bearer to reach it with. */
export function remoteGraphql(): { url: string; token: string } | null {
  if (!remoteApiConfigured) return null;
  return { url: `${url}/graphql`, token };
}

/** For the diagnostic line in the route handler — the host, never the
 * token. */
export const remoteApiHost = url;
