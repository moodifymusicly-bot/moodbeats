'use client';

import { useEffect, useRef, useState } from 'react';

interface YouTubePlayerProps {
    videoId: string;
    isPlaying: boolean;
    onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
    onProgress: (current: number, duration: number) => void;
    onReady: () => void;
    width?: string | number;
    height?: string | number;
    className?: string;
}

declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}

let apiLoaded = false;
let apiLoading = false;
const readyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(): Promise<void> {
    return new Promise((resolve) => {
        if (apiLoaded && window.YT && window.YT.Player) {
            resolve();
            return;
        }

        readyCallbacks.push(resolve);

        if (apiLoading) return;
        apiLoading = true;

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
            apiLoaded = true;
            readyCallbacks.forEach(cb => cb());
            readyCallbacks.length = 0;
        };
    });
}

export default function YouTubePlayer({
    videoId,
    isPlaying,
    onStateChange,
    onProgress,
    onReady,
    width = '100%',
    height = '100%',
    className = 'hidden',
}: YouTubePlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const progressRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize YouTube player
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            await loadYouTubeAPI();
            if (!mounted || !containerRef.current) return;

            // Create a unique ID
            const playerId = `yt-player-${Date.now()}`;
            const div = document.createElement('div');
            div.id = playerId;
            containerRef.current.innerHTML = '';
            containerRef.current.appendChild(div);

            playerRef.current = new window.YT.Player(playerId, {
                height: height.toString(),
                width: width.toString(),
                videoId: videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    disablekb: 1,
                    fs: 0,
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    origin: window.location.origin,
                },
                events: {
                    onReady: (event: any) => {
                        onReady();
                        if (isPlaying) {
                            event.target.playVideo();
                        }
                        startProgressTracking();
                    },
                    onStateChange: (event: any) => {
                        const state = event.data;
                        if (state === window.YT.PlayerState.PLAYING) {
                            onStateChange('playing');
                            startProgressTracking();
                        } else if (state === window.YT.PlayerState.PAUSED) {
                            onStateChange('paused');
                            stopProgressTracking();
                        } else if (state === window.YT.PlayerState.ENDED) {
                            onStateChange('ended');
                            stopProgressTracking();
                        }
                    },
                },
            });
        };

        init();

        return () => {
            mounted = false;
            stopProgressTracking();
            if (playerRef.current && playerRef.current.destroy) {
                try {
                    playerRef.current.destroy();
                } catch { }
            }
            playerRef.current = null;
        };
    }, [videoId]);

    // Handle play/pause changes
    useEffect(() => {
        if (!playerRef.current) return;

        try {
            if (isPlaying) {
                playerRef.current.playVideo?.();
            } else {
                playerRef.current.pauseVideo?.();
            }
        } catch { }
    }, [isPlaying]);

    const startProgressTracking = () => {
        stopProgressTracking();
        progressRef.current = setInterval(() => {
            if (playerRef.current && playerRef.current.getCurrentTime && playerRef.current.getDuration) {
                try {
                    const current = playerRef.current.getCurrentTime();
                    const duration = playerRef.current.getDuration();
                    if (duration > 0) {
                        onProgress(current, duration);
                    }
                } catch { }
            }
        }, 500);
    };

    const stopProgressTracking = () => {
        if (progressRef.current) {
            clearInterval(progressRef.current);
            progressRef.current = null;
        }
    };

    return (
        <div ref={containerRef} className={className} aria-hidden={className.includes('hidden') ? 'true' : 'false'} />
    );
}

// Utility to search YouTube for a video ID
export function getYouTubeSearchUrl(title: string, artist: string): string {
    const query = encodeURIComponent(`${title} ${artist} official audio`);
    return `https://www.youtube.com/results?search_query=${query}`;
}
