// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  clientGql: vi.fn(),
  localGql: vi.fn(),
  toast: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/clientGraphql", () => ({
  clientGql: (...args: unknown[]) => mocks.clientGql(...args),
}));

// in-the-library asks the LOCAL api (remote-dev-api points the shared
// transport at hosted dev, which has no libraryMatches field).
vi.mock("@/lib/localGraphql", () => ({
  localGql: (...args: unknown[]) => mocks.localGql(...args),
}));

vi.mock("@/components/Toast", () => ({
  useToast: () => ({ toast: mocks.toast, toastError: mocks.toastError }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { QueueControls } from "@/components/QueueControls";
import { clearDraft, draftKey, getDraft, setDraft } from "@/lib/commentDrafts";

const PUBLIC_DRAFT = draftKey.comment("t1", "public");

const MATCHES = [
  { name: "Chat and messaging", url: "https://app.civictech.guide/c?r=1" },
  { name: "Deliberation", url: "https://app.civictech.guide/c?r=2" },
];

/** The Topic Queue's arrow keys (queue-keys, 2026-09-07). Each arrow must
 * do exactly what its button does — and, just as important, stand down
 * when the keystroke isn't the queue's: a modifier belongs to the browser,
 * and anything typed in the composer belongs to the composer. */
function setup(props: Partial<Parameters<typeof QueueControls>[0]> = {}) {
  return render(
    <>
      <QueueControls
        topicId="t1"
        hearted={false}
        canHeart
        slug="spt"
        back={0}
        historyCount={0}
        {...props}
      />
      {/* The card's public composer, which ↓ goes looking for. */}
      <textarea data-topic-composer="t1" aria-label="Comment" />
    </>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearDraft(PUBLIC_DRAFT);
  mocks.clientGql.mockResolvedValue({});
  mocks.localGql.mockResolvedValue({});
  // jsdom has no layout, so it doesn't implement this.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("queue-keys", () => {
  it("← steps back through this round's history", () => {
    setup({ historyCount: 2 });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(mocks.push).toHaveBeenCalledWith("/f/spt/queue?back=1");
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("← does nothing on the first card of a round", () => {
    setup({ historyCount: 0 });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("→ marks the topic seen and advances", async () => {
    setup();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mocks.clientGql).toHaveBeenCalledWith(
      expect.stringContaining("queueMarkSeen"),
      { id: "t1" },
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("→ steps forward while looking back, marking nothing seen", () => {
    setup({ back: 1, historyCount: 2 });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mocks.push).toHaveBeenCalledWith("/f/spt/queue");
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("↑ toggles the ❤️ without advancing", async () => {
    setup();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(mocks.clientGql).toHaveBeenCalledWith(
      expect.stringContaining("heartTopic"),
      { id: "t1" },
    );
    await waitFor(() => expect(mocks.clientGql).toHaveBeenCalledTimes(1));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("↑ is inert for a member without the gesture", () => {
    setup({ canHeart: false });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("↓ puts the caret in the composer", async () => {
    setup();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Comment")),
    );
  });

  it("stands down while the member is typing", () => {
    setup({ historyCount: 2 });
    const box = screen.getByLabelText("Comment");
    fireEvent.keyDown(box, { key: "ArrowRight" });
    fireEvent.keyDown(box, { key: "ArrowLeft" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(mocks.clientGql).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("leaves modified arrows to the browser", () => {
    setup({ historyCount: 2 });
    fireEvent.keyDown(window, { key: "ArrowLeft", metaKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(window, { key: "ArrowUp", altKey: true });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("↓ pre-composes the In the Library comment (in-the-library)", async () => {
    mocks.localGql.mockResolvedValue({ libraryMatches: MATCHES });
    setup();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() =>
      expect(getDraft(PUBLIC_DRAFT)).toBe(
        [
          "Real-world examples from the library:",
          "Chat and messaging: https://app.civictech.guide/c?r=1",
          "Deliberation: https://app.civictech.guide/c?r=2",
        ].join("\n"),
      ),
    );
  });

  it("↓ leaves a half-written comment alone", async () => {
    mocks.localGql.mockResolvedValue({ libraryMatches: MATCHES });
    setDraft(PUBLIC_DRAFT, "my own thought");
    setup();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Comment")),
    );
    expect(getDraft(PUBLIC_DRAFT)).toBe("my own thought");
    expect(mocks.localGql).not.toHaveBeenCalled();
  });

  it("↓ writes nothing when the matcher is off or has no answer", async () => {
    mocks.localGql.mockResolvedValue({ libraryMatches: null });
    setup();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() =>
      expect(mocks.localGql).toHaveBeenCalledWith(
        expect.stringContaining("libraryMatches"),
        { s: "spt", id: "t1", text: null },
      ),
    );
    expect(getDraft(PUBLIC_DRAFT)).toBe("");
  });

  /** The reported break (2026-09-11): ↓ focuses the composer, so a second ↓
   * arrived with the composer as the event target and used to be handed
   * straight to it. */
  it("↓ works again with the caret already in an empty composer", async () => {
    mocks.localGql.mockResolvedValue({ libraryMatches: MATCHES });
    setup();
    const box = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() => expect(getDraft(PUBLIC_DRAFT)).not.toBe(""));

    clearDraft(PUBLIC_DRAFT);
    box.value = "";
    mocks.localGql.mockClear();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    await waitFor(() => expect(mocks.localGql).toHaveBeenCalled());
  });

  it("↓ in a composer with text in it still belongs to the composer", () => {
    setup();
    const box = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    box.value = "half a thought";
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(mocks.localGql).not.toHaveBeenCalled();
  });

  it("sends the topic's own words when the card has them", async () => {
    mocks.localGql.mockResolvedValue({ libraryMatches: MATCHES });
    setup({ topicText: "Separatist Utopias\n\nHow collectives form." });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() =>
      expect(mocks.localGql).toHaveBeenCalledWith(expect.any(String), {
        s: "spt",
        id: "t1",
        text: "Separatist Utopias\n\nHow collectives form.",
      }),
    );
  });

  it("drops the ❤️ hint from the legend without the gesture", () => {
    const { container } = setup({ canHeart: false });
    expect(container.textContent).toContain("comment");
    expect(container.textContent).not.toContain("❤️");
  });
});
