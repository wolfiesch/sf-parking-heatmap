import { useState, useCallback, useEffect, useRef } from "react";
import type { TimeSlot } from "../types";

const DEFAULT_SPEED = 125; // ms per step (4x)

export function useTimeSlot(initialSlot?: TimeSlot) {
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(
    initialSlot ?? { dow: 2, hour: 14 }, // Default: Wednesday 2pm
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const intervalRef = useRef<number | null>(null);

  const setDow = useCallback((dow: number) => {
    setTimeSlot((prev) => ({ ...prev, dow }));
  }, []);

  const setHour = useCallback((hour: number) => {
    setTimeSlot((prev) => ({ ...prev, hour }));
  }, []);

  const setSlot = useCallback((dow: number, hour: number) => {
    setTimeSlot({ dow, hour });
  }, []);

  const advance = useCallback(() => {
    setTimeSlot((prev) => {
      let nextHour = prev.hour + 1;
      let nextDow = prev.dow;
      if (nextHour > 23) {
        nextHour = 0;
        nextDow = (nextDow + 1) % 7;
      }
      return { dow: nextDow, hour: nextHour };
    });
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Playback interval
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = window.setInterval(advance, speed);
    } else if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, speed, advance]);

  // Keyboard shortcuts: arrow keys for time navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setTimeSlot((prev) => {
            const nextHour = prev.hour + 1;
            return nextHour > 23
              ? { dow: (prev.dow + 1) % 7, hour: 0 }
              : { ...prev, hour: nextHour };
          });
          break;
        case "ArrowLeft":
          e.preventDefault();
          setTimeSlot((prev) => {
            const nextHour = prev.hour - 1;
            return nextHour < 0
              ? { dow: (prev.dow + 6) % 7, hour: 23 }
              : { ...prev, hour: nextHour };
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setTimeSlot((prev) => ({ ...prev, dow: (prev.dow + 6) % 7 }));
          break;
        case "ArrowDown":
          e.preventDefault();
          setTimeSlot((prev) => ({ ...prev, dow: (prev.dow + 1) % 7 }));
          break;
        case " ":
          e.preventDefault();
          setIsPlaying((prev) => !prev);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    timeSlot,
    isPlaying,
    speed,
    setDow,
    setHour,
    setSlot,
    setSpeed,
    togglePlay,
    advance,
  };
}
