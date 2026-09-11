"use client";

import { useEffect, useRef } from "react";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import {
  deferHeld,
  dueHeld,
  listHeld,
  releaseHeld,
  type HeldComment,
} from "@/lib/pendingComments";
import { GqlError } from "@/lib/transport";

const MUTATION = `mutation SendHeld($id: String!, $body: String!, $visibility: String) {
  addComment(topicId: $id, body: $body, visibility: $visibility) { id }
}`;

/** How often to look. The window is an hour, so this is unhurried; it exists
 * so a tab left open drains by itself rather than waiting for a reload. */
const SWEEP_MS = 60_000;

function whenLabel(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * held-comments: sends the comments the API turned away, once their window
 * has reopened.
 *
 * Renders nothing. It lives in the app layout so a held comment goes out
 * from whatever page is open, and it only ever sends what a person already
 * wrote and submitted — it starts nothing of its own.
 *
 * One at a time, and it stops at the first refusal: the whole reason there
 * is a queue is that the server is counting writes, so firing the rest
 * would just burn attempts and push every retry further out.
 */
export function HeldComments() {
  const { toast, toastError } = useToast();
  const sweeping = useRef(false);
  // Toast the backlog once per mount, not once per sweep.
  const announced = useRef(false);

  useEffect(() => {
    async function sendOne(entry: HeldComment): Promise<boolean> {
      try {
        await clientGql(MUTATION, {
          id: entry.topicId,
          body: entry.body,
          visibility: entry.visibility,
        });
        releaseHeld(entry.id);
        toast(
          entry.topicTitle
            ? `Sent your held comment on “${entry.topicTitle}”`
            : "Sent a held comment",
        );
        return true;
      } catch (err) {
        if (err instanceof GqlError && err.code === "RATE_LIMITED") {
          deferHeld(entry.id, err.retryAfterSeconds);
          return false;
        }
        // Anything else is the comment itself being refused — a deleted
        // topic, a lost role. Holding it forever would retry a thing that
        // cannot succeed, so it is let go with the reason said out loud.
        releaseHeld(entry.id);
        toastError(
          `Couldn't send a held comment: ${err instanceof Error ? err.message : "unknown error"}`,
        );
        return false;
      }
    }

    /** Say what is waiting, once, so a backlog is never silent. */
    function announceBacklog() {
      const all = listHeld();
      if (all.length === 0) return;
      const plural = all.length === 1 ? "" : "s";
      const next = Math.min(...all.map((e) => e.retryAt));
      toast(
        next > Date.now()
          ? `${all.length} comment${plural} waiting to send, from ${whenLabel(next)}`
          : `Sending ${all.length} held comment${plural}…`,
      );
    }

    async function sweep() {
      if (sweeping.current) return;
      sweeping.current = true;
      try {
        if (!announced.current) {
          announced.current = true;
          announceBacklog();
        }
        for (const entry of dueHeld()) {
          if (!(await sendOne(entry))) break;
        }
      } finally {
        sweeping.current = false;
      }
    }

    void sweep();
    const timer = setInterval(() => void sweep(), SWEEP_MS);
    return () => clearInterval(timer);
  }, [toast, toastError]);

  return null;
}
