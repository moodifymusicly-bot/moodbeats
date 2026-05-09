import { motion } from "framer-motion";
import { Link } from "wouter";
import { Logo } from "@/components/layout/Logo";
import { SiYoutube, SiSpotify } from "react-icons/si";
import { ScanFace, Music2, Heart } from "lucide-react";

const HOW_IT_WORKS = [
  {
    icon: ScanFace,
    title: "Read the room.",
    body: "A quick glance from your camera is all it takes. We pick up on the subtle cues your face is already telling.",
  },
  {
    icon: Heart,
    title: "Score the moment.",
    body: "Your mood becomes a signature — a temperature, a texture. Every track we choose answers it.",
  },
  {
    icon: Music2,
    title: "Stay in the feeling.",
    body: "Music keeps tracking with you. As your mood shifts, the soundtrack shifts with it.",
  },
];

export default function Landing() {
  return (
    <div className="relative h-[100dvh] overflow-y-auto w-full overflow-x-hidden flex flex-col items-center px-6 pt-12 pb-16">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background pointer-events-none" />
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/3 right-1/4 w-72 h-72 bg-primary/10 rounded-full blur-[80px] pointer-events-none"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      {/* Hero — centered prominent logo */}
      <motion.div
        className="relative z-10 w-full flex flex-col items-center pt-12 pb-16"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
      >
        <Logo size="xl" noLink />
      </motion.div>

      {/* Tagline */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <h1 className="text-4xl font-light tracking-tight text-primary-foreground mb-4 leading-tight">
            Listen to<br />
            <span className="font-semibold">how you feel.</span>
          </h1>
          <p className="text-muted-foreground font-light text-base">
            A quiet companion that scores your life in real time.
          </p>
        </motion.div>

        {/* CTAs */}
        <motion.div
          className="w-full space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <Link href="/mood-detect" className="block w-full">
            <button className="w-full relative overflow-hidden group neumorphic-button rounded-2xl py-4 px-8 text-primary-foreground font-medium text-lg transition-transform hover:scale-[1.02] active:scale-[0.98]">
              <div className="absolute inset-0 bg-primary/10 group-hover:bg-primary/20 transition-colors" />
              <span className="relative">Detect Your Vibe</span>
            </button>
          </Link>

          <div className="flex gap-4 w-full">
            <Link href="/home" className="flex-1">
              <button className="w-full glass-panel rounded-2xl py-3 px-4 text-muted-foreground hover:text-primary-foreground font-medium text-sm transition-all hover:bg-white/5 active:scale-[0.98]">
                Choose Mood
              </button>
            </Link>
            <Link href="/home" className="flex-1">
              <button className="w-full glass-panel rounded-2xl py-3 px-4 text-muted-foreground hover:text-primary-foreground font-medium text-sm transition-all hover:bg-white/5 active:scale-[0.98]">
                Guest Mode
              </button>
            </Link>
          </div>
        </motion.div>

        {/* Source badges */}
        <motion.div
          className="pt-4 flex items-center gap-6 text-muted-foreground/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
        >
          <div className="flex items-center gap-2">
            <SiSpotify size={18} />
            <span className="text-xs font-medium tracking-wider uppercase">Spotify</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center gap-2">
            <SiYoutube size={18} />
            <span className="text-xs font-medium tracking-wider uppercase">YouTube</span>
          </div>
        </motion.div>
      </div>

      {/* How it works */}
      <motion.section
        className="relative z-10 w-full max-w-md mt-24 space-y-8"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8 }}
      >
        <div className="text-center space-y-2">
          <p className="text-xs font-medium tracking-[0.3em] uppercase text-primary/80">How it works</p>
          <h2 className="text-2xl font-light text-primary-foreground">Three steps. No friction.</h2>
        </div>

        <div className="space-y-4">
          {HOW_IT_WORKS.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="glass-panel rounded-2xl p-5 flex gap-4 items-start"
            >
              <div className="flex-none w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <item.icon size={20} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-primary-foreground font-medium text-sm mb-1">{item.title}</h3>
                <p className="text-muted-foreground text-xs font-light leading-relaxed">{item.body}</p>
              </div>
              <div className="text-muted-foreground/40 text-xs font-mono pt-1">0{i + 1}</div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* About */}
      <motion.section
        className="relative z-10 w-full max-w-md mt-16 space-y-4"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8 }}
      >
        <div className="text-center space-y-2">
          <p className="text-xs font-medium tracking-[0.3em] uppercase text-primary/80">About</p>
          <h2 className="text-2xl font-light text-primary-foreground">Made for the late-night listener.</h2>
        </div>
        <p className="text-muted-foreground font-light text-sm text-center leading-relaxed">
          MoodBeatz is a small, intimate music companion. It listens before you do — to the way
          you carry yourself, the weight of the day, the silence between songs — and gives you
          back a soundtrack that feels like it was waiting for you.
        </p>
        <p className="text-muted-foreground/60 font-light text-xs text-center pt-4">
          Placeholder copy — edit me later.
        </p>
      </motion.section>

      {/* Footer */}
      <motion.footer
        className="relative z-10 w-full max-w-md mt-16 pt-8 border-t border-white/5 flex items-center justify-between text-muted-foreground/50 text-xs font-light"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <span className="tracking-wider">MOODBEATZ · 2026</span>
        <span>v0.1 · preview</span>
      </motion.footer>
    </div>
  );
}
