'use client';

import { motion } from 'framer-motion';
import { MoodType, MOOD_CONFIG } from '@/lib/types';

interface MoodSelectorProps {
    onSelect: (mood: MoodType) => void;
}

const moods: MoodType[] = ['happy', 'sad', 'gym', 'study', 'rock'];

export default function MoodSelector({ onSelect }: MoodSelectorProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {moods.map((mood, index) => {
                const config = MOOD_CONFIG[mood];
                return (
                    <motion.button
                        key={mood}
                        onClick={() => onSelect(mood)}
                        className="group relative overflow-hidden rounded-2xl p-6 sm:p-8 glass glass-hover transition-all duration-300 cursor-pointer"
                        initial={{ opacity: 0, y: 30, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: index * 0.08, duration: 0.5, type: 'spring', stiffness: 100 }}
                        whileHover={{ scale: 1.05, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {/* Glow background on hover */}
                        <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{
                                background: `radial-gradient(circle at center, ${config.color}15 0%, transparent 70%)`,
                            }}
                        />

                        {/* Content */}
                        <div className="relative z-10 flex flex-col items-center text-center gap-3">
                            {/* Emoji with glow */}
                            <motion.div
                                className="text-4xl sm:text-5xl"
                                whileHover={{ scale: 1.2, rotate: [0, -5, 5, 0] }}
                                transition={{ duration: 0.4 }}
                            >
                                {config.emoji}
                            </motion.div>

                            {/* Label */}
                            <h3 className="font-display text-lg sm:text-xl font-bold tracking-wide">
                                {config.label}
                            </h3>

                            {/* Description */}
                            <p className="text-white/30 text-xs sm:text-sm leading-snug hidden sm:block">
                                {config.description}
                            </p>

                            {/* Mood indicator */}
                            <div
                                className="w-8 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300"
                                style={{ backgroundColor: config.color }}
                            />
                        </div>

                        {/* Border glow on hover */}
                        <div
                            className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                            style={{
                                boxShadow: `inset 0 0 0 1px ${config.color}30, 0 0 30px ${config.color}10`,
                            }}
                        />
                    </motion.button>
                );
            })}
        </div>
    );
}
