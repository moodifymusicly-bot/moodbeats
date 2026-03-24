'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoodType } from '@/lib/types';

const EMOTION_TO_MOOD: Record<string, MoodType> = {
    happy: 'happy',
    surprised: 'happy',
    sad: 'sad',
    angry: 'rock',
    disgusted: 'rock',
    fearful: 'sad',
    neutral: 'study',
};

const EMOTION_COLORS: Record<string, string> = {
    happy: '#facc15',
    surprised: '#fb923c',
    sad: '#60a5fa',
    angry: '#ef4444',
    disgusted: '#a855f7',
    fearful: '#f87171',
    neutral: '#9ca3af',
};

const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊',
    surprised: '😲',
    sad: '😢',
    angry: '😤',
    disgusted: '🤢',
    fearful: '😰',
    neutral: '😐',
};

const SCAN_DURATION = 5;
const DETECT_INTERVAL = 400;
const SCAN_SECONDS = 2.5;

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
    const streamRef = useRef<MediaStream | null>(null);
    const faceApiRef = useRef<any>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const [countdown, setCountdown] = useState(SCAN_DURATION);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
    const emotionAccumulator = useRef<Record<string, number[]>>({});

    const [showCelebration, setShowCelebration] = useState(false);
    const [scanKey, setScanKey] = useState(0);
    const autoStartedRef = useRef(false);

    // Face box state for animations
    const [faceBox, setFaceBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

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

    useEffect(() => {
        if (!isActive || !faceApiLoaded) return;

        setCameraError(null);
        setIsLoading(true);

        const startCamera = async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    setCameraError('Camera requires a secure connection (HTTPS or localhost).');
                    setIsLoading(false);
                    return;
                }

                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                    streamRef.current = null;
                }

                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
                });
                streamRef.current = mediaStream;
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                    videoRef.current.onloadeddata = () => setIsLoading(false);
                }
            } catch (err: any) {
                if (err.name === 'NotAllowedError') setCameraError('Camera access denied. Please allow camera permissions.');
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

    const finalizeDetection = useCallback(() => {
        const acc = emotionAccumulator.current;
        let bestEmotion = 'neutral';
        let bestAvg = 0;

        for (const [emotion, scores] of Object.entries(acc)) {
            if (scores.length === 0) continue;
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            if (avg > bestAvg) {
                bestAvg = avg;
                bestEmotion = emotion;
            }
        }

        if (EMOTION_TO_MOOD[bestEmotion]) {
            setDetectedEmotion(bestEmotion);
            setConfidence(Math.round(bestAvg * 100));
            setShowCelebration(true);
            setTimeout(() => {
                onMoodDetected(EMOTION_TO_MOOD[bestEmotion], bestAvg);
                onStopDetect();
                setShowCelebration(false);
            }, 1200);
        }
    }, [onMoodDetected, onStopDetect]);

    const handleStartDetect = useCallback(() => {
        setDetectedEmotion(null);
        setConfidence(0);
        setAllExpressions({});
        setShowCelebration(false);
        emotionAccumulator.current = {};
        setCountdown(SCAN_DURATION);

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }

        onStartDetect();
        setScanKey(k => k + 1);

        let remaining = SCAN_DURATION;
        countdownRef.current = setInterval(() => {
            remaining -= 1;
            setCountdown(remaining);
            if (remaining <= 0) {
                if (countdownRef.current) clearInterval(countdownRef.current);
                finalizeDetection();
            }
        }, 500);
    }, [onStartDetect, finalizeDetection]);

    // AUTO-START: When camera is ready and models are loaded, auto-start detection
    useEffect(() => {
        if (isActive && faceApiLoaded && !isLoading && !cameraError && !autoStartedRef.current && !isDetecting) {
            autoStartedRef.current = true;
            // Small delay to let the video settle
            const timer = setTimeout(() => {
                handleStartDetect();
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [isActive, faceApiLoaded, isLoading, cameraError, isDetecting, handleStartDetect]);

    // Reset autostart when component deactivates
    useEffect(() => {
        if (!isActive) {
            autoStartedRef.current = false;
        }
    }, [isActive]);

    useEffect(() => {
        if (!isActive || !isDetecting || isLoading || !faceApiLoaded || !videoRef.current || cameraError) return;

        const detectFace = async () => {
            const faceapi = faceApiRef.current;
            if (!faceapi || !videoRef.current) return;

            try {
                const detections = await faceapi
                    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({
                        inputSize: 160,
                        scoreThreshold: 0.3,
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

                    if (!emotionAccumulator.current[maxExpr]) {
                        emotionAccumulator.current[maxExpr] = [];
                    }
                    emotionAccumulator.current[maxExpr].push(maxVal);

                    setDetectedEmotion(maxExpr);
                    setConfidence(Math.round(maxVal * 100));
                    setAllExpressions(exprMap);

                    // Store face box for overlay animations
                    if (videoRef.current) {
                        const displaySize = {
                            width: videoRef.current.videoWidth,
                            height: videoRef.current.videoHeight,
                        };
                        if (canvasRef.current) {
                            faceapi.matchDimensions(canvasRef.current, displaySize);
                        }
                        const resized = faceapi.resizeResults(detections, displaySize);
                        const box = resized.detection.box;
                        setFaceBox({ x: box.x, y: box.y, w: box.width, h: box.height });

                        // Draw custom overlay on canvas
                        if (canvasRef.current) {
                            const ctx = canvasRef.current.getContext('2d');
                            if (ctx) {
                                ctx.clearRect(0, 0, displaySize.width, displaySize.height);
                                const boxColor = EMOTION_COLORS[maxExpr] || '#9ca3af';
                                const cx = box.x + box.width / 2;
                                const cy = box.y + box.height / 2;
                                const radius = Math.max(box.width, box.height) / 2;
                                const time = Date.now() / 1000;

                                // Pulsing radar rings
                                for (let i = 0; i < 3; i++) {
                                    const phase = ((time * 0.8 + i * 0.33) % 1);
                                    const r = radius * (0.7 + phase * 0.8);
                                    const alpha = (1 - phase) * 0.5;
                                    ctx.beginPath();
                                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                                    ctx.strokeStyle = boxColor;
                                    ctx.globalAlpha = alpha;
                                    ctx.lineWidth = 1.5;
                                    ctx.stroke();
                                    ctx.globalAlpha = 1;
                                }

                                // Glowing rounded rect around face
                                const pad = 12;
                                const rr = 14;
                                ctx.shadowColor = boxColor;
                                ctx.shadowBlur = 18;
                                ctx.strokeStyle = boxColor;
                                ctx.lineWidth = 2;
                                ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 3);
                                ctx.beginPath();
                                ctx.roundRect(box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2, rr);
                                ctx.stroke();
                                ctx.globalAlpha = 1;
                                ctx.shadowBlur = 0;

                                // Orbiting particles
                                const particleCount = 8;
                                for (let i = 0; i < particleCount; i++) {
                                    const angle = (time * 1.2) + (i / particleCount) * Math.PI * 2;
                                    const orbitR = radius * 1.1;
                                    const px = cx + Math.cos(angle) * orbitR;
                                    const py = cy + Math.sin(angle) * orbitR;
                                    const pSize = 2 + Math.sin(time * 4 + i) * 1;

                                    ctx.beginPath();
                                    ctx.arc(px, py, pSize, 0, Math.PI * 2);
                                    ctx.fillStyle = boxColor;
                                    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(time * 3 + i);
                                    ctx.fill();
                                    ctx.globalAlpha = 1;
                                }

                                // Rotating scan arc
                                const scanAngle = time * 2;
                                const arcLen = Math.PI * 0.4;
                                ctx.beginPath();
                                ctx.arc(cx, cy, radius * 0.9, scanAngle, scanAngle + arcLen);
                                ctx.strokeStyle = boxColor;
                                ctx.lineWidth = 3;
                                ctx.globalAlpha = 0.7;
                                ctx.lineCap = 'round';
                                ctx.shadowColor = boxColor;
                                ctx.shadowBlur = 12;
                                ctx.stroke();
                                ctx.shadowBlur = 0;
                                ctx.globalAlpha = 1;

                                // Emotion label pill
                                ctx.save();
                                ctx.translate(cx, box.y - pad - 14);
                                ctx.scale(-1, 1); // Mirror because video is flipped
                                const label = `${maxExpr.toUpperCase()} ${Math.round(maxVal * 100)}%`;
                                ctx.font = 'bold 11px monospace';
                                const textWidth = ctx.measureText(label).width;
                                const pillW = textWidth + 24;
                                const pillH = 24;
                                const pillX = -pillW / 2;
                                const pillY = -pillH / 2;
                                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                                ctx.beginPath();
                                ctx.roundRect(pillX, pillY, pillW, pillH, 12);
                                ctx.fill();
                                ctx.strokeStyle = boxColor + '60';
                                ctx.lineWidth = 1;
                                ctx.stroke();
                                ctx.fillStyle = boxColor;
                                ctx.fillText(label, pillX + 12, pillY + 16);
                                ctx.restore();
                            }
                        }
                    }
                } else {
                    setDetectedEmotion(null);
                    setConfidence(0);
                    setAllExpressions({});
                    setFaceBox(null);
                    if (canvasRef.current) {
                        const ctx = canvasRef.current.getContext('2d');
                        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    }
                }
            } catch { }
        };

        detectFace();
        intervalRef.current = setInterval(detectFace, DETECT_INTERVAL);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isActive, isDetecting, isLoading, faceApiLoaded, cameraError]);

    useEffect(() => {
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    const handleStopDetect = () => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        onStopDetect();
        setDetectedEmotion(null);
        setConfidence(0);
        setAllExpressions({});
        setShowCelebration(false);
        setCountdown(SCAN_DURATION);
        emotionAccumulator.current = {};
        setFaceBox(null);
        autoStartedRef.current = false;
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    };

    if (!isActive) return null;

    const activeColor = detectedEmotion ? EMOTION_COLORS[detectedEmotion] || '#9ca3af' : '#00ff88';
    const countdownProgress = isDetecting ? ((SCAN_DURATION - countdown) / SCAN_DURATION) * 100 : 0;
    const ringRadius = 24;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-sm mx-auto"
        >
            <div className="rounded-2xl overflow-hidden border border-white/10"
                style={{ background: 'rgba(255,255,255,0.03)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <span
                            className="w-2 h-2 rounded-full"
                            style={{
                                backgroundColor: isDetecting ? activeColor : '#555',
                                boxShadow: isDetecting ? `0 0 6px ${activeColor}` : 'none',
                                animation: isDetecting ? 'pulse 1.5s ease-in-out infinite' : 'none',
                            }}
                        />
                        <span className="text-[10px] tracking-[0.2em] uppercase font-semibold"
                            style={{ color: isDetecting ? activeColor : '#777' }}>
                            {isLoading ? 'Initializing...' : isDetecting ? 'Scanning' : 'Ready'}
                        </span>
                    </div>
                    {isDetecting && confidence > 0 && (
                        <span className="text-[10px] font-mono" style={{ color: activeColor }}>
                            {confidence}%
                        </span>
                    )}
                </div>

                {/* Camera feed */}
                <div className="relative aspect-[4/3] bg-black overflow-hidden">
                    {isLoading && !cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                                style={{ borderColor: '#00ff88', borderTopColor: 'transparent' }} />
                            <span className="text-xs text-white/40">Initializing camera & AI...</span>
                            <span className="text-[10px] text-white/25">Detection will auto-start</span>
                        </div>
                    )}

                    {cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 z-10">
                            <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3l18 18" />
                            </svg>
                            <span className="text-xs text-white/50 text-center">{cameraError}</span>
                            <button onClick={() => window.location.reload()}
                                className="mt-2 px-4 py-1.5 rounded-full text-[10px] tracking-wider uppercase border border-white/10 hover:bg-white/5 text-white/50">
                                Retry
                            </button>
                        </div>
                    )}

                    <video ref={videoRef} autoPlay playsInline muted
                        className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
                        style={{ transform: 'scaleX(-1)' }} />

                    {/* Dynamic edge glow corners */}
                    <div className="absolute inset-3 pointer-events-none">
                        {[
                            { pos: 'top-0 left-0', border: 'border-t-2 border-l-2', radius: 'rounded-tl-lg' },
                            { pos: 'top-0 right-0', border: 'border-t-2 border-r-2', radius: 'rounded-tr-lg' },
                            { pos: 'bottom-0 left-0', border: 'border-b-2 border-l-2', radius: 'rounded-bl-lg' },
                            { pos: 'bottom-0 right-0', border: 'border-b-2 border-r-2', radius: 'rounded-br-lg' },
                        ].map((corner, i) => (
                            <motion.div
                                key={i}
                                className={`absolute w-8 h-8 ${corner.pos} ${corner.border} ${corner.radius} transition-all duration-500`}
                                style={{
                                    borderColor: (isDetecting ? activeColor : '#ffffff') + '35',
                                }}
                                animate={isDetecting ? {
                                    borderColor: [`${activeColor}35`, `${activeColor}80`, `${activeColor}35`],
                                    scale: [1, 1.08, 1],
                                } : {}}
                                transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                            />
                        ))}
                    </div>

                    {/* Radial scan sweep (replaces horizontal sweep) */}
                    {isDetecting && !showCelebration && (
                        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                            {/* Rotating gradient sweep */}
                            <motion.div
                                className="absolute"
                                style={{
                                    top: '50%',
                                    left: '50%',
                                    width: '140%',
                                    height: '140%',
                                    marginLeft: '-70%',
                                    marginTop: '-70%',
                                    background: `conic-gradient(from 0deg, transparent 0deg, ${activeColor}15 30deg, ${activeColor}30 60deg, transparent 90deg, transparent 360deg)`,
                                    borderRadius: '50%',
                                }}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            />
                        </div>
                    )}

                    {/* Countdown ring */}
                    <AnimatePresence>
                        {isDetecting && countdown > 0 && !showCelebration && (
                            <motion.div
                                key={`countdown-${scanKey}`}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="absolute top-3 right-3 z-20"
                            >
                                <div className="relative w-14 h-14 flex items-center justify-center">
                                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                                        <circle cx="28" cy="28" r={ringRadius}
                                            fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                                        <motion.circle
                                            cx="28" cy="28" r={ringRadius}
                                            fill="none"
                                            stroke={activeColor}
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            initial={{ pathLength: 1 }}
                                            animate={{ pathLength: 0 }}
                                            transition={{ duration: SCAN_SECONDS, ease: 'linear' }}
                                            style={{ filter: `drop-shadow(0 0 6px ${activeColor})` }}
                                        />
                                    </svg>
                                    <span className="text-[11px] font-bold font-mono relative z-10"
                                        style={{ color: activeColor }}>
                                        {(countdown * 0.5).toFixed(1)}
                                    </span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Live emotion pill */}
                    <AnimatePresence>
                        {isDetecting && detectedEmotion && !showCelebration && (
                            <motion.div
                                key={`badge-${detectedEmotion}`}
                                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.9 }}
                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                className="absolute bottom-3 left-3 z-20 rounded-xl overflow-hidden"
                                style={{
                                    backdropFilter: 'blur(12px)',
                                    border: `1px solid ${activeColor}35`,
                                }}
                            >
                                <div className="flex items-center gap-2 px-3 py-2 relative"
                                    style={{ background: `linear-gradient(135deg, ${activeColor}18, rgba(0,0,0,0.6))` }}>
                                    <motion.span
                                        className="text-base"
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                    >
                                        {EMOTION_EMOJI[detectedEmotion]}
                                    </motion.span>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-wider leading-none"
                                            style={{ color: activeColor }}>
                                            {detectedEmotion}
                                        </span>
                                        <span className="text-[9px] font-mono text-white/40 mt-0.5">{confidence}%</span>
                                    </div>
                                </div>
                                <div className="h-[2px] w-full" style={{ background: `${activeColor}15` }}>
                                    <motion.div
                                        className="h-full"
                                        style={{ backgroundColor: activeColor }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${confidence}%` }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Celebration overlay — enhanced */}
                    <AnimatePresence>
                        {showCelebration && detectedEmotion && (
                            <motion.div
                                key="celebration"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-20 flex flex-col items-center justify-center"
                                style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
                            >
                                {/* Multiple ripple rings */}
                                {[0, 1, 2, 3].map(i => (
                                    <motion.div
                                        key={`ripple-${i}`}
                                        className="absolute rounded-full"
                                        style={{ border: `2px solid ${activeColor}` }}
                                        initial={{ width: 10, height: 10, opacity: 0.8 }}
                                        animate={{ width: 220, height: 220, opacity: 0 }}
                                        transition={{ duration: 1, delay: i * 0.18, ease: 'easeOut' }}
                                    />
                                ))}

                                {/* Sparkle particles */}
                                {[...Array(12)].map((_, i) => {
                                    const angle = (i / 12) * Math.PI * 2;
                                    return (
                                        <motion.div
                                            key={`sparkle-${i}`}
                                            className="absolute w-1.5 h-1.5 rounded-full"
                                            style={{ backgroundColor: activeColor }}
                                            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                            animate={{
                                                x: Math.cos(angle) * 100,
                                                y: Math.sin(angle) * 100,
                                                opacity: 0,
                                                scale: 0,
                                            }}
                                            transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
                                        />
                                    );
                                })}

                                {/* Main emoji */}
                                <motion.div
                                    initial={{ scale: 0, rotate: -30 }}
                                    animate={{ scale: [0, 1.6, 1], rotate: [-30, 10, 0] }}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                    className="text-7xl relative z-10"
                                >
                                    {EMOTION_EMOJI[detectedEmotion] || '🎵'}
                                </motion.div>

                                {/* Mood locked badge */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                    className="mt-4 px-6 py-2.5 rounded-full relative z-10"
                                    style={{
                                        background: `linear-gradient(135deg, ${activeColor}30, ${activeColor}10)`,
                                        border: `1px solid ${activeColor}50`,
                                        boxShadow: `0 0 30px ${activeColor}30, 0 0 60px ${activeColor}10`,
                                    }}
                                >
                                    <span className="text-xs font-black tracking-[0.3em] uppercase"
                                        style={{ color: activeColor }}>
                                        ✦ Mood Locked ✦
                                    </span>
                                </motion.div>

                                {/* Confidence subtext */}
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-[10px] text-white/30 mt-2 font-mono"
                                >
                                    {confidence}% confidence
                                </motion.p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Edge glow while scanning */}
                    {isDetecting && !showCelebration && (
                        <motion.div
                            className="absolute inset-0 pointer-events-none z-10"
                            animate={{ opacity: [0.15, 0.4, 0.15] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ boxShadow: `inset 0 0 40px ${activeColor}25` }}
                        />
                    )}
                </div>

                {/* Bottom panel */}
                <div className="px-4 py-3 border-t border-white/5">
                    <AnimatePresence mode="wait">
                        {isDetecting && detectedEmotion && Object.keys(allExpressions).length > 0 ? (
                            <motion.div key="expressions"
                                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                                {/* Scan progress */}
                                <div className="mb-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[9px] tracking-[0.15em] uppercase text-white/25">
                                            Scan Progress
                                        </span>
                                        <span className="text-[9px] font-mono font-bold" style={{ color: activeColor }}>
                                            {(countdown * 0.5).toFixed(1)}s left
                                        </span>
                                    </div>
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-[width] duration-500 linear"
                                            style={{ backgroundColor: activeColor, width: `${countdownProgress}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Top 3 expression bars */}
                                <div className="space-y-1">
                                    {Object.entries(allExpressions)
                                        .sort(([, a], [, b]) => b - a)
                                        .slice(0, 3)
                                        .map(([expr, val]) => (
                                            <div key={expr} className="flex items-center gap-2">
                                                <span className="text-[9px] tracking-[0.1em] uppercase text-white/30 w-16 text-right">
                                                    {expr}
                                                </span>
                                                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <motion.div
                                                        className="h-full rounded-full"
                                                        style={{ backgroundColor: EMOTION_COLORS[expr] || '#666' }}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${val}%` }}
                                                        transition={{ duration: 0.3 }}
                                                    />
                                                </div>
                                                <span className="text-[9px] font-mono text-white/30 w-8">{val}%</span>
                                            </div>
                                        ))}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="text-center py-1">
                                <p className="text-xs text-white/30">
                                    {isLoading ? 'Starting camera & AI models...' :
                                        isDetecting ? 'Looking for a face...' : 'Position your face in the frame'}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Action area */}
                    <div className="mt-3">
                        {isDetecting ? (
                            <div className="flex items-center justify-center gap-3 py-1">
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(i => (
                                        <motion.span
                                            key={i}
                                            className="w-1.5 h-1.5 rounded-full"
                                            style={{ backgroundColor: activeColor }}
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                                        />
                                    ))}
                                </div>
                                <span className="text-[10px] tracking-[0.2em] uppercase font-bold"
                                    style={{ color: activeColor }}>
                                    Analyzing...
                                </span>
                                <button
                                    onClick={handleStopDetect}
                                    className="ml-2 px-3 py-1 rounded-full text-[9px] tracking-wider uppercase border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all font-bold"
                                >
                                    Stop
                                </button>
                            </div>
                        ) : (
                            <motion.button
                                onClick={handleStartDetect}
                                disabled={isLoading || !!cameraError}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.95 }}
                                className="w-full py-3 rounded-xl text-sm font-black tracking-[0.2em] uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                style={{
                                    background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                                    color: '#000',
                                    boxShadow: '0 0 20px rgba(0, 255, 136, 0.2)',
                                }}
                            >
                                Restart Detection
                            </motion.button>
                        )}
                    </div>
                </div>
            </div>
        </motion.div >
    );
}
