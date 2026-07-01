"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { GardenShowcase, type GardenVideo } from "@/components/garden-showcase";
import { RadishCaption } from "@/components/radish-caption";
import { RadishCharacter } from "@/components/radish-character";
import {
  type RadishReplyPayload,
  type RadishState,
  transitionRadishState
} from "@/lib/radish";

type InteractionMode = "text" | "voice";

type SpeechStatus = {
  error: string;
  playbackHint: string;
  reply: string;
  transcript: string;
};

const SHOWCASE_VIDEOS: [GardenVideo, GardenVideo] = [
  {
    title: "Every two days",
    description:
      "Two kinds of radish and lettuce planted in a small pot, watered every two days.",
    src: "/media/every-two-days.mp4",
    poster: "/media/posters/every-two-days.png"
  },
  {
    title: "Daily watering",
    description:
      "Two kinds of radish and lettuce planted in a large pot, watered every day.",
    src: "/media/daily.mp4",
    poster: "/media/posters/daily.png"
  }
];

function getStatusLabel(state: RadishState) {
  switch (state) {
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "idle":
    default:
      return "Idle";
  }
}

function getMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function buildAudioBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function estimateReplyDuration(reply: string) {
  return Math.min(7.2, Math.max(2.4, reply.length * 0.05));
}

