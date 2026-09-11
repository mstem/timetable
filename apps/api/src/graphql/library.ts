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
    },
    resolve: async (_parent, args, ctx) => {
      const endpoint = env.libraryRecommendUrl;
      if (!endpoint) return null;
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      if (!canComment(viewer)) return null;
      const topic = await getTopicById(args.topicId);
      if (!topic || topic.timetableId !== readable.timetable.id) return null;
      if (topic.status !== "published") return null;
      return findLibraryMatches({
        endpoint,
        text: libraryQueryText({ title: topic.title, body: topic.bodyMd }),
        limit: args.limit ?? LIBRARY_MATCH_LIMIT,
      });
    },
  }),
}));
