'use client';

import { useEffect, useRef } from 'react';

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

// Module-level singleton: API is loaded once per page.
let _apiLoaded = false;
let _apiLoading = false;
const _readyCallbacks: Array<() => void> = [];

function loadYouTubeAPI(): Promise<void> {
    return new Promise((resolve) => {
        if (_apiLoaded && window.YT?.Player) {
            resolve();
            return;
        }
        _readyCallbacks.push(resolve);
        if (_apiLoading) return;
        _apiLoading = true;

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);

        window.onYouTubeIframeAPIReady = () => {
            _apiLoaded = true;
            _readyCallbacks.forEach((cb) => cb());
            _readyCallbacks.length = 0;
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
    const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Keep latest callbacks in refs so the YT event closures are never stale.
    const onProgressRef = useRef(onProgress);
    const onStateChangeRef = useRef(onStateChange);
    const onReadyRef = useRef(onReady);
    onProgressRef.current = onProgress;
    onStateChangeRef.current = onStateChange;
    onReadyRef.current = onReady;

    // Keep latest isPlaying in a ref for use inside async init.
    const isPlayingRef = useRef(isPlaying);
    isPlayingRef.current = isPlaying;

    // ── Re-create the YT.Player whenever videoId changes ──────────────────────
    useEffect(() => {
        let cancelled = false;

        const stopProgress = () => {
            if (progressTimerRef.current) {
                clearInterval(progressTimerRef.current);
                progressTimerRef.current = null;
            }
        };

        const destroyPlayer = () => {
            stopProgress();
            if (playerRef.current) {
                try { playerRef.current.destroy(); } catch { /* ignore */ }
                playerRef.current = null;
            }
        };

        const startProgressPolling = () => {
            stopProgress();
            progressTimerRef.current = setInterval(() => {
                if (cancelled || !playerRef.current) return;
                try {
                    const current: number = playerRef.current.getCurrentTime?.() ?? 0;
                    const dur: number = playerRef.current.getDuration?.() ?? 0;
                    if (dur > 0) {
                        onProgressRef.current(Math.floor(current), Math.floor(dur));
                    }
                } catch { /* player not ready yet */ }
            }, 1000);
        };

        const init = async () => {
            await loadYouTubeAPI();
            if (cancelled || !containerRef.current) return;

            destroyPlayer();

            // YT.Player needs a concrete element (not a React ref) to replace.
            const target = document.createElement('div');
            containerRef.current.innerHTML = '';
            containerRef.current.appendChild(target);

            playerRef.current = new window.YT.Player(target, {
                videoId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: isPlayingRef.current ? 1 : 0,
                    controls: 0,
                    modestbranding: 1,
                    rel: 0,
                    playsinline: 1,
                    enablejsapi: 1,
                    origin: window.location.origin,
                },
                events: {
                    onReady: () => {
                        if (cancelled) return;
                        onReadyRef.current();
                        if (isPlayingRef.current) {
                            try { playerRef.current?.playVideo(); } catch { /* ignore */ }
                        }
                        startProgressPolling();
                    },
                    onStateChange: (evt: any) => {
                        if (cancelled) return;
                        const YT = window.YT;
                        if (evt.data === YT.PlayerState.PLAYING) {
                            onStateChangeRef.current('playing');
                        } else if (evt.data === YT.PlayerState.PAUSED) {
                            onStateChangeRef.current('paused');
                        } else if (evt.data === YT.PlayerState.ENDED) {
                            onStateChangeRef.current('ended');
                        }
                    },
                    onError: (evt: any) => {
                        console.warn('[YouTubePlayer] player error:', evt.data);
                    },
                },
            });
        };

        init().catch((err) => console.warn('[YouTubePlayer] init failed:', err));

        return () => {
            cancelled = true;
            destroyPlayer();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]); // Only re-create player on video change; callbacks via refs.

    // ── Sync play / pause without destroying the player ───────────────────────
    useEffect(() => {
        if (!playerRef.current) return;
        try {
            if (isPlaying) {
                playerRef.current.playVideo?.();
            } else {
                playerRef.current.pauseVideo?.();
            }
        } catch { /* player may not be ready */ }
    }, [isPlaying]);

    return (
        <div
            ref={containerRef}
            className={`relative ${className}`}
            style={{ width, height }}
            // Keep aria-hidden when visually hidden so screen readers ignore it.
            aria-hidden={className.includes('hidden') ? 'true' : 'false'}
        />
    );
}

/** Utility: open YouTube search for a track (used in fallback UI). */
export function getYouTubeSearchUrl(title: string, artist: string): string {
    const query = encodeURIComponent(`${title} ${artist} official audio`);
    return `https://www.youtube.com/results?search_query=${query}`;
}
