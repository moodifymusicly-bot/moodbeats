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
    const progressRef = useRef<NodeJS.Timeout | null>(null);
    const [iframeKey, setIframeKey] = useState(0);

    // Re-key iframe when videoId changes to force reload
    useEffect(() => {
        setIframeKey(k => k + 1);
    }, [videoId]);

    useEffect(() => {
        onReady();
        if (isPlaying) {
            onStateChange('playing');
        } else {
            onStateChange('paused');
        }

        // Fake progress for visual effect since we lost JS API tracking
        if (isPlaying) {
            let fakeTime = 0;
            progressRef.current = setInterval(() => {
                fakeTime += 1;
                onProgress(fakeTime, 240); // Fake 4 min duration
            }, 1000);
        } else {
            if (progressRef.current) clearInterval(progressRef.current);
        }

        return () => {
            if (progressRef.current) clearInterval(progressRef.current);
        };
    }, [isPlaying, videoId]);

    // Construct the URL with autoplay, mute for autoplay policy, and loop
    const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${isPlaying ? 1 : 0}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=0&widgetid=1&mute=0&loop=1&playlist=${videoId}&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`;

    return (
        <div className={`relative ${className}`} aria-hidden={className.includes('hidden') ? 'true' : 'false'}>
            <iframe
                key={iframeKey}
                width={width}
                height={height}
                src={src}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="w-full h-full pointer-events-none"
            ></iframe>
        </div>
    );
}

// Utility to search YouTube for a video ID
export function getYouTubeSearchUrl(title: string, artist: string): string {
    const query = encodeURIComponent(`${title} ${artist} official audio`);
    return `https://www.youtube.com/results?search_query=${query}`;
}
