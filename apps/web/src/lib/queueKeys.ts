/**
 * queue-keys: the Topic Queue's arrow mapping — ← back, → next, ↑ ❤️,
 * ↓ comment. Pure, so the mapping is unit-tested without a DOM and the
 * component keeps only the wiring.
 */
export type QueueKeyAction = "back" | "next" | "heart" | "comment";

const KEY_ACTIONS: Record<string, QueueKeyAction> = {
  ArrowLeft: "back",
  ArrowRight: "next",
  ArrowUp: "heart",
  ArrowDown: "comment",
};

/** The action an arrow press asks for, or null for anything else. Any
 * modifier means the keystroke belongs to the browser (⌘← is history
 * back, ⌥↓ jumps a paragraph) — those pass straight through. */
export function queueKeyAction(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): QueueKeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return null;
  }
  return KEY_ACTIONS[event.key] ?? null;
}

/**
 * ↓ pressed inside an EMPTY topic composer still belongs to the queue.
 *
 * There is no caret work for it to do in an empty box, and the box it
 * would fill is the one under the cursor. Without this the FIRST ↓ focuses
 * the composer and every ↓ after it is swallowed by `isTypingTarget`, so
 * the library suggestion can never be asked for a second time without
 * clicking away first (2026-09-11). The queue shows one card, so matching
 * any `data-topic-composer` is enough and avoids a stale topic id in the
 * window listener.
 */
export function isEmptyTopicComposer(
  target:
    | { value?: string; dataset?: { topicComposer?: string } }
    | null
    | undefined,
): boolean {
  if (!target?.dataset || target.dataset.topicComposer === undefined) {
    return false;
  }
  return (target.value ?? "").trim() === "";
}

/** True while the keystroke belongs to something being typed in — above
 * all the composer that ↓ just opened, where ↓ moves the caret and Enter
 * posts (CommentComposer's `submitOnEnter`). */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
