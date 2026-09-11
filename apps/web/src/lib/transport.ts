import { env } from "@/env";

/**
 * The one deep module for talking to the API. Everything invariant lives
 * here: URL resolution (via @/env, the single source of the fallbacks),
 * bearer-header assembly, x-view-as forwarding, and GraphQL envelope
 * handling. The only thing that varies between environments is how auth is
 * read — that's the TransportAuth seam, satisfied by two adapters:
 * transport.server.ts (Clerk request auth + next/headers cookies) and
 * transport.client.ts (Clerk browser bundle + document.cookie).
 */
export type TransportAuth = {
  /** Clerk session token, or null when signed out/anonymous. */
  getToken(): Promise<string | null>;
  /** Path-scoped view-as-user preview value (QA #59 round 3), if active.
   * Only ever forwarded alongside a token; the API re-verifies admin
   * rights on every request. */
  getViewAs(): Promise<string | undefined>;
  /** Send GraphQL somewhere other than `env.graphqlUrl` — remote-dev-api
   * points it at the hosted dev API (server) or at the route handler that
   * holds the token (browser). REST is unaffected and stays local. */
  graphqlUrl?: string;
};

export type Transport = {
  gql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  rest(path: string, init?: RequestInit): Promise<Response>;
};

type GraphQLEnvelope<T> = {
  data?: T;
  errors?: {
    message: string;
    extensions?: { code?: string; retryAfterSeconds?: number };
  }[];
};

/**
 * A GraphQL error with the server's own `extensions` kept (2026-09-11).
 * Callers used to get a bare Error carrying only the message, so the one
 * piece of machine-readable detail the API sends — `RATE_LIMITED` and how
 * many seconds until the window reopens — was thrown away at the seam and
 * could only be recovered by matching on English.
 */
export class GqlError extends Error {
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    extensions?: { code?: string; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = "GqlError";
    this.code = extensions?.code ?? null;
    this.retryAfterSeconds = extensions?.retryAfterSeconds ?? null;
  }
}

export function createTransport(auth: TransportAuth): Transport {
  async function authHeaders(
    withViewAs: boolean,
  ): Promise<Record<string, string>> {
    const token = await auth.getToken();
    if (!token) return {};
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (withViewAs) {
      const viewAs = await auth.getViewAs();
      if (viewAs) headers["x-view-as"] = viewAs;
    }
    return headers;
  }

  /** GraphQL POST. Envelope errors win over HTTP status (a 400 with a
   * validation message surfaces the message, not the code); a non-ok
   * response without a parseable envelope surfaces the status. */
  const gql = async <T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> => {
    const res = await fetch(auth.graphqlUrl ?? env.graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders(true)),
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    let json: GraphQLEnvelope<T> | undefined;
    try {
      json = (await res.json()) as GraphQLEnvelope<T>;
    } catch {
      json = undefined;
    }
    if (json?.errors?.length) {
      const first = json.errors[0];
      throw new GqlError(first?.message ?? "GraphQL error", first?.extensions);
    }
    if (!res.ok) {
      throw new Error(`GraphQL request failed: ${res.status}`);
    }
    if (!json?.data) {
      throw new Error("GraphQL response had no data");
    }
    return json.data;
  };

  /** REST fetch; returns the raw Response — callers own error handling.
   * Deliberately does NOT forward x-view-as: previews are read-only and
   * the REST surface is all writes, which the API blocks under preview. */
  const rest = async (path: string, init?: RequestInit): Promise<Response> => {
    // Every call site passes a literal "/api/..." path today; this guard
    // keeps a future caller from smuggling an absolute or scheme-relative
    // URL in and sending the bearer token cross-origin (audit 2026-08-17).
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new Error(`rest() takes a same-origin path, got "${path}"`);
    }
    return fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders(false)),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  };

  return { gql, rest };
}
