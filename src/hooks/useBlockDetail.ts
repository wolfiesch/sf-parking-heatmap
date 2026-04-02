import { useState, useEffect } from "react";
import { fetchSoda, DATASETS } from "../lib/soda";
import type { BlockDetail } from "../types";

/** SODA dow (1=Sun..7=Sat) -> ISO dow (0=Mon..6=Sun) */
const SODA_DOW_TO_ISO: Record<number, number> = {
  1: 6, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5,
};

const AVG_SESSION_HOURS = 1.2;
const COMPLIANCE_FACTOR = 1.33;

interface SodaRow {
  dow: string;
  hour: string;
  sessions: string;
}

export function useBlockDetail(
  blockId: string | null,
  meters: number,
  street: string,
) {
  const [detail, setDetail] = useState<BlockDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!blockId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    const weeks = 90 / 7;

    fetchSoda<SodaRow>({
      dataset: DATASETS.METER_TRANSACTIONS,
      select: [
        "date_extract_dow(session_start_dt) AS dow",
        "date_extract_hh(session_start_dt) AS hour",
        "count(*) AS sessions",
      ].join(","),
      where: `street_block='${blockId}' AND session_start_dt>'${since}'`,
      group: "dow,hour",
      order: "dow,hour",
      limit: 200,
    })
      .then((rows) => {
        if (cancelled) return;

        const slots = new Array<number>(168).fill(0);
        const sessionCounts = new Array<number>(168).fill(0);

        for (const row of rows) {
          const sodaDow = parseInt(row.dow);
          const hour = parseInt(row.hour);
          const sessions = parseInt(row.sessions);

          const isoDow = SODA_DOW_TO_ISO[sodaDow];
          if (isoDow === undefined || hour < 0 || hour > 23) continue;

          const idx = isoDow * 24 + hour;
          sessionCounts[idx] = sessions;

          if (meters > 0) {
            const sessionsPerWeek = sessions / weeks;
            const raw = (sessionsPerWeek * AVG_SESSION_HOURS * COMPLIANCE_FACTOR) / meters;
            slots[idx] = Math.min(1.0, raw);
          }
        }

        setDetail({ blockId, street, meters, slots, sessionCounts });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch block detail");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [blockId, meters, street]);

  return { detail, loading, error };
}
