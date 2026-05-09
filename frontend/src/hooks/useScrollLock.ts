/**
 * useScrollLock — Antigravity scroll containment (iOS Safari compatible)
 *
 * Problem: iOS Safari rubber-bands the underlying page when a full-screen
 * overlay (player, modal) is open. `overflow: hidden` alone is insufficient
 * because iOS ignores it on `body`. The correct fix is:
 *   1. Record current scrollY.
 *   2. Set `body { position: fixed; top: -scrollY; }` to freeze the viewport.
 *   3. On release, remove the class and restore scrollY.
 *
 * Usage:
 *   // Declarative (React component)
 *   useScrollLock(isPlayerOpen);
 *
 *   // Imperative
 *   import { lockScroll, unlockScroll } from "@/hooks/useScrollLock";
 */

import { useEffect } from "react";

let _savedScrollY = 0;
let _lockCount = 0; // reference count so nested locks stack correctly

/** Imperatively lock the body scroll. Thread-safe for nested use. */
export function lockScroll(): void {
  _lockCount++;
  if (_lockCount > 1) return; // already locked

  _savedScrollY = window.scrollY;
  document.body.classList.add("body-scroll-locked");
  document.body.style.top = `-${_savedScrollY}px`;
}

/** Imperatively unlock. Only actually unlocks when the last caller releases. */
export function unlockScroll(): void {
  if (_lockCount <= 0) return;
  _lockCount--;
  if (_lockCount > 0) return; // still locked by another caller

  document.body.classList.remove("body-scroll-locked");
  document.body.style.top = "";
  // Restore scroll position silently
  window.scrollTo({ top: _savedScrollY, behavior: "instant" as ScrollBehavior });
}

/**
 * React hook — declaratively locks scroll while `active` is true.
 * Automatically unlocks on unmount or when `active` becomes false.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return () => unlockScroll();
  }, [active]);
}