export function RadishApp() {
  const [mode, setMode] = useState<InteractionMode>("voice");
  const [state, setState] = useState<RadishState>("idle");
  const [status, setStatus] = useState<SpeechStatus>({
    error: "",
    playbackHint: "",
    reply: "",
    transcript: ""
  });
  const [selectedVideo, setSelectedVideo] = useState<GardenVideo | null>(null);
  const [captionProgress, setCaptionProgress] = useState(0);
  const [textPrompt, setTextPrompt] = useState("");
  const [hasReplayAudio, setHasReplayAudio] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const requestAbortRef = useRef<AbortController | null>(null);
  const frameRef = useRef<number>(0);
  const silentTimerRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;

    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      requestAbortRef.current?.abort();
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (silentTimerRef.current) {
        window.clearTimeout(silentTimerRef.current);
      }
      if (audio) {
        audio.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedVideo) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedVideo(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVideo]);

  const clearProgressTimers = () => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    if (silentTimerRef.current) {
      window.clearTimeout(silentTimerRef.current);
      silentTimerRef.current = 0;
    }
  };

  const stopPlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    audio.onerror = null;
  };

  const clearReplayAudio = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setHasReplayAudio(false);

    const audio = audioRef.current;
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
  };

  const resetToIdle = () => {
    clearProgressTimers();
    setCaptionProgress(0);
    setState((current) => transitionRadishState(current, "reset"));
  };

  const trackAudioProgress = (duration: number, startedAt: number) => {
    clearProgressTimers();

    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const progress = duration > 0 ? elapsed / duration : 0;

      setCaptionProgress(progress);

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);
  };

  const performSilentReply = (reply: string) => {
    const duration = estimateReplyDuration(reply);
    const startedAt = performance.now();

    setState((current) => transitionRadishState(current, "start-speaking"));
    trackAudioProgress(duration, startedAt);

    silentTimerRef.current = window.setTimeout(() => {
      setCaptionProgress(1);
      resetToIdle();
    }, duration * 1000);
  };

  const playReplyAudio = async (audioUrl: string, reply: string) => {
    const audio = audioRef.current;
    if (!audio) {
      performSilentReply(reply);
      return;
    }

    const duration = estimateReplyDuration(reply);
    stopPlayback();
    audio.src = audioUrl;
    audio.currentTime = 0;

    audio.onended = () => {
      setCaptionProgress(1);
      resetToIdle();
    };

    audio.onerror = () => {
      setStatus((current) => ({
        ...current,
        playbackHint: "Audio is ready. Tap replay if Safari stayed quiet."
      }));
      setCaptionProgress(1);
      resetToIdle();
    };

    setState((current) => transitionRadishState(current, "start-speaking"));
    trackAudioProgress(duration, performance.now());

    try {
      await audio.play();
      setStatus((current) => ({ ...current, playbackHint: "" }));
    } catch {
      setStatus((current) => ({
        ...current,
        playbackHint: "Audio is ready. Tap replay if Safari stayed quiet."
      }));
      setCaptionProgress(1);
      resetToIdle();
    }
  };

  const speakReply = async (payload: RadishReplyPayload) => {
    if (!payload.audio?.base64 || !payload.audio.mimeType) {
      clearReplayAudio();
      performSilentReply(payload.reply);
      return;
    }

    clearReplayAudio();
    const audioUrl = URL.createObjectURL(
      buildAudioBlob(payload.audio.base64, payload.audio.mimeType)
    );
    audioUrlRef.current = audioUrl;
    setHasReplayAudio(true);
    await playReplyAudio(audioUrl, payload.reply);
  };

  const requestReply = async (input: { audio?: Blob; prompt?: string }) => {
    let response: Response;

    if (input.audio) {
      const extension = input.audio.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([input.audio], `radish-question.${extension}`, {
        type: input.audio.type || "audio/webm"
      });
      const formData = new FormData();
      formData.append("audio", file);

      response = await fetch("/api/radish", {
        method: "POST",
        body: formData,
        signal: requestAbortRef.current?.signal
      });
    } else {
      response = await fetch("/api/radish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input.prompt }),
        signal: requestAbortRef.current?.signal
      });
    }

    const payload = (await response.json()) as Partial<RadishReplyPayload> & {
      error?: string;
    };

    if (
      !response.ok ||
      !payload.reply ||
      !payload.transcript ||
      !payload.language
    ) {
      throw new Error(payload.error || "The radish could not answer just now.");
    }

    return payload as RadishReplyPayload;
  };

  const submitTurn = async (input: { audio?: Blob; prompt?: string }) => {
    const transcript = input.prompt?.trim() || "";
    requestAbortRef.current?.abort();
    requestAbortRef.current = new AbortController();
    clearProgressTimers();
    stopPlayback();
    clearReplayAudio();

    setStatus({
      error: "",
      playbackHint: "",
      reply: "",
      transcript
    });
    setCaptionProgress(0);
    setState((current) =>
      transitionRadishState(
        current,
        current === "listening" ? "stop-listening" : "start-thinking"
      )
    );

    try {
      const payload = await requestReply(input);
      requestAbortRef.current = null;
      setStatus({
        error: "",
        playbackHint: "",
        reply: payload.reply,
        transcript: payload.transcript
      });
      await speakReply(payload);
    } catch (error) {
      requestAbortRef.current = null;
      setStatus((current) => ({
        ...current,
        error:
          error instanceof DOMException && error.name === "AbortError"
            ? ""
            : error instanceof Error
              ? error.message
              : "The radish got flustered while thinking."
      }));
      resetToIdle();
    }
  };

  const startListening = async () => {
    if (state !== "idle") {
      return;
    }

    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setStatus((current) => ({
        ...current,
        error: "This browser does not support microphone recording."
      }));
      return;
    }

    const mimeType = getMimeType();
    if (!mimeType) {
      setStatus((current) => ({
        ...current,
        error: "This browser cannot record in a supported audio format."
      }));
      return;
    }

    try {
      stopPlayback();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audio = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;

        if (audio.size === 0) {
          resetToIdle();
          return;
        }

        await submitTurn({ audio });
      };

      setStatus((current) => ({
        ...current,
        error: "",
        playbackHint: "",
        transcript: "",
        reply: ""
      }));
      setCaptionProgress(0);
      setState((current) => transitionRadishState(current, "start-listening"));
      recorder.start();
    } catch {
      setStatus((current) => ({
        ...current,
        error: "Microphone access is needed to hear your radish question."
      }));
      resetToIdle();
    }
  };

  const stopListening = () => {
    if (state !== "listening") {
      return;
    }

    recorderRef.current?.stop();
  };

  const handleRecorderClick = async () => {
    if (state === "idle") {
      await startListening();
      return;
    }

    if (state === "listening") {
      stopListening();
    }
  };

  const handleTextSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const prompt = textPrompt.trim();

    if (!prompt || state !== "idle") {
      return;
    }

    setTextPrompt("");
    await submitTurn({ prompt });
  };

  const handleTextKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleTextSubmit();
    }
  };

  const handleReplay = async () => {
    if (!audioUrlRef.current || !status.reply) {
      return;
    }

    await playReplyAudio(audioUrlRef.current, status.reply);
  };

  const stateSummary =
    state === "listening"
      ? "Voice mode is live. Ask your question, then tap again to send."
      : state === "thinking"
        ? "Radley is thinking up an answer."
        : state === "speaking"
          ? "Radley is answering now."
          : mode === "voice"
            ? "You can speak now."
            : "You can type now.";

  const stateBadge =
    state === "listening"
      ? "Listening"
      : state === "thinking"
        ? "Thinking"
        : state === "speaking"
          ? "Speaking"
          : mode === "voice"
            ? "Voice mode"
            : "Text mode";

  const voiceButtonLabel =
    state === "listening" ? "Send voice question" : "Start talking";
  const voiceButtonHint =
    state === "listening"
      ? "Tap when you finish speaking"
      : state === "thinking"
        ? "Radley is thinking"
        : state === "speaking"
          ? "Radley is answering"
          : "Tap once to record";

  const interfaceBusy = state === "thinking" || state === "speaking";

  return (
    <main className="app-shell">
      <div className="background-bloom bloom-one" aria-hidden="true" />
      <div className="background-bloom bloom-two" aria-hidden="true" />
      <div className="background-bloom bloom-three" aria-hidden="true" />

      <section className="toy-stage" aria-label="Talking Radish">
        <header className="title-ribbon">
          <p className="title-kicker">Radley&apos;s Root Cellar</p>
          <h1 className="title-heading">
            Curious about radishes? Ask Radley - the world&apos;s smartest
            <span> (and friendliest) radish!</span>
          </h1>
        </header>

        <div className="showcase-layout">
          <div className="center-stage">
            <div className="radley-cluster">
              <div className="character-frame">
                <RadishCharacter state={state} />
              </div>
              <div className="shadow" aria-hidden="true" />

              <section className="interaction-console" data-state={state}>
                <div
                  className="console-tabs"
                  role="tablist"
                  aria-label="Choose how to ask Radley"
                >
                  <button
                    type="button"
                    role="tab"
                    className="console-tab"
                    aria-selected={mode === "voice"}
                    data-active={mode === "voice"}
                    onClick={() => setMode("voice")}
                    disabled={state !== "idle"}
                  >
                    Talk
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className="console-tab"
                    aria-selected={mode === "text"}
                    data-active={mode === "text"}
                    onClick={() => setMode("text")}
                    disabled={state !== "idle"}
                  >
                    Type
                  </button>
                </div>

                <div className="console-status" data-tone={state}>
                  <span className="console-status-dot" aria-hidden="true" />
                  <div className="console-status-copy">
                    <strong>{stateBadge}</strong>
                    <span>{status.playbackHint || stateSummary}</span>
                  </div>
                </div>

                <RadishCaption
                  error={status.error}
                  mode={mode}
                  progress={captionProgress}
                  reply={status.reply}
                  state={state}
                  transcript={status.transcript}
                />

                <div className="console-controls">
                  {mode === "voice" ? (
                    <button
                      type="button"
                      className="magic-button"
                      data-mode={state === "listening" ? "active" : "idle"}
                      data-state={state}
                      onClick={handleRecorderClick}
                      disabled={interfaceBusy}
                      aria-label={voiceButtonLabel}
                    >
                      <span className="magic-button-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" className="mic-icon">
                          <path
                            d="M12 4a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V7a3 3 0 0 1 3-3Z"
                            fill="currentColor"
                          />
                          <path
                            d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M8.5 20h7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span className="magic-button-copy">
                        <strong>{voiceButtonLabel}</strong>
                        <small>{voiceButtonHint}</small>
                      </span>
                    </button>
                  ) : (
                    <form className="text-form" onSubmit={handleTextSubmit}>
                      <label className="sr-only" htmlFor="radley-question">
                        Type your question for Radley
                      </label>
                      <textarea
                        id="radley-question"
                        className="text-input"
                        rows={3}
                        value={textPrompt}
                        onChange={(event) => setTextPrompt(event.target.value)}
                        onKeyDown={handleTextKeyDown}
                        placeholder="How often should I water radishes?"
                        disabled={interfaceBusy}
                      />
                      <div className="text-form-footer">
                        <span>Press Enter to send. Use Shift + Enter for a new line.</span>
                        <button
                          type="submit"
                          className="console-send"
                          disabled={interfaceBusy || !textPrompt.trim()}
                        >
                          Send question
                        </button>
                      </div>
                    </form>
                  )}

                  {hasReplayAudio && status.reply ? (
                    <button
                      type="button"
                      className="console-secondary"
                      onClick={handleReplay}
                      disabled={state === "listening" || state === "thinking"}
                    >
                      Replay voice
                    </button>
                  ) : null}
                </div>
              </section>
            </div>
          </div>

          <GardenShowcase
            side="left"
            video={SHOWCASE_VIDEOS[0]}
            onOpen={setSelectedVideo}
          />

          <GardenShowcase
            side="right"
            video={SHOWCASE_VIDEOS[1]}
            onOpen={setSelectedVideo}
          />
        </div>

        <audio ref={audioRef} className="sr-only" playsInline preload="auto" />

        <p className="sr-only" aria-live="polite">
          {status.error ||
            status.playbackHint ||
            status.reply ||
            status.transcript ||
            getStatusLabel(state)}
        </p>
      </section>

      {selectedVideo ? (
        <div
          className="video-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="video-modal"
            role="dialog"
            aria-modal="true"
            aria-label={selectedVideo.title}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="video-modal-close"
              onClick={() => setSelectedVideo(null)}
              aria-label="Close video"
            >
              ×
            </button>
            <p className="video-modal-kicker">{selectedVideo.title}</p>
            <p className="video-modal-copy">{selectedVideo.description}</p>
            <video
              className="video-modal-player"
              src={selectedVideo.src}
              poster={selectedVideo.poster}
              controls
              autoPlay
              playsInline
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
