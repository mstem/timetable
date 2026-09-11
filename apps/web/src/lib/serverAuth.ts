/**
 * The web app's one server-side auth seam (local-dev-user, 2026-09-08).
 *
 * Every server component used to call Clerk's `auth()` directly, and
 * `auth()` throws when `clerkMiddleware` never ran — which is exactly the
 * state the app is in when Clerk is switched off (`authDisabled`: the
 * Playwright shells, or local-dev-user). So the call sites go through here
 * instead, the same way every API request goes through the transport's
 * TransportAuth seam rather than reaching for Clerk itself.
 *
 * What the web app actually needs from Clerk is thin: `userId` is read as
 * "is somebody signed in" at every one of those call sites, never as an
 * identity, and the account menu wants an email to show. The real identity
 * is resolved by the API from its own DEV_LOCAL_USER, off the back of a
 * request that carries no token at all.
 */
import { auth, currentUser } from "@clerk/nextjs/server";

import { devLocalUser, e2eTestMode } from "@/env";

/** Stands in for a Clerk user id while Clerk is off. Deliberately not a
 * real user id: nothing may use it to look anybody up, and a value that
 * cannot match a row makes that obvious if anything tries. */
const LOCAL_USER_ID = "dev-local-user";

/** Is anyone signed in? `{ userId }` for drop-in compatibility with the
 * Clerk call it replaces. */
export async function serverAuth(): Promise<{ userId: string | null }> {
  // E2E mode outranks local-dev-user: the Playwright suite asserts the
  // ANONYMOUS shells, and it inherits apps/web/.env.local, so a machine
  // running local-dev-user must not hand it a signed-in home page.
  if (e2eTestMode) return { userId: null };
  if (devLocalUser) return { userId: LOCAL_USER_ID };
  return { userId: (await auth()).userId };
}

/** The signed-in account's email, for the account menu. */
export async function serverAccountEmail(): Promise<string | null> {
  if (e2eTestMode) return null;
  if (devLocalUser) return devLocalUser;
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? null;
}
