import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { authDisabled } from "@/env";
import { remoteGraphql } from "@/lib/remoteApi";
import { createTransport } from "@/lib/transport";
import { VIEW_AS_COOKIE } from "@/lib/userPreview";

/** remote-dev-api: server-rendered reads go straight to the hosted dev API
 * with the personal token. No proxy hop needed here — the browser needs one
 * only because the token must not travel to it. */
const remote = remoteGraphql();

/** Server adapter at the TransportAuth seam: Clerk request auth and the
 * view-as cookie via next/headers. The closures run per call, so every
 * request reads its own context. */
export const serverTransport = createTransport({
  graphqlUrl: remote?.url,
  getToken: async () => {
    if (remote) return remote.token;
    // local-dev-user / the Playwright shells: no Clerk ran, so there is no
    // token to fetch and calling auth() would throw. The API resolves the
    // acting member from its own DEV_LOCAL_USER instead.
    if (authDisabled) return null;
    const { getToken } = await auth();
    return getToken();
  },
  getViewAs: async () => (await cookies()).get(VIEW_AS_COOKIE)?.value,
});
