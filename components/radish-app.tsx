"use client";

import { useEffect, useRef, useState } from "react";
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
  const [active, setActive] = useState(false);
  const [state, setState] = useState<RadishState>("idle");
  const [status, setStatus] = useState<SpeechStatus>({
    transcript: "",
    reply: "",
    error: ""
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const frameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const enabledRef = useRef(false);
  const shouldSendRecordingRef = useRef(false);
  const speechDetectedRef = useRef(false);
  const startingRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);
  const [captionProgress, setCaptionProgress] = useState(0);

  useEffect(() => {
    enabledRef.current = active;
  }, [active]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      requestAbortRef.current?.abort();
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      playbackSourceRef.current?.stop();
      streamSourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      void audioContextRef.current?.close();
      void playbackContextRef.current?.close();
    };
  }, []);

  const cleanupListeningNodes = () => {
    streamSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamSourceRef.current = null;
    analyserRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const resetToIdle = () => {
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

    window.setTimeout(() => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
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
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      resetToIdle();
    };

    setState((current) => transitionRadishState(current, "start-speaking"));
    const startedAt = performance.now();
    trackAudioProgress(decoded.duration, startedAt);
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

  startListeningRef.current = async () => {
    if (startingRef.current || !enabledRef.current) {
      return;
    }

    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setStatus((current) => ({
        ...current,
        error: "This browser does not support microphone recording."
      }));
      setActive(false);
      return;
    }

    const mimeType = getMimeType();
    if (!mimeType) {
      setStatus((current) => ({
        ...current,
        error: "This browser cannot record in a supported audio format."
      }));
      setActive(false);
      return;
    }

    try {
      startingRef.current = true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      const data = new Uint8Array(analyser.fftSize);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      streamSourceRef.current = source;
      shouldSendRecordingRef.current = false;
      speechDetectedRef.current = false;

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);

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
        cleanupListeningNodes();
        startingRef.current = false;

        if (audio.size === 0 || !shouldSendRecordingRef.current) {
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

      setStatus({ transcript: "", reply: "", error: "" });
      setState((current) => transitionRadishState(current, "start-listening"));
      setCaptionProgress(0);
      recorder.start();
      startingRef.current = false;

      const startedAt = performance.now();
      let lastSpokeAt = startedAt;

      const watchForSpeech = () => {
        const liveRecorder = recorderRef.current;

        if (!liveRecorder || liveRecorder.state !== "recording") {
          return;
        }

        analyser.getByteTimeDomainData(data);

        let total = 0;
        for (const value of data) {
          const normalized = (value - 128) / 128;
          total += normalized * normalized;
        }

        const level = Math.sqrt(total / data.length);
        const now = performance.now();

        if (level > 0.045) {
          speechDetectedRef.current = true;
          shouldSendRecordingRef.current = true;
          lastSpokeAt = now;
        }

        const noSpeechTimeout = now - startedAt > 5500 && !speechDetectedRef.current;
        const finishedThought = speechDetectedRef.current && now - lastSpokeAt > 950;

        if (noSpeechTimeout || finishedThought) {
          liveRecorder.stop();
          return;
        }

        frameRef.current = window.requestAnimationFrame(watchForSpeech);
      };

      frameRef.current = window.requestAnimationFrame(watchForSpeech);
    } catch {
      startingRef.current = false;
      setStatus((current) => ({
        ...current,
        error: "Microphone access is needed to hear your radish question."
      }));
      setActive(false);
      resetToIdle();
    }
  };

  useEffect(() => {
    if (!active || state !== "idle" || startingRef.current) {
      return;
    }

    void startListeningRef.current();
  }, [active, state]);

  const stopListening = () => {
    shouldSendRecordingRef.current = false;
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
    }
    recorderRef.current?.stop();
  };

  const handleToggle = () => {
    const next = !active;
    setActive(next);

    if (!next) {
      requestAbortRef.current?.abort();
      playbackSourceRef.current?.stop();
      playbackSourceRef.current = null;
      if (state === "listening") {
        stopListening();
      } else {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        cleanupListeningNodes();
      }
      resetToIdle();
      return;
    }

    void ensurePlaybackContext();
  };

  const buttonLabel = active ? "Pause Radley" : "Talk to Radley";
  const buttonHint =
    state === "listening"
      ? "Listening for your question"
      : state === "thinking"
        ? "Thinking up an answer"
        : state === "speaking"
          ? "Speaking out loud"
          : active
            ? "Ready for the next question"
            : "One tap starts a full chat";

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

        <div className="character-frame">
          <RadishCharacter state={state} />
        </div>
        <div className="shadow" aria-hidden="true" />

        <RadishCaption
          active={active}
          error={status.error}
          progress={captionProgress}
          reply={status.reply}
          state={state}
          transcript={status.transcript}
        />

        <button
          type="button"
          className="magic-button"
          data-mode={active ? "active" : "idle"}
          data-state={state}
          onClick={handleToggle}
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

        <p className="sr-only" aria-live="polite">
          {status.error || status.reply || status.transcript || getStatusLabel(state)}
        </p>
      </section>
    </main>
  );
}
