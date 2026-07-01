"use client";

import { useMemo } from "react";
import type { RadishState } from "@/lib/radish";

type RadishCaptionProps = {
  error: string;
  progress: number;
  reply: string;
  state: RadishState;
  transcript: string;
};

function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, progress));
}

export function RadishCaption({
  error,
  progress,
  reply,
  state,
  transcript
}: RadishCaptionProps) {
  const words = useMemo(() => reply.split(/\s+/).filter(Boolean), [reply]);
  const activeCount = Math.max(0, Math.ceil(words.length * clampProgress(progress)));

  if (error) {
    return (
      <section className="speech-bubble" data-tone="error" aria-live="polite">
        <p className="caption-label">Oops-a-daisy</p>
        <p className="caption-line">{error}</p>
      </section>
    );
  }

  if (state === "listening") {
    return (
      <section className="speech-bubble" data-tone="listening" aria-live="polite">
        <p className="caption-label">Listening closely</p>
        <p className="caption-line">Ask me about growing, cooking, fun facts, or anything radishy.</p>
      </section>
    );
  }

  if (state === "thinking" && transcript) {
    return (
      <section className="speech-bubble" data-tone="thinking" aria-live="polite">
        <p className="caption-label">Hmm...</p>
        <p className="caption-line">{transcript}</p>
      </section>
    );
  }

  if (state === "speaking" && words.length > 0) {
    return (
      <section className="speech-bubble" data-tone="speaking" aria-live="polite">
        <p className="caption-label">Radley says</p>
        <p className="caption-words">
          {words.map((word, index) => (
            <span
              key={`${word}-${index}`}
              className="caption-word"
              data-active={index < activeCount}
            >
              {word}
            </span>
          ))}
        </p>
      </section>
    );
  }

  if (reply) {
    return (
      <section className="speech-bubble" data-tone="speaking" aria-live="polite">
        <p className="caption-label">Radley says</p>
        <p className="caption-line">{reply}</p>
      </section>
    );
  }

  return (
    <section className="speech-bubble" aria-live="polite">
      <p className="caption-label">Ready to chat</p>
      <p className="caption-line">Tap the button, ask your question, then tap again so I can answer.</p>
    </section>
  );
}
