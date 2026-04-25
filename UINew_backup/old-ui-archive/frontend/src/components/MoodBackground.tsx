'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MoodType, MOOD_CONFIG } from '@/lib/types';

interface MoodBackgroundProps {
    mood: MoodType | null;
}

export default function MoodBackground({ mood }: MoodBackgroundProps) {
    return (
        <div className="fixed inset-0 z-0 overflow-hidden">
            {/* Base dark background */}
            <div className="absolute inset-0 bg-[hsl(0,0%,3%)]" />

            {/* Animated mood gradient */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={mood || 'default'}
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2 }}
                >
                    {mood ? (
                        <>
                            {/* Primary glow */}
                            <div
                                className="absolute top-0 left-1/3 w-[800px] h-[800px] rounded-full blur-[200px]"
                                style={{
                                    background: `radial-gradient(circle, ${MOOD_CONFIG[mood].color}12 0%, transparent 70%)`,
                                }}
                            />
                            {/* Secondary glow */}
                            <div
                                className="absolute bottom-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[180px]"
                                style={{
                                    background: `radial-gradient(circle, ${MOOD_CONFIG[mood].color}08 0%, transparent 70%)`,
                                }}
                            />
                            {/* Ambient particles */}
                            <div className="absolute inset-0">
                                {[...Array(6)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        className="absolute w-1 h-1 rounded-full"
                                        style={{
                                            backgroundColor: MOOD_CONFIG[mood].color + '40',
                                            left: `${15 + i * 15}%`,
                                            top: `${20 + (i % 3) * 25}%`,
                                        }}
                                        animate={{
                                            y: [0, -30, 0],
                                            opacity: [0.2, 0.6, 0.2],
                                            scale: [1, 1.5, 1],
                                        }}
                                        transition={{
                                            duration: 4 + i * 0.5,
                                            repeat: Infinity,
                                            delay: i * 0.7,
                                        }}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Default subtle gradient */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] rounded-full blur-[200px] bg-gradient-to-b from-blue-900/5 to-transparent" />
                            <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[200px] bg-gradient-to-t from-purple-900/5 to-transparent" />
                        </>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Noise texture */}
            <div className="absolute inset-0 noise-overlay" />

            {/* Grid overlay - very subtle */}
            <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
                    backgroundSize: '60px 60px',
                }}
            />
        </div>
    );
}
