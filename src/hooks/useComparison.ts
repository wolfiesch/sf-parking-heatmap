import { useState, useCallback, useEffect } from "react";
import type { TimeSlot } from "../types";

export interface ComparisonState {
  comparing: boolean;
  referenceSlot: TimeSlot | null;
}

export function useComparison(initialComparing?: boolean, initialRefDow?: number | null, initialRefHour?: number | null) {
  const [comparing, setComparing] = useState(initialComparing ?? false);
  const [referenceSlot, setReferenceSlot] = useState<TimeSlot | null>(
    initialComparing && initialRefDow != null && initialRefHour != null
      ? { dow: initialRefDow, hour: initialRefHour }
      : null,
  );

  const pinReference = useCallback((slot: TimeSlot) => {
    if (comparing) {
      // Already comparing - toggle off
      setComparing(false);
      setReferenceSlot(null);
    } else {
      // Pin current time as reference
      setReferenceSlot(slot);
      setComparing(true);
    }
  }, [comparing]);

  const exitComparison = useCallback(() => {
    setComparing(false);
    setReferenceSlot(null);
  }, []);

  // Keyboard shortcut: C to toggle comparison, Escape to exit
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape" && comparing) {
        e.preventDefault();
        exitComparison();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [comparing, exitComparison]);

  return {
    comparing,
    referenceSlot,
    pinReference,
    exitComparison,
  };
}
