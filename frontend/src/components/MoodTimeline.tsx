'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MoodType, MOOD_CONFIG } from '@/lib/types';

export interface MoodTimelineEntry {
    mood: MoodType;
    timestamp: string; // ISO string
    color: string;
}

const STORAGE_KEY = 'mood_timeline';
const HOURS_24 = 24 * 60 * 60 * 1000;

function loadTimeline(): MoodTimelineEntry[] {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        const entries: MoodTimelineEntry[] = JSON.parse(data);
        const cutoff = Date.now() - HOURS_24;
        return entries.filter(e => new Date(e.timestamp).getTime() > cutoff);
    } catch {
        return [];
    }
}

function saveTimeline(entries: MoodTimelineEntry[]) {
    if (typeof window === 'undefined') return;
    const cutoff = Date.now() - HOURS_24;
    const filtered = entries.filter(e => new Date(e.timestamp).getTime() > cutoff);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function addMoodEntry(mood: MoodType): MoodTimelineEntry[] {
    const entries = loadTimeline();
    const newEntry: MoodTimelineEntry = {
        mood,
        timestamp: new Date().toISOString(),
        color: MOOD_CONFIG[mood].color,
    };
    entries.push(newEntry);
    saveTimeline(entries);
    return entries;
}

interface MoodTimelineProps {
    entries: MoodTimelineEntry[];
    moodColor: string;
}

export default function MoodTimeline({ entries, moodColor }: MoodTimelineProps) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    // Generate hour markers for the timeline
    const now = new Date();
    const hours: string[] = [];
    for (let i = 23; i >= 0; i--) {
        const h = new Date(now.getTime() - i * 60 * 60 * 1000);
        hours.push(h.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
    }

    // Map entries to positions on the 24-hour timeline (0 = 24h ago, 100 = now)
    const cutoff = now.getTime() - HOURS_24;
    const mappedEntries = entries
        .filter(e => new Date(e.timestamp).getTime() > cutoff)
        .map(e => {
            const ts = new Date(e.timestamp).getTime();
            const position = ((ts - cutoff) / HOURS_24) * 100;
            return { ...e, position: Math.max(0, Math.min(100, position)) };
        });

    if (mappedEntries.length === 0) {
        return (
            <div className="px-5 mt-4">
                <div className="rounded-xl border border-white/5 p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">📊</span>
                        <span className="text-[10px] tracking-[0.25em] uppercase text-white/40 font-bold">
                            Mood Timeline (24h)
                        </span>
                    </div>
                    <p className="text-xs text-white/20 text-center py-3">No moods detected in the last 24 hours</p>
                </div>
            </div>
        );
    }

    return (
        <div className="px-5 mt-4">
            <div className="rounded-xl border border-white/5 p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">📊</span>
                        <span className="text-[10px] tracking-[0.25em] uppercase text-white/40 font-bold">
                            Mood Timeline (24h)
                        </span>
                    </div>
                    <span className="text-[9px] tracking-wider text-white/20 font-mono">
                        {mappedEntries.length} mood{mappedEntries.length !== 1 ? 's' : ''} detected
                    </span>
                </div>

                {/* Timeline bar */}
                <div className="relative h-10 bg-white/5 rounded-lg overflow-hidden">
                    {/* Hour grid lines */}
                    {[0, 6, 12, 18, 24].map(h => (
                        <div
                            key={h}
                            className="absolute top-0 bottom-0 w-px bg-white/10"
                            style={{ left: `${(h / 24) * 100}%` }}
                        />
                    ))}

                    {/* Mood entries as colored segments */}
                    {mappedEntries.map((entry, idx) => {
                        const width = Math.max(2, 100 / Math.max(mappedEntries.length * 2, 24));
                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, scaleY: 0 }}
                                animate={{ opacity: 1, scaleY: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="absolute top-0 bottom-0 cursor-pointer transition-all"
                                style={{
                                    left: `${entry.position}%`,
                                    width: `${width}%`,
                                    backgroundColor: entry.color,
                                    opacity: hoveredIdx === idx ? 1 : 0.7,
                                    transform: hoveredIdx === idx ? 'scaleY(1.1)' : 'scaleY(1)',
                                    borderRadius: '4px',
                                    boxShadow: hoveredIdx === idx ? `0 0 12px ${entry.color}80` : 'none',
                                }}
                                onMouseEnter={() => setHoveredIdx(idx)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                onClick={() => setHoveredIdx(hoveredIdx === idx ? null : idx)}
                            />
                        );
                    })}

                    {/* Tooltip */}
                    {hoveredIdx !== null && mappedEntries[hoveredIdx] && (
                        <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute -top-9 px-2 py-1 rounded-md text-[9px] font-bold tracking-wider uppercase whitespace-nowrap z-50"
                            style={{
                                left: `${mappedEntries[hoveredIdx].position}%`,
                                transform: 'translateX(-50%)',
                                backgroundColor: mappedEntries[hoveredIdx].color,
                                color: '#000',
                                boxShadow: `0 4px 15px ${mappedEntries[hoveredIdx].color}60`,
                            }}
                        >
                            {MOOD_CONFIG[mappedEntries[hoveredIdx].mood]?.emoji}{' '}
                            {MOOD_CONFIG[mappedEntries[hoveredIdx].mood]?.label} •{' '}
                            {new Date(mappedEntries[hoveredIdx].timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true,
                            })}
                        </motion.div>
                    )}
                </div>

                {/* Time axis labels */}
                <div className="flex justify-between mt-1.5">
                    <span className="text-[8px] text-white/20 font-mono">24h ago</span>
                    <span className="text-[8px] text-white/20 font-mono">18h</span>
                    <span className="text-[8px] text-white/20 font-mono">12h</span>
                    <span className="text-[8px] text-white/20 font-mono">6h</span>
                    <span className="text-[8px] text-white/20 font-mono">Now</span>
                </div>

                {/* Recent moods legend */}
                <div className="flex flex-wrap gap-2 mt-3">
                    {mappedEntries.slice(-5).reverse().map((entry, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-white/10" style={{ backgroundColor: `${entry.color}15` }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-[8px] tracking-wider uppercase text-white/50 font-bold">
                                {MOOD_CONFIG[entry.mood]?.label}
                            </span>
                            <span className="text-[8px] text-white/20 font-mono">
                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
