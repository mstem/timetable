"use client";

/**
 * held-comments (Matt, 2026-09-11): a comment the API turned away for rate
 * limiting is kept and sent again when the window reopens, instead of being
 * lost with an error toast.
 *
 * This matters because of how the app is being used: pointed at a real
 * forum through a personal API token, which may post 20 comments an hour
 * and 60 a day (`TOKEN_WRITE_LIMITS.comments`). Working through a long
 * queue reaches that, and the 21st comment is real writing that the person
 * has just edited by hand. Losing it to a toast is the wrong answer.
 *
 * **localStorage, not a module-level map** — unlike [[comment-draft-store]],
 * which is deliberately in memory because a half-typed line is a
 * within-visit convenience. An hour is longer than a browser tab, so
 * anything held has to survive a reload, a crash, and going away for lunch.
 *
 * Every access is wrapped: a private window, cleared site data, or a
 * browser set to block storage all throw on the accessor itself, and a
 * failure to hold is not a reason to break posting.
 */

const KEY = "timetable:held-comments";

/** The hourly window the server enforces, used when it doesn't say. */
const DEFAULT_RETRY_MS = 60 * 60 * 1000;

/** Refuse to grow without bound if something is wrong and nothing drains. */
const MAX_HELD = 100;

export type HeldComment = {
  /** Stable id, so a flush can remove exactly what it sent. */
  id: string;
  topicId: string;
  visibility: string;
  body: string;
  /** What the person will recognise it by in a message. */
  topicTitle: string | null;
  /** Epoch ms: the earliest it is worth trying again. */
  retryAt: number;
  attempts: number;
};

function read(): HeldComment[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything that doesn't look like a held comment is dropped rather than
    // crashing the flush — this is storage written by an older build.
    return parsed.filter(
      (e): e is HeldComment =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as HeldComment).id === "string" &&
        typeof (e as HeldComment).topicId === "string" &&
        typeof (e as HeldComment).body === "string",
    );
  } catch {
    return [];
  }
}

function write(entries: HeldComment[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_HELD)));
  } catch {
    // Storage unavailable or full. The comment is still on screen in the
    // composer's own error path; nothing here is worth throwing over.
  }
}

/** Everything waiting, oldest first. */
export function listHeld(): HeldComment[] {
  return read();
}

/** Those whose retry time has passed. */
export function dueHeld(now = Date.now()): HeldComment[] {
  return read().filter((e) => e.retryAt <= now);
}

/** When the next one can go, or null if nothing is waiting. */
export function nextRetryAt(): number | null {
  const times = read().map((e) => e.retryAt);
  return times.length ? Math.min(...times) : null;
}

/**
 * Hold a comment the server refused. `retryAfterSeconds` is the server's
 * own figure when it sent one.
 */
export function holdComment(args: {
  topicId: string;
  visibility: string;
  body: string;
  topicTitle?: string | null;
  retryAfterSeconds?: number | null;
  now?: number;
}): HeldComment {
  const now = args.now ?? Date.now();
  const entry: HeldComment = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    topicId: args.topicId,
    visibility: args.visibility,
    body: args.body,
    topicTitle: args.topicTitle ?? null,
    retryAt:
      now +
      (args.retryAfterSeconds && args.retryAfterSeconds > 0
        ? args.retryAfterSeconds * 1000
        : DEFAULT_RETRY_MS),
    attempts: 0,
  };
  write([...read(), entry]);
  return entry;
}

/** Sent, or abandoned. */
export function releaseHeld(id: string): void {
  write(read().filter((e) => e.id !== id));
}

/** Refused again: push it out and count the attempt. */
export function deferHeld(
  id: string,
  retryAfterSeconds?: number | null,
  now = Date.now(),
): void {
  write(
    read().map((e) =>
      e.id === id
        ? {
            ...e,
            attempts: e.attempts + 1,
            retryAt:
              now +
              (retryAfterSeconds && retryAfterSeconds > 0
                ? retryAfterSeconds * 1000
                : DEFAULT_RETRY_MS),
          }
        : e,
    ),
  );
}

/** Everything, gone — for a "discard these" control and for tests. */
export function clearHeld(): void {
  write([]);
}
