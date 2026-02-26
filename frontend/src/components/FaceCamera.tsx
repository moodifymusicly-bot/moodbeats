'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoodType } from '@/lib/types';

// ===== Emotion → Mood mapping =====
const EMOTION_TO_MOOD: Record<string, MoodType> = {
    happy: 'happy',
    surprised: 'happy',
    sad: 'sad',
    angry: 'rock',
    disgusted: 'fear',
    fearful: 'fear',
    neutral: 'study',
};

// ===== Emotion → Box color mapping =====
const EMOTION_COLORS: Record<string, string> = {
    happy: '#facc15',      // Yellow
    surprised: '#fb923c',  // Orange
    sad: '#60a5fa',        // Blue
    angry: '#ef4444',      // Red
    disgusted: '#a855f7',  // Purple
    fearful: '#f87171',    // Light red
    neutral: '#9ca3af',    // Grey
};

// ===== Emotion → Emoji =====
const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊',
    surprised: '😲',
    sad: '😢',
    angry: '😤',
    disgusted: '🤢',
    fearful: '😰',
    neutral: '😐',
};

interface FaceCameraProps {
    onMoodDetected: (mood: MoodType, confidence: number) => void;
    isActive: boolean;
    isDetecting: boolean;
    onStartDetect: () => void;
    onStopDetect: () => void;
}

