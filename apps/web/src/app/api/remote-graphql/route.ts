/**
 * remote-dev-api's browser hop (2026-09-08). Forwards a GraphQL request to
 * the hosted dev API with the personal API token attached, so the token
 * stays on this machine and never ships in a client bundle.
 *
 * Same origin as the page, which is what keeps it inside the CSP's
 * `connect-src 'self'` and out of the hosted API's WEB_ORIGIN list. A direct
 * browser call to dev.timetable.love would fail both checks.
 *
 * Local-only by construction: `lib/remoteApi.ts` returns null unless both
 * REMOTE_API_URL and REMOTE_API_TOKEN are set, and `NEXT_PUBLIC_REMOTE_API` (the
 * flag that makes the browser use this route) refuses to exist in a
 * production build.
 */
import { remoteApiHost, remoteGraphql } from "@/lib/remoteApi";

/** Only what a GraphQL POST needs. The x-view-as preview header is
 * deliberately not forwarded: previews are an admin session's power, and a
 * personal token isn't a session. */
export async function POST(request: Request) {
  const target = remoteGraphql();
  if (!target) {
    return Response.json(
      {
        errors: [
          {
            message:
              "Remote dev API not configured — set REMOTE_API_URL and REMOTE_API_TOKEN in apps/web/.env.local",
          },
        ],
      },
      { status: 503 },
    );
  }

  const body = await request.text();
  let upstream: Response;
  try {
    upstream = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.token}`,
      },
      body,
      cache: "no-store",
    });
  } catch (err) {
    return Response.json(
      {
        errors: [
          {
            message: `Could not reach ${remoteApiHost}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      },
      { status: 502 },
    );
  }

  // Pass the envelope through untouched, status included — the transport
  // reads GraphQL errors out of the body and needs them intact.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
