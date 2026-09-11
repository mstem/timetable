"use client";

import { env } from "@/env";

/**
 * A browser GraphQL request that always goes to the LOCAL API, whatever
 * `remote-dev-api` has pointed the main transport at.
 *
 * One caller: in-the-library's `libraryMatches`. That field is not deployed
 * anywhere, so under remote-dev-api the ordinary transport would ask the
 * hosted dev API for a field its schema has never heard of and ↓ would go
 * quiet again. Asking the local API instead works because `db:seed` is
 * deterministic: every topic in the hosted dev forum has the same id and the
 * same title and body locally (checked 2026-09-08 — 50 of 50 ids identical),
 * so a local match on a hosted topic id is a match on the same text.
 *
 * No bearer: the local API resolves the member from its own DEV_LOCAL_USER
 * ([[local-dev-user]]), and a Clerk token would be meaningless to it here.
 * Deliberately thin — no envelope niceties beyond what the one caller needs,
 * which already treats any failure as "no suggestion".
 */
export async function localGql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(env.graphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "GraphQL error");
  }
  if (!json.data) throw new Error(`Local GraphQL failed: ${res.status}`);
  return json.data;
}
