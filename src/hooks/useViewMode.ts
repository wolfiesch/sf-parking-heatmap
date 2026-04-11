import { useState, useCallback } from "react";
import type { ViewMode } from "../types";

export function useViewMode(initial: ViewMode = "parking") {
  const [mode, setModeState] = useState<ViewMode>(initial);

  const setMode = useCallback((m: ViewMode) => {
    setModeState(m);
  }, []);

  return { mode, setMode };
}
