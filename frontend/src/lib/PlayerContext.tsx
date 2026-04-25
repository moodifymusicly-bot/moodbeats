import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Song, RecommendedSong } from "./types";
import { api } from "./api";
import YouTubePlayer from "@/components/YouTubePlayer";

interface PlayerState {
  currentTrack: Song | null;
  isPlaying: boolean;
  progress: number; // in seconds
  detectedMood: string | null;
  playTrack: (track: Song, contextMood?: string) => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setDetectedMood: (mood: string) => void;
  nextTrack: () => void;
  prevTrack: () => void;
}

const PlayerContext = createContext<PlayerState | undefined>(undefined);

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const [currentTrack, setCurrentTrack] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detectedMood, setDetectedMood] = useState<string | null>(null);

  const playTrack = (track: Song, contextMood?: string) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
    if (contextMood) {
      setDetectedMood(contextMood);
    }
    
    // Log interaction
    api.interactWithSong({
      song_id: track.id,
      interaction_type: 'play',
      context_mood: contextMood || detectedMood || undefined,
    }).catch(e => console.warn('Failed to log play interaction', e));
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
    if (currentTrack) {
      api.interactWithSong({
        song_id: currentTrack.id,
        interaction_type: 'skip',
        context_mood: detectedMood || undefined,
      }).catch(e => console.warn('Failed to log skip interaction', e));
    }
    setProgress(0);
    setIsPlaying(true);
  };

  const prevTrack = () => {
    setProgress(0);
    setIsPlaying(true);
  };

  // Resolve YouTube ID from RecommendedSong if available, else fallback to song id
  const youtubeId = currentTrack ? ((currentTrack as RecommendedSong).youtube_id || currentTrack.id) : "";

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
      {youtubeId && (
        <YouTubePlayer
          videoId={youtubeId}
          isPlaying={isPlaying}
          muted={false}
          onStateChange={(state) => {
            if (state === 'ended') {
              setIsPlaying(false);
              nextTrack();
            } else if (state === 'paused') {
              setIsPlaying(false);
            } else if (state === 'playing') {
              setIsPlaying(true);
            }
          }}
          onProgress={(current) => setProgress(current)}
          onReady={() => console.log('YouTube Player Ready')}
          className="hidden"
        />
      )}
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
