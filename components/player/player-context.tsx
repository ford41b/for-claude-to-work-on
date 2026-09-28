"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * One player per notebook (YouTube embed or uploaded media) behind a small interface, so any
 * timestamp chip anywhere in the notebook can seek it and the note editor can read the time.
 */

export interface PlayerAdapter {
  seek(seconds: number, play: boolean): void;
  currentTime(): number | null;
  toggle(): void;
}

interface PlayerState {
  available: boolean;
  ready: boolean;
  playing: boolean;
  duration: number | null;
  expanded: boolean;
  unplayable: string | null;
}

interface PlayerContextValue extends PlayerState {
  register(adapter: PlayerAdapter | null): void;
  setState(patch: Partial<PlayerState>): void;
  seek(seconds: number, options?: { play?: boolean }): void;
  currentTime(): number | null;
  toggle(): void;
  setExpanded(expanded: boolean): void;
  /** Seek requests made before the player was ready are applied once it is. */
  pendingSeek: React.RefObject<number | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ available, children }: { available: boolean; children: ReactNode }) {
  const adapter = useRef<PlayerAdapter | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const [state, setStateRaw] = useState<PlayerState>({
    available,
    ready: false,
    playing: false,
    duration: null,
    expanded: false,
    unplayable: null,
  });

  const setState = useCallback((patch: Partial<PlayerState>) => setStateRaw((s) => ({ ...s, ...patch })), []);
  const register = useCallback((a: PlayerAdapter | null) => {
    adapter.current = a;
    if (a && pendingSeek.current !== null) {
      a.seek(pendingSeek.current, true);
      pendingSeek.current = null;
    }
  }, []);

  const seek = useCallback(
    (seconds: number, options: { play?: boolean } = {}) => {
      setState({ expanded: true });
      if (adapter.current) adapter.current.seek(seconds, options.play ?? true);
      else pendingSeek.current = seconds;
      document.getElementById("sermon-player")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    [setState],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      ...state,
      register,
      setState,
      seek,
      currentTime: () => adapter.current?.currentTime() ?? null,
      toggle: () => adapter.current?.toggle(),
      setExpanded: (expanded) => setState({ expanded }),
      pendingSeek,
    }),
    [state, register, setState, seek],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue | null {
  return useContext(PlayerContext);
}
