import { motion } from "framer-motion";
import { Link } from "wouter";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  linkTo?: string;
  noLink?: boolean;
}

const SIZES = {
  sm: { box: "w-7 h-7", barsH: "h-4", barW: "w-[3px]", gap: "gap-[3px]", text: "text-xs", glow: "blur-md" },
  md: { box: "w-9 h-9", barsH: "h-5", barW: "w-1", gap: "gap-1", text: "text-sm", glow: "blur-md" },
  lg: { box: "w-16 h-16", barsH: "h-10", barW: "w-1.5", gap: "gap-1.5", text: "text-lg", glow: "blur-xl" },
  xl: { box: "w-24 h-24", barsH: "h-16", barW: "w-2", gap: "gap-2", text: "text-2xl", glow: "blur-2xl" },
};

export const Logo = ({
  className = "",
  size = "md",
  showWordmark = true,
  linkTo = "/landing",
  noLink = false,
}: LogoProps) => {
  const s = SIZES[size];

  const inner = (
    <div className={`flex items-center ${size === "xl" || size === "lg" ? "flex-col gap-3" : "gap-3"} ${className}`}>
      <div className={`relative flex items-center justify-center ${s.box}`}>
        {/* Glow */}
        <div className={`absolute inset-0 bg-primary/30 ${s.glow} rounded-full`} />
        <div className={`absolute inset-0 bg-primary/10 ${s.glow} rounded-full scale-150`} />

        {/* Equalizer bars */}
        <div className={`relative flex items-end ${s.gap} ${s.barsH}`}>
          <motion.div
            className={`${s.barW} bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))]`}
            animate={{ height: ["40%", "100%", "40%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className={`${s.barW} bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))]`}
            animate={{ height: ["80%", "30%", "80%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          />
          <motion.div
            className={`${s.barW} bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))]`}
            animate={{ height: ["50%", "90%", "50%"] }}
            transition={{ duration: 1.0, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          />
          <motion.div
            className={`${s.barW} bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))]`}
            animate={{ height: ["100%", "40%", "100%"] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
          />
        </div>
      </div>
      {showWordmark && (
        <span
          className={`font-sans font-semibold tracking-[0.3em] ${s.text} text-primary-foreground/95`}
        >
          MOODBEATZ
        </span>
      )}
    </div>
  );

  if (noLink) return inner;

  return (
    <Link href={linkTo} className="inline-flex cursor-pointer hover:opacity-80 transition-opacity">
      {inner}
    </Link>
  );
};
