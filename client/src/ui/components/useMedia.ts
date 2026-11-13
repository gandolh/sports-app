import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, read synchronously so the first paint is
 * already the right layout.
 *
 * `matchMedia` is missing where nothing draws (the test environment), and the
 * answer there is "no", which is the phone layout. It is used where the markup
 * itself differs by width: the top bar against the bottom bar, the Start card
 * against the footer. That is one set of controls in the document at a time, so
 * a control is never announced twice and a test finds exactly one. Everything
 * that only changes size stays in the stylesheet.
 */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

/** 840px and wider: the top bar, and the two-column screens. */
export function useWide(): boolean {
  return useMedia("(min-width: 840px)");
}

/** A phone at least 900px tall: the Easier and Harder sentence moves into the footer. */
export function useTall(): boolean {
  return useMedia("(min-height: 900px)");
}
