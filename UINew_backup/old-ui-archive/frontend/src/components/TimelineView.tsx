'use client';

import { motion } from 'framer-motion';
import MoodTimeline, { MoodTimelineEntry } from '@/components/MoodTimeline';
import { MOOD_CONFIG, MoodType } from '@/lib/types';

interface TimelineViewProps {
    moodHistory: MoodTimelineEntry[];
    moodColor: string;
}

export default function TimelineView({ moodHistory, moodColor }: TimelineViewProps) {
    const total = moodHistory.length;

    const moodCounts: Partial<Record<MoodType, number>> = {};
    moodHistory.forEach(e => {
        moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
    });

    const moodDistribution = (Object.entries(moodCounts) as [MoodType, number][])
        .map(([mood, count]) => ({
            mood,
            count,
            percent: total > 0 ? Math.round((count / total) * 100) : 0,
            config: MOOD_CONFIG[mood],
        }))
        .sort((a, b) => b.count - a.count);

    const dominantMood = moodDistribution[0]?.mood ?? null;

    const recentLog = [...moodHistory]
        .filter(e => new Date(e.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const cameraCount = moodHistory.filter(e => e.source === 'camera').length;
    const manualCount = moodHistory.filter(e => e.source === 'manual' || !e.source).length;
    const cameraRatio = total > 0 ? Math.round((cameraCount / total) * 100) : 0;

    const confidences = moodHistory.filter(e => typeof e.confidence === 'number').map(e => e.confidence!);
    const avgConfidence = confidences.length > 0
        ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
        : 0;

    let songsPlayed = 0;
    try {
        const log = JSON.parse(localStorage.getItem('songs_played_log') || '[]');
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        songsPlayed = log.filter((e: { timestamp: string }) => new Date(e.timestamp).getTime() > cutoff).length;
    } catch {}

    const statCards = [
        {
            value: total.toString(),
            label: 'Detections',
            sub: 'total sessions',
            accent: moodColor,
            isEmoji: false,
        },
        {
            value: dominantMood ? MOOD_CONFIG[dominantMood].emoji : '—',
            label: dominantMood ? MOOD_CONFIG[dominantMood].label : 'None',
            sub: 'dominant mood',
            accent: dominantMood ? MOOD_CONFIG[dominantMood].color : moodColor,
            isEmoji: true,
        },
        {
            value: moodDistribution.length.toString(),
            label: 'Mood Types',
            sub: 'variety detected',
            accent: '#06b6d4',
            isEmoji: false,
        },
        {
            value: songsPlayed.toString(),
            label: 'Songs Played',
            sub: 'last 24 hours',
            accent: '#a855f7',
            isEmoji: false,
        },
        {
            value: `${cameraRatio}%`,
            label: 'Camera',
            sub: `${cameraCount} cam / ${manualCount} manual`,
            accent: '#22d3ee',
            isEmoji: false,
        },
        {
            value: `${avgConfidence}%`,
            label: 'Avg Confidence',
            sub: `across ${confidences.length} scans`,
            accent: '#f59e0b',
            isEmoji: false,
        },
    ];

    return (
        <div className="flex-1 overflow-y-auto pb-24 px-5 sm:px-8 lg:px-12 xl:px-16">

            {/* ── Section: Stat Cards ── */}
            <div className="grid grid-cols-3 gap-2.5 mt-4">
                {statCards.map((card, i) => (
                    <motion.div
                        key={card.label}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="rounded-2xl p-4 text-center relative overflow-hidden"
                        style={{
                            background: `${card.accent}08`,
                            border: `1px solid ${card.accent}18`,
                        }}
                    >
                        {/* Top edge glow */}
                        <div
                            className="absolute inset-x-0 top-0 h-px"
                            style={{ background: `linear-gradient(90deg, transparent, ${card.accent}40, transparent)` }}
                        />
                        <p className={`font-black font-display text-white leading-none ${card.isEmoji ? 'text-2xl' : 'text-2xl sm:text-3xl'}`}>
                            {card.value}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-wider mt-1.5" style={{ color: card.accent }}>
                            {card.label}
                        </p>
                        <p className="text-[8px] tracking-wide uppercase text-white/20 mt-0.5 font-medium">
                            {card.sub}
                        </p>
                    </motion.div>
                ))}
            </div>

            {/* ── Section: Mood Distribution ── */}
            {moodDistribution.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-4 rounded-2xl p-5 relative overflow-hidden"
                    style={{
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    {/* Section highlight */}
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-4 rounded-full" style={{ backgroundColor: moodColor }} />
                            <p className="text-[10px] tracking-[0.3em] uppercase text-white/50 font-bold">
                                Mood Breakdown
                            </p>
                        </div>
                        <span className="text-[9px] text-white/20 font-mono tabular-nums">{total} total</span>
                    </div>

                    <div className="space-y-4">
                        {moodDistribution.map((item, i) => (
                            <motion.div
                                key={item.mood}
                                initial={{ opacity: 0, x: -14 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.28 + i * 0.07, duration: 0.45 }}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base leading-none">{item.config.emoji}</span>
                                        <span className="text-xs font-bold uppercase tracking-wide text-white/65">
                                            {item.config.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-[9px] text-white/25 font-mono tabular-nums">
                                            {item.count}×
                                        </span>
                                        <span
                                            className="text-[10px] font-black tabular-nums w-8 text-right"
                                            style={{ color: item.config.color }}
                                        >
                                            {item.percent}%
                                        </span>
                                    </div>
                                </div>
                                {/* Bar track */}
                                <div
                                    className="h-1.5 rounded-full overflow-hidden"
                                    style={{ background: `${item.config.color}10` }}
                                >
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{ backgroundColor: item.config.color }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${item.percent}%` }}
                                        transition={{
                                            delay: 0.35 + i * 0.07,
                                            duration: 0.65,
                                            ease: [0.16, 1, 0.3, 1],
                                        }}
                                    />
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── Section: 24h Timeline Bar ── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.38, duration: 0.5 }}
            >
                <MoodTimeline entries={moodHistory} moodColor={moodColor} />
            </motion.div>

            {/* ── Section: Detection Log ── */}
            <div className="mt-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-4 rounded-full bg-white/20" />
                        <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 font-bold">
                            Detection Log
                        </p>
                    </div>
                    <span className="text-[9px] tracking-wider text-white/20 font-mono">Last 24h</span>
                </div>

                {recentLog.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-center py-12 rounded-2xl"
                        style={{
                            background: 'rgba(255,255,255,0.015)',
                            border: '1px solid rgba(255,255,255,0.04)',
                        }}
                    >
                        <div className="text-3xl mb-3 opacity-30">📊</div>
                        <p className="text-sm text-white/25">No moods logged yet</p>
                        <p className="text-xs text-white/15 mt-1">
                            Use Start Detection on the home tab to begin
                        </p>
                    </motion.div>
                ) : (
                    <div className="space-y-2">
                        {recentLog.map((entry, idx) => {
                            const time = new Date(entry.timestamp);
                            const config = MOOD_CONFIG[entry.mood];
                            return (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.035, duration: 0.4 }}
                                    className="flex items-center gap-3 p-3.5 rounded-xl"
                                    style={{
                                        background: `${entry.color}06`,
                                        border: `1px solid ${entry.color}12`,
                                    }}
                                >
                                    {/* Timestamp */}
                                    <div className="flex-shrink-0 text-right w-14">
                                        <p
                                            className="text-[11px] font-mono font-bold leading-none"
                                            style={{ color: entry.color }}
                                        >
                                            {time.toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true,
                                            })}
                                        </p>
                                        <p className="text-[8px] text-white/20 font-mono mt-1">
                                            {time.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>

                                    {/* Color rule */}
                                    <div
                                        className="w-[2px] h-9 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: entry.color }}
                                    />

                                    {/* Mood info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-base leading-none">{config?.emoji}</span>
                                            <span
                                                className="text-xs font-black uppercase tracking-wider"
                                                style={{ color: entry.color }}
                                            >
                                                {config?.label}
                                            </span>
                                        </div>
                                        <p className="text-[9px] text-white/20 mt-0.5 truncate">
                                            {config?.description}
                                        </p>
                                    </div>

                                    {/* Glow dot */}
                                    <div
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{
                                            backgroundColor: entry.color,
                                            boxShadow: `0 0 6px ${entry.color}70`,
                                        }}
                                    />
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
