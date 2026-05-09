export type MoodTheme = {
  hero: string;
  glow: string;
  accent: string;
  caption: string;
};

const DEFAULT_THEME: MoodTheme = {
  hero: "from-primary/30 via-background to-background",
  glow: "bg-primary/30",
  accent: "text-primary",
  caption: "A soundtrack tuned to your moment.",
};

const MOOD_THEMES: Record<string, MoodTheme> = {
  Weightless: {
    hero: "from-sky-400/25 via-background to-background",
    glow: "bg-sky-400/30",
    accent: "text-sky-300",
    caption: "Lift the room. Quiet, open, suspended.",
  },
  Velvet: {
    hero: "from-purple-500/25 via-background to-background",
    glow: "bg-purple-500/30",
    accent: "text-purple-300",
    caption: "Soft, warm, close to the skin.",
  },
  Embered: {
    hero: "from-orange-500/25 via-background to-background",
    glow: "bg-orange-500/30",
    accent: "text-orange-300",
    caption: "Slow burn. Glow without flame.",
  },
  Tide: {
    hero: "from-teal-400/25 via-background to-background",
    glow: "bg-teal-400/30",
    accent: "text-teal-300",
    caption: "Pulled and returned. A patient rhythm.",
  },
  Static: {
    hero: "from-zinc-300/20 via-background to-background",
    glow: "bg-zinc-300/20",
    accent: "text-zinc-200",
    caption: "Texture in the silence.",
  },
  Midnight: {
    hero: "from-indigo-600/30 via-background to-background",
    glow: "bg-indigo-500/30",
    accent: "text-indigo-300",
    caption: "After hours. Eyes adjusting.",
  },
  Drifting: {
    hero: "from-cyan-400/20 via-background to-background",
    glow: "bg-cyan-400/30",
    accent: "text-cyan-300",
    caption: "No anchor. Just current.",
  },
  Electric: {
    hero: "from-yellow-400/20 via-background to-background",
    glow: "bg-yellow-400/30",
    accent: "text-yellow-300",
    caption: "Live wires. Eyes wide.",
  },
  Melancholic: {
    hero: "from-blue-500/25 via-background to-background",
    glow: "bg-blue-500/30",
    accent: "text-blue-300",
    caption: "Tender weight. Honored, not avoided.",
  },
  Lucid: {
    hero: "from-emerald-400/20 via-background to-background",
    glow: "bg-emerald-400/30",
    accent: "text-emerald-300",
    caption: "Clear water. You can see the bottom.",
  },
};

export const getMoodTheme = (mood: string | null): MoodTheme => {
  if (!mood) return DEFAULT_THEME;
  return MOOD_THEMES[mood] ?? DEFAULT_THEME;
};

export const getGreeting = (date: Date = new Date()): string => {
  const h = date.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Late night";
};

/** Raw hex/css colors per mood for the heart save button.
 *
 * Design decision: the saved heart takes the color of the active mood palette
 * rather than a fixed rose — it integrates naturally with the ambient theme.
 * Borders everywhere are white (per design spec). Falls back to white when
 * no mood is detected.
 */
const MOOD_SAVE_COLORS: Record<string, string> = {
  Weightless:   "#7dd3fc", // sky-300
  Velvet:       "#d8b4fe", // purple-300
  Embered:      "#fdba74", // orange-300
  Tide:         "#5eead4", // teal-300
  Static:       "#e4e4e7", // zinc-300
  Midnight:     "#a5b4fc", // indigo-300
  Drifting:     "#67e8f9", // cyan-300
  Electric:     "#fde047", // yellow-300
  Melancholic:  "#93c5fd", // blue-300
  Lucid:        "#6ee7b7", // emerald-300
  // Legacy mood tags
  happy:        "#fde047",
  sad:          "#93c5fd",
  gym:          "#fca5a5",
  study:        "#6ee7b7",
  rock:         "#fca5a5",
};

/**
 * Returns the CSS color to use for the filled heart button.
 * Uses the mood's accent palette color, or white when no mood is active.
 */
export const getMoodSaveColor = (mood: string | null): string => {
  if (!mood) return "#ffffff";
  return MOOD_SAVE_COLORS[mood] ?? "#ffffff";
};
