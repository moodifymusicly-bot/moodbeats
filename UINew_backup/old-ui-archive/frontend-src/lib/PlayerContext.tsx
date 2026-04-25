import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { Track } from "./mock-data";

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number; // in seconds
  detectedMood: string | null;
  playTrack: (track: Track, contextMood?: string) => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setDetectedMood: (mood: string) => void;
  nextTrack: () => void;
  prevTrack: () => void;
}

const PlayerContext = createContext<PlayerState | undefined>(undefined);

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detectedMood, setDetectedMood] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (currentTrack && prev >= currentTrack.duration) {
            setIsPlaying(false);
            return currentTrack.duration;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentTrack]);

  const playTrack = (track: Track, contextMood?: string) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
    if (contextMood) {
      setDetectedMood(contextMood);
    }
  };

  const togglePlayPause = () => {
    if (currentTrack) {
      setIsPlaying(!isPlaying);
    }
  };

  const seek = (time: number) => {
    setProgress(time);
  };

  const nextTrack = () => {
    // Mock next track behavior: just reset progress for now or you can implement actual queue
    setProgress(0);
    setIsPlaying(true);
  };

  const prevTrack = () => {
    setProgress(0);
    setIsPlaying(true);
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        detectedMood,
        playTrack,
        togglePlayPause,
        seek,
        setDetectedMood,
        nextTrack,
        prevTrack,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
};
