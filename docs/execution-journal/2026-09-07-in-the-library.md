# In the Library: ↓ pre-composes the comment (2026-09-07)

The ask: on the Topic Queue, ↓ should not just open the comment box, it
should already have something in it. Run the topic past the Civic Tech
Field Guide's content matcher, take the three most relevant library
entries, and write the comment that points at them.

```
Real-world examples from the library:
Chat and messaging: https://app.civictech.guide/category?recordId=recmrEYFSv9YkDrHi
Group communication tools: https://app.civictech.guide/category?recordId=rec5oibXQMpHzhi6c
Slacks, Discords, Teams: https://app.civictech.guide/category?recordId=recsOBRoU46RqsBHP
```

That is a real answer, matched against the seeded "Comparative Chat
Architecture" topic on 2026-09-07. The lead started as a heading ("In the
Library") plus a sentence explaining what the links were; Matt cut it to
the one line on 2026-09-08, which is what a colon and a list are for.

## The matcher

`ctfg-guidefinder` (github.com/Civic-Tech-Field-Guide/ctfg-guidefinder) is a
widget plus a public endpoint: `POST curator.civictech.guide/api/recommend`
takes up to 5000 characters and returns up to three entries in three
groups, categories then issues then communities, each with a name, a
description and a link into `app.civictech.guide`. The widget's own
ordering is the ranking, and it is kept: categories lead because a category
is the most specific thing the library can point at.

The widget calls the endpoint from the browser. This doesn't. The request
goes out from the API instead, for three reasons: the endpoint's budget is
**400 requests a day shared by every caller on the internet** (10 a minute
per IP), so it needs a cache in front of it and one egress address behind
it; the matching text is then the topic the server loaded rather than
whatever a client posted, so this can't become a free proxy to someone
else's rate limit; and there is no CORS question.

`apps/api/src/library.ts` is that request. 24-hour cache keyed by the exact
text (the endpoint caches for 24 hours too, and this is what stops us
spending a request to discover that), in-flight dedupe so two people
opening the same card cost one lookup, a 15-second timeout, and never a
throw: a timeout, a 429, a response we can't read and an unconfigured
matcher are all "no suggestion". Failures are deliberately not cached.

## Local only, by having no URL

`LIBRARY_RECOMMEND_URL` unset means `libraryMatches` resolves to null and
nothing else happens. `.env.example` carries the endpoint; the hosted app
specs deliberately don't. Pointing a hosted forum at a 400-a-day budget
shared with the rest of the internet is a decision, not a default.

## Writing into a box someone else owns

The composer is a mounted React component reading
[[comment-draft-store]]'s module-level map, and the suggestion arrives from
a fetch that component never made, a second or two after ↓. So the store
grew two functions: `setDraft`, which writes a key and notifies whatever is
showing it, and `getDraft`, which is how a caller checks whether the box is
already occupied. `useDraft` subscribes per key, so a suggestion for one
topic doesn't re-render the queue's other composers. The mount case needs
no notification: a composer that mounts after the fetch resolves reads the
map in its initialiser, which matters because ↓ opens a pane that renders a
frame later.

A pre-filled box is a destructive thing to hand someone, so it is guarded
at both ends: only written when the draft is empty at the press, and only
if it is *still* empty when the matcher answers. Start typing your own
comment while the lookup is in flight and yours wins. One lookup per topic
per mount, tracked by topic id rather than a boolean, because
`router.refresh()` reconciles `QueueControls` in place.

Plain text with bare URLs, because that is what a comment body is here:
`splitLinks`/`CommentBody` autolink anything starting `https://`, and there
is no markdown. One entry per line, so three of them read as a list.

## The one-line box

`GrowingTextarea` grew on input and on mount, and a programmatic value
change is neither, so a five-line suggestion would have landed in a 40px
box. It now also fits on a value change. (It looked like it worked in
review: the ref callback is a fresh closure every render, so React
re-attaches it on every commit and `fit` ran anyway. That is an accident,
not a mechanism.)

## Shape

- `packages/shared/src/library.ts` — pure and unit-tested: the query text,
  the parser (order, cap, dedupe, title-casing the lowercase issue and
  community names), and `composeLibraryComment`. The URL check is a regex,
  not `new URL`, because this package has no DOM lib — and because what
  matters is the shape of an accepted link: http(s) only, no whitespace.
  A `javascript:` href from a third-party response must never reach an
  anchor in a comment body.
- `apps/api/src/library.ts` — the request and the cache.
- `apps/api/src/graphql/library.ts` — `libraryMatches(idOrSlug, topicId,
  limit)`, gated on a readable forum, a published topic in it, and
  `canComment`: it composes a comment, so it is gated like posting one.
- `QueueControls` — ↓ fires the lookup alongside `requestOpen` and the
  focus retry.

## Why "nothing happened"

First press in a real browser did nothing, and the reason was not in this
feature: the web app was on `localhost:3000` while `.env` allowed
`localhost:3001`, so the API's CORS preflight came back without an
`Access-Control-Allow-Origin` and the browser killed the fetch. ↓ still
focused the box, so it read as a feature that was never wired up.

The `catch` was doing its job too well. It now logs, because a blocked
fetch and "no matches" were indistinguishable from the outside, and the
whole point of the empty box is that it must not interrupt the round.
Diagnosis in the end was a throwaway Playwright script against the running
dev server: goto, press ArrowDown, print the textarea value and every
console message. Worth reaching for earlier than a fourth read of the
code.

## Not done

Only ↓ on the queue. Clicking into a composer with the mouse, on the queue
or anywhere else, still gets an empty box, and there is no visible
"looking…" state while the matcher thinks: the text either appears or
doesn't. Both are worth revisiting once it has been used for a round or
two.
