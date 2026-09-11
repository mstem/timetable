# Running with no Clerk keys (2026-09-08)

The ask, after two days of QA that couldn't reach a browser: open localhost.
Matt has no Clerk account, "which is one reason we're doing this locally".

Two things were in the way, and the first one is worth naming precisely
because it does not look like an auth problem.

## A placeholder key 500s every page

`.env.example` ships `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx`, and
`csp.ts` decodes the Clerk frontend-API origin out of that key: a
publishable key is `pk_test_` + base64(`<domain>$`). `xxx` **is** valid
base64. It decodes to three arbitrary bytes, those bytes went into
`connect-src`, and Node threw:

```
TypeError: Invalid character in header content ["content-security-policy"]
```

Every page, 500, with an error naming the CSP. It had already been read as
a CSP bug once (it is what made `npm run test:e2e` fail on this machine
yesterday). `clerkFrontendOrigin` now requires the decoded value to look
like a hostname, and a test pins the placeholder case along with an
assertion that the built header carries no non-ASCII bytes at all.

## local-dev-user

`DEV_LOCAL_USER=<seeded member email>` in `.env`, and
`NEXT_PUBLIC_DEV_LOCAL_USER=<the same>` in `apps/web/.env.local`. Clerk is
then never loaded and every request that carries no token acts as that
member.

Both halves are needed because they answer different questions. The API
needs the identity: `getUserFromRequest` sees no token, looks the email up
in the local `user` table and returns that row. Nothing is created, so a
typo reads as signed out rather than conjuring an account. The web app
needs only to know Clerk is off, and it needs that in the browser too:
`getClerkToken` waits up to 5 seconds for `window.Clerk` to appear, which
with no provider it never does, and every client mutation would have paid
that.

Switching member is an edit to both files plus a restart of both servers.
That is coarse, and it is the right amount of machinery for a local
convenience: no sign-in UI, no session, nothing to get out of sync.

## The seam that made it possible

Nine server components called Clerk's `auth()` directly, and `auth()`
throws when `clerkMiddleware` never ran. Guarding nine call sites was the
wrong shape, so they now go through `serverAuth()` in `lib/serverAuth.ts`,
the same way every API call already goes through the transport's
TransportAuth seam rather than reaching for Clerk itself.

The refactor is cheap because what the web app wants from Clerk turned out
to be thin. Every one of those call sites reads `userId` as *is somebody
signed in* and never as an identity — it redirects to `/sign-in`, or picks
an authed GraphQL document, or shows the topbar's account controls. So
local-dev-user hands back a fixed `"dev-local-user"` string, deliberately
not a real user id: nothing may look anybody up with it, and a value that
cannot match a row makes that loud if anything tries. The one real read,
`currentUser()` for the account menu's email, is the seam's second
function.

`E2E_TEST_MODE` outranks local-dev-user in that seam. The Playwright suite
inherits `apps/web/.env.local`, and it asserts the *anonymous* home page —
without the precedence, turning local-dev-user on would have broken the
smoke suite for everyone who did.

`AccountMenu` split rather than got guarded: `useClerk()` cannot be called
conditionally, so `AccountMenu` picks between a Clerk wrapper and the bare
body. "Account & security" and "Sign out" are dropped when there is no
session behind them, rather than left in place to throw. `authDisabled` is
fixed for the life of the build, so that branch never swaps and there is no
conditional-hook hazard.

## Guards

It signs every request in as one member, so:

- the API throws at boot if `DEV_LOCAL_USER` is set with
  `NODE_ENV=production`
- the web app throws at module load if `NEXT_PUBLIC_DEV_LOCAL_USER` is set
  in a production build

Both mirror `E2E_TEST_MODE`, which chose the same rule in the 2026-08-17
audit. The cost is that **`npm run build` fails locally while it is on** —
`next build` reads `.env.local`. That is the guard working; comment the web
line out to run the production build. CI never sets either variable, so
`verify` is unaffected (checked: the build passes with the variable unset).

## Verified

Signed in as Eli Morgan (host + elector) with no Clerk keys on the machine:
`/f/spt-test-data/queue` returns 200 and renders the arrow legend, the
round counter, and the composer. The same request path returns
`libraryMatches` for a published topic, so [[in-the-library]] can finally
be tested by pressing the key rather than by reasoning about it.
