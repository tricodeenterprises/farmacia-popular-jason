import { useEffect, useRef, useCallback, useState } from "react";

const EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];

/**
 * Hook that signs the user out after `timeoutMs` of inactivity.
 * Shows a warning `warningMs` before logout.
 */
export function useInactivityTimeout(
  signOut: () => Promise<void>,
  timeoutMs = 30 * 60 * 1000, // 30 minutes
  warningMs = 2 * 60 * 1000   // warn 2 min before
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timerRef.current = null;
    warningTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const resetTimer = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);

    // Set warning timer
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      const secs = Math.floor(warningMs / 1000);
      setRemainingSeconds(secs);
      let remaining = secs;
      countdownRef.current = setInterval(() => {
        remaining--;
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
        }
      }, 1000);
    }, timeoutMs - warningMs);

    // Set logout timer
    timerRef.current = setTimeout(() => {
      setShowWarning(false);
      signOut();
    }, timeoutMs);
  }, [clearAllTimers, signOut, timeoutMs, warningMs]);

  const dismissWarning = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    resetTimer();

    const handler = () => {
      // Only reset if warning is not showing (user interaction dismisses warning separately)
      resetTimer();
    };

    EVENTS.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    return () => {
      clearAllTimers();
      EVENTS.forEach((e) => window.removeEventListener(e, handler));
    };
  }, [resetTimer, clearAllTimers]);

  return { showWarning, remainingSeconds, dismissWarning };
}
