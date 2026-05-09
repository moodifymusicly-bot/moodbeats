import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── YouTube Thumbnail helpers ────────────────────────────────────────────────
//
// YouTube exposes several thumbnail sizes for each video ID:
//   default.jpg    — 120×90  (4:3, has black bars)
//   hqdefault.jpg  — 480×360 (4:3, has black bars)  ← the problematic one
//   mqdefault.jpg  — 320×180 (16:9, NO bars)         ← we always use this
//   maxresdefault  — 1280×720 (16:9, but not always available)
//
// We default to mqdefault because it is the smallest guaranteed true 16:9
// image, so card thumbnails, player art and search results never show bars.

/** Build a guaranteed bar-free 16:9 YouTube thumbnail URL. */
export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

/**
 * Rewrite any YouTube thumbnail URL to mqdefault.jpg (320×180, true 16:9).
 *
 * YouTube's thumbnail API exposes several sizes, and many of them have
 * baked-in black bars (4:3 aspect ratio):
 *   - default.jpg     — 120×90  (4:3, black bars)
 *   - hqdefault.jpg   — 480×360 (4:3, black bars)
 *   - sddefault.jpg   — 640×480 (4:3, black bars)
 *   - 0.jpg … 3.jpg   — 480×360 (4:3, black bars)
 *
 * Only mqdefault.jpg (320×180) and maxresdefault.jpg (1280×720) are true
 * 16:9 with no bars. We rewrite to mqdefault because it is universally
 * available (maxresdefault is not always present).
 *
 * The regex matches the filename portion of any /vi/{id}/{name}.jpg URL.
 */
export function normalizeYouTubeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  // Match YouTube thumbnail filenames that produce 4:3 images with black bars
  return url.replace(
    /\/(default|hqdefault|sddefault|[0-3])\.jpg/,
    "/mqdefault.jpg"
  );
}
