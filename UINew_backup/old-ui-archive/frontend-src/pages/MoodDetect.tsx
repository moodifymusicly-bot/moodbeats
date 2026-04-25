import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Logo } from "@/components/layout/Logo";
import { MOODS } from "@/lib/mock-data";
import { usePlayer } from "@/lib/PlayerContext";

const ANALYSIS_LABELS = [
  "Reading micro-expressions",
  "Decoding tonal weight",
  "Mapping emotional signature",
  "Composing a soundtrack",
];

export default function MoodDetect() {
  const [, setLocation] = useLocation();
  const { setDetectedMood } = usePlayer();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"initializing" | "preview" | "analyzing" | "result" | "error">("initializing");
  const [result, setResult] = useState<string | null>(null);
  const [labelIdx, setLabelIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const str = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        activeStream = str;
        setStream(str);
        if (videoRef.current) {
          videoRef.current.srcObject = str;
        }
        setStatus("preview");

        setTimeout(() => {
          setStatus("analyzing");
        }, 1800);
      } catch (err) {
        console.error("Camera access denied", err);
        setStatus("error");
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (status !== "analyzing") return;

    const start = Date.now();
    const total = 2500;
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / total) * 100);
      setProgress(pct);
      const idx = Math.min(ANALYSIS_LABELS.length - 1, Math.floor((elapsed / total) * ANALYSIS_LABELS.length));
      setLabelIdx(idx);
    }, 50);

    const timer = setTimeout(() => {
      clearInterval(tick);
      const randomMood = MOODS[Math.floor(Math.random() * MOODS.length)];
      setResult(randomMood);
      setStatus("result");
      setDetectedMood(randomMood);

      setTimeout(() => {
        setLocation("/mood-playlist");
      }, 2200);
    }, total);

    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [status, setLocation, setDetectedMood]);

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden flex flex-col px-6 py-8">
      <div className="absolute inset-0 bg-background" />

      {/* Ambient pulse during analysis */}
      <AnimatePresence>
        {status === "analyzing" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none"
          >
            <motion.div
              className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full bg-primary/20 blur-[120px]"
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex justify-between items-center mb-8">
        <Logo size="sm" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {status === "error" ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <div className="w-64 h-80 rounded-3xl glass-panel flex flex-col items-center justify-center p-6 text-center space-y-4 mb-8">
                <p className="text-muted-foreground font-light">Camera unavailable</p>
                <p className="text-muted-foreground/60 text-xs font-light">
                  Allow camera access in your browser, or pick a mood manually.
                </p>
              </div>
              <button
                onClick={() => setLocation("/home")}
                className="glass-panel px-6 py-3 rounded-xl text-primary-foreground font-medium"
              >
                Choose a mood instead
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="camera"
              className="flex flex-col items-center w-full max-w-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="relative w-full aspect-[3/4] rounded-3xl overflow-hidden mb-8">
                {/* Camera feed */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />

                {/* Soft vignette */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" />
                <div className="absolute inset-0 bg-black/15" />

                {/* Corner brackets */}
                {["top-3 left-3 border-l-2 border-t-2", "top-3 right-3 border-r-2 border-t-2", "bottom-3 left-3 border-l-2 border-b-2", "bottom-3 right-3 border-r-2 border-b-2"].map((cls) => (
                  <motion.div
                    key={cls}
                    className={`absolute w-6 h-6 ${cls} border-primary rounded-md`}
                    animate={{ opacity: status === "analyzing" ? [0.4, 1, 0.4] : 0.5 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  />
                ))}

                {/* Scanning line */}
                {status === "analyzing" && (
                  <motion.div
                    className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_18px_hsl(var(--primary))]"
                    animate={{ top: ["0%", "100%", "0%"] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}

                {/* Floating analysis particles */}
                {status === "analyzing" &&
                  Array.from({ length: 18 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 rounded-full bg-primary/80 shadow-[0_0_6px_hsl(var(--primary))]"
                      initial={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        opacity: 0,
                      }}
                      animate={{
                        opacity: [0, 0.9, 0],
                        scale: [0.5, 1.4, 0.5],
                      }}
                      transition={{
                        duration: 1.6 + Math.random() * 1.2,
                        repeat: Infinity,
                        delay: Math.random() * 2,
                        ease: "easeInOut",
                      }}
                    />
                  ))}

                {/* Frame border */}
                <div className="absolute inset-0 border border-white/10 rounded-3xl" />
                <motion.div
                  className="absolute inset-0 border-2 border-primary/40 rounded-3xl"
                  animate={{ opacity: status === "analyzing" ? [0.2, 0.8, 0.2] : 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />

                {/* Result overlay */}
                <AnimatePresence>
                  {status === "result" && result && (
                    <motion.div
                      className="absolute inset-0 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center gap-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <motion.p
                        className="text-xs font-medium tracking-[0.3em] uppercase text-primary/80"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                      >
                        Your vibe is
                      </motion.p>
                      <motion.h2
                        className="text-4xl font-medium tracking-wide text-primary-foreground"
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2, type: "spring" }}
                      >
                        {result}
                      </motion.h2>
                      <motion.div
                        className="w-12 h-[2px] bg-primary mt-2"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Progress + label */}
              <div className="w-full space-y-3">
                <div className="h-12 flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    {status === "initializing" && (
                      <motion.p
                        key="init"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-muted-foreground font-light text-sm"
                      >
                        Waking up the sensors…
                      </motion.p>
                    )}
                    {status === "preview" && (
                      <motion.p
                        key="prev"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-primary/80 font-light text-sm"
                      >
                        Looking at you…
                      </motion.p>
                    )}
                    {status === "analyzing" && (
                      <motion.p
                        key={`anal-${labelIdx}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-primary font-medium text-sm tracking-wide"
                      >
                        {ANALYSIS_LABELS[labelIdx]}…
                      </motion.p>
                    )}
                    {status === "result" && (
                      <motion.p
                        key="res"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-muted-foreground font-light text-sm"
                      >
                        Scoring your moment.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Equalizer-style progress */}
                {status === "analyzing" && (
                  <div className="w-full">
                    <div className="flex items-end justify-center gap-[3px] h-8">
                      {Array.from({ length: 32 }).map((_, i) => {
                        const reached = (i / 32) * 100 < progress;
                        return (
                          <motion.div
                            key={i}
                            className={`w-1 rounded-full ${reached ? "bg-primary" : "bg-white/10"}`}
                            animate={{
                              height: reached
                                ? [
                                    `${20 + Math.random() * 60}%`,
                                    `${30 + Math.random() * 70}%`,
                                    `${20 + Math.random() * 60}%`,
                                  ]
                                : "20%",
                            }}
                            transition={{
                              duration: 0.6,
                              repeat: reached ? Infinity : 0,
                              ease: "easeInOut",
                              delay: i * 0.02,
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-3 h-[2px] w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.1, ease: "linear" }}
                      />
                    </div>
                    <p className="mt-2 text-center text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60">
                      {Math.round(progress)}%
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
