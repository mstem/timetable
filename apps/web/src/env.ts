/**
 * E2E_TEST_MODE=1 renders auth-free shells for the Playwright suite by
 * disabling Clerk entirely (proxy, provider, sign-in pages). That makes it
 * a one-variable auth kill switch, so a production build refuses to boot
 * with it set (audit 2026-08-17). Playwright runs `next dev`, so the
 * guard never fires for the suite; hosted dev is a production build and
 * must never set it.
 */
export const e2eTestMode = process.env.E2E_TEST_MODE === "1";
if (e2eTestMode && process.env.NODE_ENV === "production") {
  throw new Error(
    "[web] E2E_TEST_MODE=1 disables authentication and must never be set on a production build",
  );
}

/**
 * local-dev-user (2026-09-08): sign-in without Clerk.
 *
 * Clerk is a paid third party and there are no development keys on every
 * machine that needs to run this app — a placeholder publishable key 500s
 * every page, which had already blocked QA twice. Set this to a seeded
 * member's email and the web app stops calling Clerk entirely while the
 * API acts as that member (its own DEV_LOCAL_USER, which is where the
 * real identity is resolved). Only presence matters here.
 *
 * Guarded the same way E2E_TEST_MODE is, and for the same reason: it is an
 * authentication kill switch, so a production build refuses to boot with
 * it set.
 */
export const devLocalUser = (
  process.env.NEXT_PUBLIC_DEV_LOCAL_USER ?? ""
).trim();
if (devLocalUser && process.env.NODE_ENV === "production") {
  throw new Error(
    "[web] NEXT_PUBLIC_DEV_LOCAL_USER disables authentication and must never be set on a production build",
  );
}

/**
 * remote-dev-api (2026-09-08): send the app's GraphQL to the HOSTED DEV API
 * instead of the local one, so the topics are the real ones and comments go
 * back there. The browser half of the switch — it posts to the
 * `/api/remote-graphql` route handler, which holds the personal API token
 * server-side (`lib/remoteApi.ts`). REST and the local-only
 * `libraryMatches` lookup stay on the local API either way.
 *
 * Guarded like the auth switches: it points a local build at a shared
 * environment, which no production build should ever do.
 */
export const remoteApi = process.env.NEXT_PUBLIC_REMOTE_API === "1";
if (remoteApi && process.env.NODE_ENV === "production") {
  throw new Error(
    "[web] NEXT_PUBLIC_REMOTE_API points this app at the hosted dev API and must never be set on a production build",
  );
}

/** Clerk is not running: either the Playwright shells or local-dev-user.
 * Everything that would call Clerk checks this — the proxy, the provider,
 * the sign-in pages, both token getters, and the account menu. */
export const authDisabled = e2eTestMode || devLocalUser !== "";

export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  graphqlUrl:
    process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql",
  // Deployed web + API share one public origin (NEXT_PUBLIC_API_URL is the
  // app's own URL); only local dev splits the ports, hence the :3000 default.
  webOrigin: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  // Extra self-hosts (CSV) beyond the built-in list in lib/canonicalHost.
  canonicalHostsCsv: process.env.NEXT_PUBLIC_CANONICAL_HOSTS ?? "",
  // The CSP builder decodes the Clerk frontend-API origin out of this
  // (lib/csp.ts); the Clerk SDK reads the variable itself directly.
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
};
