"use client";

import { useMemo } from "react";
import type { RadishState } from "@/lib/radish";

type RadishCaptionProps = {
  error: string;
  mode: "text" | "voice";
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
  mode,
  progress,
  reply,
  state,
  transcript
}: RadishCaptionProps) {
  const words = useMemo(() => reply.split(/\s+/).filter(Boolean), [reply]);
  const activeCount = Math.max(0, Math.ceil(words.length * clampProgress(progress)));
  const idleHint =
    mode === "voice"
      ? "Tap start, ask your question, then tap again so I can answer."
      : "Type a radish question and press Enter or tap send.";

  if (error) {
    return (
      <section className="response-panel" data-tone="error" aria-live="polite">
        <p className="caption-label">Oops-a-daisy</p>
        <div className="response-body">
          <p className="caption-line">{error}</p>
        </div>
      </section>
    );
  }

  if (state === "listening") {
    return (
      <section className="response-panel" data-tone="listening" aria-live="polite">
        <p className="caption-label">Listening closely</p>
        <div className="response-body">
          <p className="caption-line">
            Ask me about growing, cooking, fun facts, or anything radishy.
          </p>
        </div>
      </section>
    );
  }

  if (state === "thinking") {
    return (
      <section className="response-panel" data-tone="thinking" aria-live="polite">
        <p className="caption-label">Radley is thinking</p>
        <div className="response-body">
          {transcript ? (
            <>
              <p className="caption-label-secondary">Your question</p>
              <p className="caption-line">{transcript}</p>
            </>
          ) : null}
          <p className="caption-line thinking-line">
            I am checking my garden notes
            <span className="thinking-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </p>
        </div>
      </section>
    );
  }

  if (state === "speaking" && words.length > 0) {
    return (
      <section className="response-panel" data-tone="speaking" aria-live="polite">
        <p className="caption-label">Radley says</p>
        <div className="response-body">
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
        </div>
      </section>
    );
  }

  if (reply) {
    return (
      <section className="response-panel" data-tone="speaking" aria-live="polite">
        <p className="caption-label">Radley says</p>
        <div className="response-body">
          <p className="caption-line">{reply}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="response-panel" aria-live="polite">
      <p className="caption-label">Ready to chat</p>
      <div className="response-body">
        <p className="caption-line">{idleHint}</p>
      </div>
    </section>
  );
}
