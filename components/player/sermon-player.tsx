"use client";

import { ExternalLink, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/client/cn";
import { formatTimestamp } from "@/lib/time/timestamps";
import { usePlayer, type PlayerAdapter } from "./player-context";

/* Minimal typings for the YouTube IFrame Player API (https://developers.google.com/youtube/iframe_api_reference). */
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error("YouTube player failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const YT_ERRORS: Record<number, string> = {
  2: "This video link isn't valid.",
  5: "This video can't be played in the browser.",
  100: "This video was removed or is private.",
  101: "The video's owner doesn't allow it to be played in other apps.",
  150: "The video's owner doesn't allow it to be played in other apps.",
};

function YouTubeFrame({ videoId, startSeconds }: { videoId: string; startSeconds?: number | null }) {
  const player = usePlayer();
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const setState = player?.setState;
  const register = player?.register;

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !host.current) return;
        const target = document.createElement("div");
        host.current.replaceChildren(target);
        yt.current = new YT.Player(target, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, ...(startSeconds ? { start: Math.floor(startSeconds) } : {}) },
          events: {
            onReady: () => {
              const adapter: PlayerAdapter = {
                seek: (s, play) => {
                  yt.current?.seekTo(s, true);
                  if (play) yt.current?.playVideo();
                },
                currentTime: () => yt.current?.getCurrentTime() ?? null,
                toggle: () => (yt.current?.getPlayerState() === 1 ? yt.current.pauseVideo() : yt.current?.playVideo()),
              };
              register?.(adapter);
              setState?.({ ready: true, duration: yt.current?.getDuration() || null });
            },
            onStateChange: (e) => setState?.({ playing: e.data === 1 }),
            onError: (e) => setState?.({ unplayable: YT_ERRORS[e.data] ?? "This video can't be played here." }),
          },
        });
      })
      .catch(() => setState?.({ unplayable: "The YouTube player couldn't load. Check your connection." }));
    return () => {
      cancelled = true;
      register?.(null);
      yt.current?.destroy();
      yt.current = null;
    };
  }, [videoId, startSeconds, register, setState]);

  return <div ref={host} className="size-full [&>iframe]:size-full" />;
}

function FileMedia({ sourceId, kind }: { sourceId: string; kind: "video" | "audio" }) {
  const player = usePlayer();
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const setState = player?.setState;
  const register = player?.register;

  useEffect(() => {
    let active = true;
    fetch(`/api/media/${sourceId}/url`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { url: string }) => active && setUrl(b.url))
      .catch(() => setState?.({ unplayable: "The recording couldn't be loaded." }));
    return () => {
      active = false;
    };
  }, [sourceId, setState]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;
    const adapter: PlayerAdapter = {
      seek: (s, play) => {
        el.currentTime = s;
        if (play) void el.play().catch(() => {});
      },
      currentTime: () => el.currentTime,
      toggle: () => (el.paused ? void el.play().catch(() => {}) : el.pause()),
    };
    const onMeta = () => {
      register?.(adapter);
      setState?.({ ready: true, duration: Number.isFinite(el.duration) ? el.duration : null });
    };
    const onPlay = () => setState?.({ playing: true });
    const onPause = () => setState?.({ playing: false });
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      register?.(null);
    };
  }, [url, register, setState]);

  if (!url) return <div className="skeleton size-full" />;
  return kind === "video" ? (
    <video ref={ref} src={url} controls playsInline preload="metadata" className="size-full bg-black" />
  ) : (
    <div className="flex size-full items-center bg-paper-sunk px-3">
      <audio ref={ref} src={url} controls preload="metadata" className="w-full" />
    </div>
  );
}

export interface SermonMedia {
  kind: "youtube" | "video" | "audio";
  videoId?: string;
  sourceId: string;
  title: string | null;
  thumbnailUrl: string | null;
  startSeconds?: number | null;
}

function MiniTime() {
  const player = usePlayer();
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    if (!player?.ready) return;
    const id = window.setInterval(() => setT(player.currentTime()), 1000);
    return () => window.clearInterval(id);
  }, [player]);
  return <span className="font-mono text-xs tabular text-ink-muted">{t !== null ? formatTimestamp(t) : "--:--"}</span>;
}

/**
 * The notebook's player dock. On phones it collapses to a slim bar (the embed keeps its state);
 * tapping any timestamp expands it and seeks. On wide screens it sits in the side rail.
 */
export function SermonPlayer({ media, className }: { media: SermonMedia; className?: string }) {
  const player = usePlayer();
  const titleId = useId();
  const expanded = player?.expanded ?? false;
  const aspect = media.kind === "audio" ? "h-16" : "aspect-video";

  return (
    <section id="sermon-player" aria-labelledby={titleId} className={cn("overflow-hidden rounded-[14px] border border-rule bg-paper-raised", className)}>
      <h2 id={titleId} className="sr-only">
        Sermon recording
      </h2>
      <div className={cn("relative w-full bg-black", aspect, !expanded && "max-lg:hidden")}>
        {player?.unplayable ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper-sunk p-4 text-center text-sm text-ink-muted">
            <p>{player.unplayable}</p>
            {media.kind === "youtube" ? (
              <a
                href={`https://www.youtube.com/watch?v=${media.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-pen underline"
              >
                Open on YouTube <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : media.kind === "youtube" && media.videoId ? (
          <YouTubeFrame videoId={media.videoId} startSeconds={media.startSeconds} />
        ) : (
          <FileMedia sourceId={media.sourceId} kind={media.kind === "audio" ? "audio" : "video"} />
        )}
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => {
            if (!expanded) player?.setExpanded(true);
            if (player?.ready) player.toggle();
          }}
          className="inline-flex size-10 items-center justify-center rounded-[9px] text-ink hover:bg-paper-sunk"
          aria-label={player?.playing ? "Pause sermon" : "Play sermon"}
        >
          {player?.playing ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{media.title || "Sermon recording"}</p>
          <MiniTime />
        </div>
        <button
          type="button"
          onClick={() => player?.setExpanded(!expanded)}
          className="inline-flex size-10 items-center justify-center rounded-[9px] text-ink-muted hover:bg-paper-sunk hover:text-ink lg:hidden"
          aria-label={expanded ? "Collapse player" : "Expand player"}
          aria-expanded={expanded}
        >
          {expanded ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
