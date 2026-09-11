/**
 * in-the-library (2026-09-07): one read that asks the Civic Tech Field
 * Guide what a topic is about.
 *
 * The web app calls this when the Topic Queue's ↓ opens a composer, and
 * pre-composes the answer as a comment (`composeLibraryComment`, in
 * @timetable/shared, so both sides write the same body). Resolving to null
 * rather than an empty list separates "the matcher is not configured here"
 * from "it had nothing to say".
 */
import { getTopicById } from "@timetable/core";
import {
  canComment,
  libraryQueryText,
  LIBRARY_MATCH_LIMIT,
  LIBRARY_TEXT_MAX,
  type LibraryMatch,
} from "@timetable/shared";

import { env } from "../env";
import { findLibraryMatches } from "../library";
import { builder } from "./builder";
import { readTimetable } from "./guards";

const LibraryMatchType = builder
  .objectRef<LibraryMatch>("LibraryMatch")
  .implement({
    fields: (t) => ({
      name: t.exposeString("name"),
      description: t.exposeString("description", { nullable: true }),
      /** Always an absolute http(s) link into app.civictech.guide — the
       * shared parser drops anything else, because this ends up as an
       * anchor in a comment body. */
      url: t.exposeString("url"),
      /** "category" | "issue" | "community". */
      kind: t.exposeString("kind"),
    }),
  });

/**
 * The words of a published topic in a forum this API has, when the viewer
 * could post the comment the matches would compose. Null when any link in
 * that chain fails — the caller treats every null the same way, as "no
 * suggestion", so the reason never needs distinguishing.
 */
async function ownTopicText(
  ctx: Parameters<typeof readTimetable>[0],
  idOrSlug: string,
  topicId: string,
): Promise<string | null> {
  const readable = await readTimetable(ctx, idOrSlug);
  if (!readable) return null;
  const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
  if (!canComment(viewer)) return null;
  const topic = await getTopicById(topicId);
  if (!topic || topic.timetableId !== readable.timetable.id) return null;
  if (topic.status !== "published") return null;
  return libraryQueryText({ title: topic.title, body: topic.bodyMd });
}

builder.queryFields((t) => ({
  /**
   * Up to three library entries matching a published topic, or null when
   * the matcher isn't configured (LIBRARY_RECOMMEND_URL) or the viewer
   * couldn't post the comment it would compose.
   *
   * Deliberately matched on the topic the server loads, never on text the
   * client sends: the endpoint's request budget is shared with the rest of
   * the internet, so this can't become a free proxy to it.
   */
  libraryMatches: t.field({
    type: [LibraryMatchType],
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
      limit: t.arg.int({ required: false }),
      /** remote-dev-api: the topic's own words, for a topic this API does
       * not have. Accepted ONLY by a local dev instance (see below). */
      text: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, ctx) => {
      const endpoint = env.libraryRecommendUrl;
      if (!endpoint) return null;

      // remote-dev-api against a REAL forum: the web app is reading topics
      // from a hosted API, so neither the forum nor the topic exists in this
      // database and the guard chain below has nothing to check. The caller
      // sends the topic's words instead.
      //
      // That is a text-in, matches-out endpoint, which is exactly what this
      // deliberately was not: matching on the server's own topic is what
      // stops it proxying a stranger's text to a matcher whose daily budget
      // is shared with the whole internet. So it is fenced behind three
      // local-only signals at once — a non-production build, a configured
      // DEV_LOCAL_USER, and a configured matcher. A hosted deployment fails
      // the first two (hosted dev runs a production build), so this path
      // cannot be reached by anything but a developer's own machine.
      if (args.text && !env.isProd && env.devLocalUser) {
        return findLibraryMatches({
          endpoint,
          text: args.text.slice(0, LIBRARY_TEXT_MAX),
          limit: args.limit ?? LIBRARY_MATCH_LIMIT,
        });
      }

      const text = await ownTopicText(ctx, args.idOrSlug, args.topicId);
      if (!text) return null;
      return findLibraryMatches({
        endpoint,
        text,
        limit: args.limit ?? LIBRARY_MATCH_LIMIT,
      });
    },
  }),
}));
