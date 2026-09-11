"use client";

import { useEffect, useRef } from "react";

/** Grow the box to fit its content; never shrink (so a manual drag-resize
 * is respected). border-box height = scrollHeight + the 2px of borders. */
function fit(el: HTMLTextAreaElement) {
  if (el.scrollHeight > el.clientHeight) {
    el.style.height = `${el.scrollHeight + 2}px`;
  }
}

/**
 * Comment-box textarea (QA 2026-07-29): rests at the send button's height
 * (CSS: .inline-form textarea, 40px — the button stays a circle) and grows
 * as content wraps — on input while typing, on mount for prefilled bodies
 * (editing a long comment), and when the value is written from OUTSIDE the
 * box (in-the-library's pre-composed comment, 2026-09-07: no input event
 * fires for that, so a five-line suggestion would have arrived in a
 * one-line box). Drag-resize still works and is never shrunk back.
 */
export function GrowingTextarea({
  ref,
  onInput,
  ...rest
}: React.ComponentProps<"textarea">) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const attach = (el: HTMLTextAreaElement | null) => {
    own.current = el;
    if (el) fit(el);
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  useEffect(() => {
    if (own.current) fit(own.current);
  }, [rest.value]);
  return (
    <textarea
      {...rest}
      ref={attach}
      onInput={(e) => {
        fit(e.currentTarget);
        onInput?.(e);
      }}
    />
  );
}
