"use client";

export type GardenVideo = {
  description: string;
  poster: string;
  src: string;
  title: string;
};

type GardenShowcaseProps = {
  side: "left" | "right";
  video: GardenVideo;
  onOpen(video: GardenVideo): void;
};

export function GardenShowcase({
  onOpen,
  side,
  video
}: GardenShowcaseProps) {
  return (
    <aside className={`video-rail video-rail-${side}`}>
      <article className="video-card">
        <p className="video-card-kicker">{video.title}</p>
        <p className="video-card-copy">{video.description}</p>
        <button
          type="button"
          className="video-launch"
          onClick={() => onOpen(video)}
          aria-label={`Play ${video.title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={video.poster} alt="" className="video-poster" />
          <span className="video-sheen" aria-hidden="true" />
          <span className="video-play-badge" aria-hidden="true">
            <svg viewBox="0 0 64 64" className="video-play-icon">
              <circle cx="32" cy="32" r="31" fill="currentColor" opacity="0.95" />
              <path d="M26 21L46 32L26 43Z" fill="white" />
            </svg>
          </span>
        </button>
      </article>
    </aside>
  );
}