export default function FaceCamera({ onMoodDetected, isActive, isDetecting, onStartDetect, onStopDetect }: FaceCameraProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [detectedEmotion, setDetectedEmotion] = useState<string | null>(null);
    const [confidence, setConfidence] = useState(0);
    const [allExpressions, setAllExpressions] = useState<Record<string, number>>({});
    const [faceApiLoaded, setFaceApiLoaded] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [lastSpoken, setLastSpoken] = useState<string | null>(null);
    const [scanInterval, setScanInterval] = useState(3);
    const [consecutiveMatches, setConsecutiveMatches] = useState(0);
    const faceApiRef = useRef<any>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load face-api models
    useEffect(() => {
        if (!isActive) return;
        const loadModels = async () => {
            try {
                const faceapi = await import('@vladmandic/face-api');
                faceApiRef.current = faceapi;
                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
                ]);
                setFaceApiLoaded(true);
            } catch (err) {
                console.error('Failed to load face-api models:', err);
                setCameraError('Failed to load AI models');
            }
        };
        loadModels();
    }, [isActive]);

    // Start camera
    useEffect(() => {
        if (!isActive || !faceApiLoaded) return;

        // Reset states
        setCameraError(null);
        setIsLoading(true);

        const startCamera = async () => {
            try {
                // Check if mediaDevices API is available (requires secure context: HTTPS or localhost)
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    setCameraError('Camera requires a secure connection. Please access the app at http://localhost:3000 (not via IP address).');
                    setIsLoading(false);
                    return;
                }

                // Stop any existing stream first
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                    streamRef.current = null;
                }

                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
                });
                streamRef.current = mediaStream;
                setStream(mediaStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                    videoRef.current.onloadeddata = () => setIsLoading(false);
                }
            } catch (err: any) {
                console.error('Camera access error:', err);
                if (err.name === 'NotAllowedError') setCameraError('Camera access denied. Please allow camera permissions in your browser.');
                else if (err.name === 'NotFoundError') setCameraError('No camera found on this device.');
                else if (err.name === 'NotReadableError') setCameraError('Camera is being used by another application.');
                else setCameraError(`Unable to access camera: ${err.message || err.name}`);
                setIsLoading(false);
            }
        };
        startCamera();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, [isActive, faceApiLoaded]);

    // Speak detected mood
    const speakMood = (emotion: string) => {
        if (!voiceEnabled || emotion === lastSpoken) return;
        if (!('speechSynthesis' in window)) return;

        const moodLabel = EMOTION_TO_MOOD[emotion]
            ? EMOTION_TO_MOOD[emotion].charAt(0).toUpperCase() + EMOTION_TO_MOOD[emotion].slice(1)
            : emotion;

        const phrases: Record<string, string> = {
            happy: 'You look happy! Let me find some upbeat tracks for you.',
            surprised: 'Oh, you look surprised! How about some exciting music?',
            sad: 'You seem a bit down. Let me play something soothing.',
            angry: 'Feeling intense? Let me queue some powerful rock tracks.',
            disgusted: 'Detecting an intense mood. How about some dark atmospheric music?',
            fearful: 'Sensing some tension. Let me find the right soundtrack.',
            neutral: 'You seem calm and focused. Perfect for study music.',
        };

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(phrases[emotion] || `Detected mood: ${moodLabel}`);
        utterance.rate = 0.95;
        utterance.pitch = 0.9;
        utterance.volume = 0.8;
        window.speechSynthesis.speak(utterance);
        setLastSpoken(emotion);
    };

    // Run face detection
    useEffect(() => {
        if (!isActive || !isDetecting || isLoading || !faceApiLoaded || !videoRef.current || cameraError) return;

        const detectFace = async () => {
            const faceapi = faceApiRef.current;
            if (!faceapi || !videoRef.current) return;

            try {
                const detections = await faceapi
                    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({
                        inputSize: 224, scoreThreshold: 0.3,
                    }))
                    .withFaceExpressions();

                if (detections) {
                    const expressions = detections.expressions;
                    let maxExpr = 'neutral';
                    let maxVal = 0;
                    const exprMap: Record<string, number> = {};

                    Object.entries(expressions).forEach(([expr, val]) => {
                        exprMap[expr] = Math.round((val as number) * 100);
                        if ((val as number) > maxVal) {
                            maxVal = val as number;
                            maxExpr = expr;
                        }
                    });

                    setDetectedEmotion(prev => {
                        if (prev === maxExpr) {
                            setConsecutiveMatches(c => {
                                const newCount = c + 1;
                                if (newCount >= scanInterval) {
                                    // Trigger auto-detect and reset
                                    if (EMOTION_TO_MOOD[maxExpr]) {
                                        onMoodDetected(EMOTION_TO_MOOD[maxExpr], maxVal);
                                        // Auto-reset detection state
                                        onStopDetect();
                                    }
                                    return 0; // Reset after trigger
                                }
                                return newCount;
                            });
                        } else {
                            setConsecutiveMatches(1);
                        }
                        return maxExpr;
                    });

                    setConfidence(Math.round(maxVal * 100));
                    setAllExpressions(exprMap);

                    // Speak if voice is enabled
                    speakMood(maxExpr);

                    // Draw on canvas with mood-colored box
                    if (canvasRef.current && videoRef.current) {
                        const displaySize = {
                            width: videoRef.current.videoWidth,
                            height: videoRef.current.videoHeight,
                        };
                        faceapi.matchDimensions(canvasRef.current, displaySize);
                        const resized = faceapi.resizeResults(detections, displaySize);
                        const ctx = canvasRef.current.getContext('2d');
                        if (ctx) {
                            ctx.clearRect(0, 0, displaySize.width, displaySize.height);
                            const box = resized.detection.box;
                            const boxColor = EMOTION_COLORS[maxExpr] || '#9ca3af';

                            // Face bounding box (mood-colored)
                            ctx.strokeStyle = boxColor;
                            ctx.lineWidth = 2;
                            ctx.strokeRect(box.x, box.y, box.width, box.height);

                            // Corner accents (mood-colored)
                            const cornerLen = 14;
                            ctx.strokeStyle = boxColor;
                            ctx.lineWidth = 3;
                            // Top-left
                            ctx.beginPath();
                            ctx.moveTo(box.x, box.y + cornerLen);
                            ctx.lineTo(box.x, box.y);
                            ctx.lineTo(box.x + cornerLen, box.y);
                            ctx.stroke();
                            // Top-right
                            ctx.beginPath();
                            ctx.moveTo(box.x + box.width - cornerLen, box.y);
                            ctx.lineTo(box.x + box.width, box.y);
                            ctx.lineTo(box.x + box.width, box.y + cornerLen);
                            ctx.stroke();
                            // Bottom-left
                            ctx.beginPath();
                            ctx.moveTo(box.x, box.y + box.height - cornerLen);
                            ctx.lineTo(box.x, box.y + box.height);
                            ctx.lineTo(box.x + cornerLen, box.y + box.height);
                            ctx.stroke();
                            // Bottom-right
                            ctx.beginPath();
                            ctx.moveTo(box.x + box.width - cornerLen, box.y + box.height);
                            ctx.lineTo(box.x + box.width, box.y + box.height);
                            ctx.lineTo(box.x + box.width, box.y + box.height - cornerLen);
                            ctx.stroke();

                            // Emotion label above face box
                            ctx.save();
                            ctx.translate(box.x + box.width / 2, box.y);
                            ctx.scale(-1, 1);

                            ctx.fillStyle = boxColor;
                            ctx.font = 'bold 13px monospace';
                            const label = `${maxExpr.toUpperCase()} ${Math.round(maxVal * 100)}%`;
                            const textWidth = ctx.measureText(label).width;

                            // Background pill for label
                            ctx.fillStyle = 'rgba(0,0,0,0.7)';
                            ctx.beginPath();
                            ctx.roundRect(-textWidth / 2 - 6, -24, textWidth + 12, 20, 4);
                            ctx.fill();

                            ctx.fillStyle = boxColor;
                            ctx.fillText(label, -textWidth / 2, -9);
                            ctx.restore();

                            // Emoji at bottom-right of face box
                            ctx.save();
                            ctx.translate(box.x + box.width / 2, box.y + box.height);
                            ctx.scale(-1, 1);
                            ctx.font = '16px sans-serif';
                            ctx.fillText(EMOTION_EMOJI[maxExpr] || '🎵', textWidth / 2 - 20, 20);
                            ctx.restore();
                        }
                    }
                } else {
                    setDetectedEmotion(null);
                    setConfidence(0);
                    setConsecutiveMatches(0);
                    setAllExpressions({});
                    if (canvasRef.current) {
                        const ctx = canvasRef.current.getContext('2d');
                        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    }
                }
            } catch { }
        };

        intervalRef.current = setInterval(detectFace, scanInterval * 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isActive, isDetecting, isLoading, faceApiLoaded, cameraError, voiceEnabled, lastSpoken, scanInterval]);

    // Cleanup
    useEffect(() => {
        return () => {
            stream?.getTracks().forEach(t => t.stop());
            if (intervalRef.current) clearInterval(intervalRef.current);
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        };
    }, []);

    const handleDetect = () => {
        if (detectedEmotion && EMOTION_TO_MOOD[detectedEmotion]) {
            onMoodDetected(EMOTION_TO_MOOD[detectedEmotion], confidence / 100);
        }
    };

    if (!isActive) return null;

    const boxColor = detectedEmotion ? EMOTION_COLORS[detectedEmotion] || '#9ca3af' : '#00ff88';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-sm mx-auto"
        >
            <div className="rounded-2xl overflow-hidden border border-white/10"
                style={{ background: 'rgba(255,255,255,0.03)' }}>

                {/* Header with controls */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: boxColor }} />
                        <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: boxColor }}>
                            Neural Scan {detectedEmotion ? `(${consecutiveMatches}/${scanInterval}s)` : ''}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/10 border border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                                <span className="text-[10px] font-bold text-white tracking-widest uppercase">
                                    SCAN: <span className="text-emerald-400 font-black">{scanInterval}s</span>
                                </span>
                            </div>
                            <input
                                type="range"
                                min="3"
                                max="10"
                                value={scanInterval}
                                onChange={(e) => setScanInterval(parseInt(e.target.value))}
                                className="w-20 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                            />
                        </div>
                        {/* Voice Toggle */}
                        <button
                            onClick={() => {
                                setVoiceEnabled(!voiceEnabled);
                                setLastSpoken(null);
                                if (voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
                            }}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] tracking-[0.15em] uppercase font-bold transition-all ${voiceEnabled
                                ? 'bg-white/10 border border-white/20 text-white'
                                : 'border border-white/5 text-white/30'
                                }`}
                        >
                            {voiceEnabled ? '🔊' : '🔇'}
                            <span>{voiceEnabled ? 'Voice On' : 'Voice Off'}</span>
                        </button>
                        <span className="text-[10px] text-white/30 font-mono">
                            {confidence > 0 ? `${confidence}%` : '---'}
                        </span>
                    </div>
                </div>

                {/* Camera feed */}
                <div className="relative aspect-[4/3] bg-black">
                    {isLoading && !cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                                style={{ borderColor: boxColor, borderTopColor: 'transparent' }} />
                            <span className="text-xs text-white/40">Initializing camera & AI models...</span>
                        </div>
                    )}

                    {cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 z-10">
                            <div className="text-3xl">📷</div>
                            <span className="text-xs text-white/50 text-center">{cameraError}</span>
                            <button onClick={() => window.location.reload()}
                                className="mt-2 px-4 py-1.5 rounded-full text-[10px] tracking-wider uppercase border border-white/10 hover:bg-white/5">
                                Retry
                            </button>
                        </div>
                    )}

                    <video ref={videoRef} autoPlay playsInline muted
                        className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
                        style={{ transform: 'scaleX(-1)' }} />

                    {/* Scan lines */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)' }} />

                    {/* Corner markers */}
                    <div className="absolute inset-3 pointer-events-none">
                        <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2" style={{ borderColor: boxColor + '60' }} />
                        <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2" style={{ borderColor: boxColor + '60' }} />
                        <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2" style={{ borderColor: boxColor + '60' }} />
                        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2" style={{ borderColor: boxColor + '60' }} />
                    </div>

                    {/* Scanning line animation */}
                    <motion.div
                        className="absolute left-3 right-3 h-[1px] pointer-events-none"
                        style={{ backgroundColor: boxColor + '30' }}
                        animate={{ y: ['0px', '200px', '0px'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    />
                </div>

                {/* Confidence breakdown panel */}
                <div className="px-4 py-3 border-t border-white/5">
                    <AnimatePresence mode="wait">
                        {detectedEmotion ? (
                            <motion.div key={detectedEmotion}
                                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>

                                {/* Detected mood display */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl">{EMOTION_EMOJI[detectedEmotion] || '🎵'}</span>
                                        <div>
                                            <p className="text-[10px] tracking-[0.15em] uppercase text-white/30">Detected Mood</p>
                                            <p className="text-base font-display font-black capitalize" style={{ color: boxColor }}>
                                                {detectedEmotion}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Big confidence badge */}
                                    <div className="text-center px-3 py-1 rounded-lg" style={{ backgroundColor: boxColor + '15', border: `1px solid ${boxColor}30` }}>
                                        <p className="text-xl font-black font-mono" style={{ color: boxColor }}>{confidence}%</p>
                                        <p className="text-[8px] tracking-[0.2em] uppercase text-white/30">Confidence</p>
                                    </div>
                                </div>

                                {/* Expression bars */}
                                <div className="space-y-1 mb-3">
                                    {Object.entries(allExpressions)
                                        .sort(([, a], [, b]) => b - a)
                                        .slice(0, 4)
                                        .map(([expr, val]) => (
                                            <div key={expr} className="flex items-center gap-2">
                                                <span className="text-[9px] tracking-[0.1em] uppercase text-white/30 w-16 text-right">
                                                    {expr}
                                                </span>
                                                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                    <motion.div
                                                        className="h-full rounded-full"
                                                        style={{ backgroundColor: EMOTION_COLORS[expr] || '#666' }}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${val}%` }}
                                                        transition={{ duration: 0.4 }}
                                                    />
                                                </div>
                                                <span className="text-[9px] font-mono text-white/30 w-8">{val}%</span>
                                            </div>
                                        ))}
                                </div>

                                {/* Maps to mood */}
                                <div className="flex items-center justify-between">
                                    <p className="text-[9px] tracking-[0.15em] uppercase text-white/30">
                                        Maps to: <span className="font-bold text-white/60">{EMOTION_TO_MOOD[detectedEmotion] || 'study'} mode</span>
                                    </p>
                                    <button onClick={handleDetect}
                                        className="px-4 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition-all hover:brightness-110"
                                        style={{ backgroundColor: boxColor, color: '#000' }}>
                                        Use This Mood
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="no-face" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="text-center py-2">
                                <p className="text-xs text-white/30">Position your face in the frame for mood detection</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Start Detecting Button */}
                    <div className="px-4 pb-3">
                        {!isDetecting ? (
                            <motion.button
                                onClick={() => {
                                    // Reset state before starting new detection
                                    setDetectedEmotion(null);
                                    setConfidence(0);
                                    setConsecutiveMatches(0);
                                    setAllExpressions({});
                                    setLastSpoken(null);
                                    if (canvasRef.current) {
                                        const ctx = canvasRef.current.getContext('2d');
                                        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                                    }
                                    onStartDetect();
                                }}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.95 }}
                                className="w-full py-3 rounded-xl text-sm font-black tracking-[0.2em] uppercase transition-all"
                                style={{
                                    background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                                    color: '#000',
                                    boxShadow: '0 0 30px rgba(0, 255, 136, 0.3)',
                                }}
                            >
                                ▶ Start Detecting
                            </motion.button>
                        ) : (
                            <div className="flex items-center justify-center gap-2 py-3">
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-[10px] tracking-[0.2em] uppercase text-green-400 font-bold">
                                    Scanning your face...
                                </span>
                                <button
                                    onClick={() => {
                                        onStopDetect();
                                        setDetectedEmotion(null);
                                        setConfidence(0);
                                        setConsecutiveMatches(0);
                                        setAllExpressions({});
                                    }}
                                    className="ml-2 px-3 py-1 rounded-full text-[9px] tracking-wider uppercase border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all font-bold"
                                >
                                    Stop
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
