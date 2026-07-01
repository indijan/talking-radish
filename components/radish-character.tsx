"use client";

import { useEffect, useMemo, useState } from "react";
import type { RadishState } from "@/lib/radish";

type Point = { x: number; y: number };

const LOOK_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: -3, y: 0 },
  { x: 3, y: 0 },
  { x: 0, y: -2 },
  { x: 1, y: 1 }
];

function buildWavePath(amplitude: number, frequency: number, phase: number) {
  const width = 52;
  const startX = 134;
  const baseY = 214;
  const points = 14;

  let path = `M ${startX} ${baseY}`;

  for (let index = 1; index <= points; index += 1) {
    const progress = index / points;
    const x = startX + width * progress;
    const y =
      baseY +
      Math.sin(progress * Math.PI * frequency + phase) * amplitude +
      Math.sin(progress * Math.PI + phase * 0.35) * amplitude * 0.18;

    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  return path;
}

const IDLE_SMILE_PATH = "M 135 214 C 145 224, 175 224, 185 214";

export function RadishCharacter({ state }: { state: RadishState }) {
  const speaking = state === "speaking";
  const [blink, setBlink] = useState(false);
  const [gaze, setGaze] = useState<Point>({ x: 0, y: 0 });
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const scheduleBlink = () => {
      const delay = 2000 + Math.random() * 4000;
      window.setTimeout(() => {
        if (cancelled) return;
        setBlink(true);
        window.setTimeout(() => {
          if (!cancelled) setBlink(false);
          scheduleBlink();
        }, 130);
      }, delay);
    };

    scheduleBlink();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const nudgeEyes = () => {
      const delay = 1600 + Math.random() * 2200;
      window.setTimeout(() => {
        if (cancelled) return;
        setGaze(LOOK_POINTS[Math.floor(Math.random() * LOOK_POINTS.length)]);
        nudgeEyes();
      }, delay);
    };

    nudgeEyes();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!speaking) {
      setPhase(0);
      return;
    }

    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = now - previous;
      previous = now;
      setPhase((value) => value + delta * 0.018);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [speaking]);

  const mouthPath = useMemo(() => {
    return speaking ? buildWavePath(7.5, 4.4, phase) : IDLE_SMILE_PATH;
  }, [phase, speaking]);

  const eyeTransform = `translate(${gaze.x}px ${gaze.y}px)`;

  return (
    <svg
      viewBox="0 0 320 360"
      role="img"
      aria-label={`A cheerful radish in ${state} mode`}
      className="character-svg"
    >
      <g className="float-group">
        <ellipse cx="160" cy="96" rx="52" ry="32" fill="#d3f0c8" opacity="0.35" />
        <g className="leaf-group">
          <path
            d="M154 92C142 65 143 39 156 18C175 34 181 59 172 84Z"
            fill="var(--leaf)"
          />
          <path
            d="M181 92C179 62 190 38 213 20C225 43 221 70 199 89Z"
            fill="var(--leaf-dark)"
          />
          <path
            d="M133 98C121 74 115 49 119 28C142 40 153 69 149 93Z"
            fill="#79bf88"
          />
          <path
            d="M160 103C158 86 161 76 171 64"
            stroke="#7a5941"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>

        <path
          d="M160 112C224 112 266 164 252 226C240 281 204 326 160 326C116 326 80 281 68 226C54 164 96 112 160 112Z"
          fill="url(#radish-body)"
        />
        <path
          d="M104 170C126 150 195 137 230 182"
          stroke="rgba(255,255,255,0.32)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <ellipse cx="112" cy="230" rx="14" ry="9" fill="rgba(255,255,255,0.18)" />
        <ellipse cx="208" cy="230" rx="14" ry="9" fill="rgba(255,255,255,0.18)" />

        <g transform="translate(0 2)">
          {blink ? (
            <g>
              <path
                d="M118 182C126 176 138 176 146 182"
                stroke="#5f3428"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M174 182C182 176 194 176 202 182"
                stroke="#5f3428"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>
          ) : (
            <g className="eye" transform={eyeTransform}>
              <ellipse cx="132" cy="182" rx="15" ry="16" fill="white" />
              <ellipse cx="188" cy="182" rx="15" ry="16" fill="white" />
              <circle cx="132" cy="184" r="5.5" fill="#372012" />
              <circle cx="188" cy="184" r="5.5" fill="#372012" />
              <circle cx="134" cy="181" r="2" fill="white" />
              <circle cx="190" cy="181" r="2" fill="white" />
            </g>
          )}
        </g>

        <path
          d={mouthPath}
          fill="none"
          stroke="#5a1f2e"
          strokeWidth={speaking ? 5 : 4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <ellipse cx="116" cy="216" rx="13" ry="9" fill="rgba(240, 123, 150, 0.26)" />
        <ellipse cx="204" cy="216" rx="13" ry="9" fill="rgba(240, 123, 150, 0.26)" />
      </g>

      <defs>
        <linearGradient id="radish-body" x1="110" y1="112" x2="206" y2="326">
          <stop offset="0%" stopColor="#ffd9e0" />
          <stop offset="28%" stopColor="#ff476c" />
          <stop offset="68%" stopColor="#eb1f4f" />
          <stop offset="100%" stopColor="#b40034" />
        </linearGradient>
      </defs>
    </svg>
  );
}
