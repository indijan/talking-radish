"use client";

import { useEffect, useRef, useState } from "react";
import { GardenShowcase, type GardenVideo } from "@/components/garden-showcase";
import { RadishCaption } from "@/components/radish-caption";
import { RadishCharacter } from "@/components/radish-character";
import {
  type RadishReplyPayload,
  type RadishState,
  transitionRadishState
} from "@/lib/radish";

type SpeechStatus = {
  transcript: string;
  reply: string;
  error: string;
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

export function RadishApp() {
  const [state, setState] = useState<RadishState>("idle");
  const [status, setStatus] = useState<SpeechStatus>({
    transcript: "",
    reply: "",
    error: ""
  });
  const [selectedVideo, setSelectedVideo] = useState<GardenVideo | null>(null);
  const [captionProgress, setCaptionProgress] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldSendRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const frameRef = useRef<number>(0);
  const silentTimerRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      requestAbortRef.current?.abort();
      playbackSourceRef.current?.stop();
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (silentTimerRef.current) {
        window.clearTimeout(silentTimerRef.current);
      }
      void playbackContextRef.current?.close();
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

  const resetToIdle = () => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
    }
    if (silentTimerRef.current) {
      window.clearTimeout(silentTimerRef.current);
      silentTimerRef.current = 0;
    }
    setCaptionProgress(0);
    setState((current) => transitionRadishState(current, "reset"));
  };

  const ensurePlaybackContext = async () => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext();
    }

    if (playbackContextRef.current.state === "suspended") {
      await playbackContextRef.current.resume();
    }

    return playbackContextRef.current;
  };

  const trackAudioProgress = (duration: number, startedAt: number) => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
    }

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

  const decodeBase64Audio = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
  };

  const performSilentReply = (reply: string) => {
    const duration = Math.min(5.2, Math.max(2.2, reply.length * 0.045));
    const startedAt = performance.now();

    setState((current) => transitionRadishState(current, "start-speaking"));
    trackAudioProgress(duration, startedAt);

    silentTimerRef.current = window.setTimeout(() => {
      setCaptionProgress(1);
      resetToIdle();
    }, duration * 1000);
  };

  const speakReply = async (payload: RadishReplyPayload) => {
    if (!payload.audio?.base64) {
      performSilentReply(payload.reply);
      return;
    }

    const playbackContext = await ensurePlaybackContext();
    const decoded = await playbackContext.decodeAudioData(
      decodeBase64Audio(payload.audio.base64)
    );

    playbackSourceRef.current?.stop();

    const source = playbackContext.createBufferSource();
    source.buffer = decoded;
    source.connect(playbackContext.destination);
    playbackSourceRef.current = source;

    source.onended = () => {
      playbackSourceRef.current = null;
      setCaptionProgress(1);
      resetToIdle();
    };

    setState((current) => transitionRadishState(current, "start-speaking"));
    trackAudioProgress(decoded.duration, performance.now());
    source.start(0);
  };

  const sendRecording = async (audio: Blob) => {
    const extension = audio.type.includes("mp4") ? "m4a" : "webm";
    const file = new File([audio], `radish-question.${extension}`, {
      type: audio.type || "audio/webm"
    });
    const formData = new FormData();
    formData.append("audio", file);

    setState((current) => transitionRadishState(current, "stop-listening"));

    const controller = new AbortController();
    requestAbortRef.current = controller;

    const response = await fetch("/api/radish", {
      method: "POST",
      body: formData,
      signal: controller.signal
    });

    requestAbortRef.current = null;

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

    setStatus({
      transcript: payload.transcript,
      reply: payload.reply,
      error: ""
    });

    await speakReply(payload as RadishReplyPayload);
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
      await ensurePlaybackContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      shouldSendRef.current = true;

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

        if (!shouldSendRef.current || audio.size === 0) {
          resetToIdle();
          return;
        }

        try {
          await sendRecording(audio);
        } catch (error) {
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

      setStatus((current) => ({
        ...current,
        transcript: "",
        error: ""
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

  const buttonLabel = state === "listening" ? "Stop and ask" : "Ask Radley";
  const buttonHint =
    state === "listening"
      ? "Tap again when you finish your question"
      : state === "thinking"
        ? "Radley is thinking"
        : state === "speaking"
          ? "Radley is answering"
          : "Tap once to record, tap again to send";

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
          <GardenShowcase
            side="left"
            video={SHOWCASE_VIDEOS[0]}
            onOpen={setSelectedVideo}
          />

          <div className="center-stage">
            <div className="character-frame">
              <RadishCharacter state={state} />
            </div>
            <div className="shadow" aria-hidden="true" />

            <RadishCaption
              error={status.error}
              progress={captionProgress}
              reply={status.reply}
              state={state}
              transcript={status.transcript}
            />

            <button
              type="button"
              className="magic-button"
              data-mode={state === "listening" ? "active" : "idle"}
              data-state={state}
              onClick={handleRecorderClick}
              disabled={state === "thinking" || state === "speaking"}
              aria-label={buttonLabel}
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
                <strong>{buttonLabel}</strong>
                <small>{buttonHint}</small>
              </span>
            </button>
          </div>

          <GardenShowcase
            side="right"
            video={SHOWCASE_VIDEOS[1]}
            onOpen={setSelectedVideo}
          />
        </div>

        <p className="sr-only" aria-live="polite">
          {status.error || status.reply || status.transcript || getStatusLabel(state)}
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
