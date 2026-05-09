/**
 * RecentSearches.tsx — Phase 5: Spotify-style recent searches dropdown.
 *
 * Shown below the Search input when:
 *   - Input is focused
 *   - Input is empty (query.length === 0)
 *
 * Design tokens used:
 *   - Background: bg-card (hsl(var(--card))) = dark surface
 *   - Hover: bg-accent (hsl(var(--accent)))
 *   - Border: border-white/10 (white border, per design spec)
 *   - Accent: text-primary (teal) for "Clear all"
 *   - Transition: 180ms cubic-bezier(0.16, 1, 0.3, 1)
 *   - Touch targets: min 44×44px
 *   - Radius: rounded-2xl (cards), rounded-full (icon buttons)
 *
 * Authentication: The history endpoints require Clerk auth. When signed out,
 * the component is not rendered (checked in Search.tsx).
 */

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Clock, X } from "lucide-react";
import { api } from "@/lib/api";

interface RecentSearchesProps {
  /** Called when the user clicks a history item — fills the input + triggers search */
  onSelect: (term: string) => void;
  /** Visibility controlled by parent (focused && empty) */
  visible: boolean;
}

export function RecentSearches({ onSelect, visible }: RecentSearchesProps) {
  const queryClient = useQueryClient();

  // Fetch the last 8 search terms — uses GET /api/search/history.
  // `enabled: visible` ensures the query only fires when the dropdown is
  // actually shown, which guarantees auth is ready (Search.tsx gates on
  // isSignedIn). Without this guard, the query fires before auth is
  // initialized → 401 → cached error → data stays [] forever.
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["searchHistory"],
    queryFn: () => api.getSearchHistory(),
    enabled: visible,
    staleTime: 5_000,
    refetchOnMount: "always" as const,
  });

  // Delete one term — uses DELETE /api/search/history/:term
  const deleteMutation = useMutation({
    mutationFn: (term: string) => api.deleteSearchHistory(term),
    onMutate: async (term) => {
      // Optimistic remove
      await queryClient.cancelQueries({ queryKey: ["searchHistory"] });
      const prev = queryClient.getQueryData<Array<{ term: string; searched_at: string }>>(["searchHistory"]);
      queryClient.setQueryData<Array<{ term: string; searched_at: string }>>(
        ["searchHistory"],
        (old = []) => old.filter((h) => h.term !== term)
      );
      return { prev };
    },
    onError: (_err, _term, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["searchHistory"], ctx.prev);
    },
  });

  // Clear all — uses DELETE /api/search/history
  const clearMutation = useMutation({
    mutationFn: () => api.clearSearchHistory(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["searchHistory"] });
      queryClient.setQueryData(["searchHistory"], []);
    },
  });

  const handleDelete = useCallback(
    (e: React.MouseEvent, term: string) => {
      e.stopPropagation();
      e.preventDefault();
      deleteMutation.mutate(term);
    },
    [deleteMutation]
  );

  // Ensure AnimatePresence is always mounted so exit animations play.
  // We only show the dropdown if visible AND (loading or has items).
  const shouldShow = visible && (isLoading || history.length > 0);

  return (
    <AnimatePresence>
      {shouldShow && (
      <motion.div
        key="recent-searches"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className={[
          // Surface — matches dark card background
          "bg-card border border-white/10",
          // Shape
          "rounded-2xl overflow-hidden",
          // Layout
          "mb-6",
          // Subtle shadow
          "shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
        ].join(" ")}
        // Prevent the input blur from firing before click is processed
        onMouseDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Recent Searches
          </span>
          <button
            onClick={() => clearMutation.mutate()}
            className="text-xs font-medium text-primary hover:text-primary/70 transition-colors duration-[180ms] py-1 px-2 rounded-full hover:bg-primary/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Clear all search history"
          >
            Clear all
          </button>
        </div>

        {/* History items */}
        <ul role="listbox" aria-label="Recent searches">
          {history.map(({ term }) => (
            <li key={term} role="option" aria-selected={false}>
              <div
                className={[
                  "flex items-center gap-3 px-4 py-2",
                  "hover:bg-accent transition-colors duration-[180ms]",
                  "cursor-pointer",
                ].join(" ")}
                onClick={() => onSelect(term)}
              >
                {/* Clock icon */}
                <Clock
                  size={15}
                  className="flex-none text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />

                {/* Term text */}
                <span className="flex-1 text-sm text-primary-foreground font-light truncate">
                  {term}
                </span>

                {/* Remove button — must be ≥ 44×44 touch target */}
                <button
                  onClick={(e) => handleDelete(e, term)}
                  className="flex-none w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 border border-white/0 hover:border-white/20 transition-all duration-[180ms]"
                  aria-label={`Remove "${term}" from history`}
                >
                  <X size={14} className="text-muted-foreground" strokeWidth={2} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
