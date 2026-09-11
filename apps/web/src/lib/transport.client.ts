import { remoteApi } from "@/env";
import { getClerkToken } from "@/lib/clientAuth";
import { createTransport } from "@/lib/transport";
import { VIEW_AS_COOKIE } from "@/lib/userPreview";

/** Browser adapter at the TransportAuth seam: Clerk's window bundle and
 * document.cookie.
 *
 * remote-dev-api sends GraphQL to a same-origin route handler instead, and
 * carries no bearer of its own — the route attaches the personal API token
 * server-side, because a token in a client bundle is a token given away. */
export const clientTransport = createTransport({
  graphqlUrl: remoteApi ? "/api/remote-graphql" : undefined,
  getToken: remoteApi ? async () => null : getClerkToken,
  getViewAs: async () => {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${VIEW_AS_COOKIE}=([^;]+)`),
    );
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  },
});
