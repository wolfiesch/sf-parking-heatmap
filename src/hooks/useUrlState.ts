import { useEffect, useRef, useCallback } from "react";
import type { MapViewState } from "deck.gl";
import type { TimeSlot } from "../types";

/** URL hash keys */
interface UrlParams {
  dow: number;
  hour: number;
  z: number;
  lat: number;
  lng: number;
  p: number; // pitch
  b: number; // bearing
  block: string | null;
  // Search params (Feature 4)
  slat: number | null;
  slng: number | null;
  sr: number | null;
  // Comparison params (Feature 3)
  cmp: number | null;
  rdow: number | null;
  rhour: number | null;
}

function parseHash(): Partial<UrlParams> {
  const hash = window.location.hash.slice(1);
  if (!hash) return {};

  const params: Partial<UrlParams> = {};
  for (const pair of hash.split("&")) {
    const [key, val] = pair.split("=");
    if (!key || val === undefined) continue;

    switch (key) {
      case "dow": params.dow = parseInt(val); break;
      case "hour": params.hour = parseInt(val); break;
      case "z": params.z = parseFloat(val); break;
      case "lat": params.lat = parseFloat(val); break;
      case "lng": params.lng = parseFloat(val); break;
      case "p": params.p = parseFloat(val); break;
      case "b": params.b = parseFloat(val); break;
      case "block": params.block = decodeURIComponent(val); break;
      case "slat": params.slat = parseFloat(val); break;
      case "slng": params.slng = parseFloat(val); break;
      case "sr": params.sr = parseInt(val); break;
      case "cmp": params.cmp = parseInt(val); break;
      case "rdow": params.rdow = parseInt(val); break;
      case "rhour": params.rhour = parseInt(val); break;
    }
  }
  return params;
}

function buildHash(params: UrlParams): string {
  const parts: string[] = [];
  parts.push(`dow=${params.dow}`);
  parts.push(`hour=${params.hour}`);
  parts.push(`z=${params.z.toFixed(2)}`);
  parts.push(`lat=${params.lat.toFixed(5)}`);
  parts.push(`lng=${params.lng.toFixed(5)}`);
  if (params.p !== 0) parts.push(`p=${params.p.toFixed(1)}`);
  if (params.b !== 0) parts.push(`b=${params.b.toFixed(1)}`);
  if (params.block) parts.push(`block=${encodeURIComponent(params.block)}`);
  if (params.slat != null && params.slng != null) {
    parts.push(`slat=${params.slat.toFixed(5)}`);
    parts.push(`slng=${params.slng.toFixed(5)}`);
    if (params.sr != null) parts.push(`sr=${params.sr}`);
  }
  if (params.cmp === 1) {
    parts.push(`cmp=1`);
    if (params.rdow != null) parts.push(`rdow=${params.rdow}`);
    if (params.rhour != null) parts.push(`rhour=${params.rhour}`);
  }
  return "#" + parts.join("&");
}

export interface UrlStateInitial {
  timeSlot?: TimeSlot;
  viewState?: Partial<MapViewState>;
  blockId?: string | null;
  searchLat?: number | null;
  searchLng?: number | null;
  searchRadius?: number | null;
  comparing?: boolean;
  refDow?: number | null;
  refHour?: number | null;
}

/** Parse initial state from URL on mount */
export function getInitialUrlState(): UrlStateInitial {
  const p = parseHash();
  const result: UrlStateInitial = {};

  if (p.dow != null && p.hour != null && !isNaN(p.dow) && !isNaN(p.hour)) {
    result.timeSlot = { dow: p.dow, hour: p.hour };
  }

  if (p.lat != null && p.lng != null && p.z != null && !isNaN(p.lat) && !isNaN(p.lng) && !isNaN(p.z)) {
    result.viewState = {
      latitude: p.lat,
      longitude: p.lng,
      zoom: p.z,
      pitch: p.p ?? 0,
      bearing: p.b ?? 0,
    };
  }

  if (p.block) result.blockId = p.block;

  if (p.slat != null && p.slng != null && !isNaN(p.slat) && !isNaN(p.slng)) {
    result.searchLat = p.slat;
    result.searchLng = p.slng;
    result.searchRadius = p.sr ?? 400;
  }

  if (p.cmp === 1) {
    result.comparing = true;
    result.refDow = p.rdow ?? null;
    result.refHour = p.rhour ?? null;
  }

  return result;
}

interface UrlSyncState {
  timeSlot: TimeSlot;
  viewState: MapViewState;
  selectedBlockId: string | null;
  isPlaying: boolean;
  searchLat?: number | null;
  searchLng?: number | null;
  searchRadius?: number | null;
  comparing?: boolean;
  refDow?: number | null;
  refHour?: number | null;
}

/**
 * Sync app state to URL hash. Debounces continuous changes (pan/zoom),
 * uses pushState for discrete changes (time slot, block selection).
 */
export function useUrlSync(state: UrlSyncState) {
  const debounceRef = useRef<number | null>(null);
  const prevHashRef = useRef<string>("");
  const sourceRef = useRef<"app" | "popstate">("app");

  const writeUrl = useCallback((push: boolean) => {
    const hash = buildHash({
      dow: state.timeSlot.dow,
      hour: state.timeSlot.hour,
      z: state.viewState.zoom,
      lat: state.viewState.latitude,
      lng: state.viewState.longitude,
      p: state.viewState.pitch ?? 0,
      b: state.viewState.bearing ?? 0,
      block: state.selectedBlockId,
      slat: state.searchLat ?? null,
      slng: state.searchLng ?? null,
      sr: state.searchRadius ?? null,
      cmp: state.comparing ? 1 : null,
      rdow: state.refDow ?? null,
      rhour: state.refHour ?? null,
    });

    if (hash === prevHashRef.current) return;
    prevHashRef.current = hash;

    if (push) {
      history.pushState(null, "", hash);
    } else {
      history.replaceState(null, "", hash);
    }
  }, [state]);

  // Debounced URL update: replace for continuous, push for discrete
  useEffect(() => {
    if (state.isPlaying) return; // suppress during playback
    if (sourceRef.current === "popstate") {
      sourceRef.current = "app";
      return;
    }

    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      writeUrl(false); // replaceState for debounced (pan/zoom)
    }, 300);

    return () => {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [state.viewState.zoom, state.viewState.latitude, state.viewState.longitude,
      state.viewState.pitch, state.viewState.bearing, writeUrl, state.isPlaying]);

  // Immediate pushState for discrete changes (time slot, block, search, comparison)
  const prevDiscreteRef = useRef({
    dow: state.timeSlot.dow,
    hour: state.timeSlot.hour,
    block: state.selectedBlockId,
    slat: state.searchLat,
    slng: state.searchLng,
    cmp: state.comparing,
  });

  useEffect(() => {
    if (state.isPlaying) return;
    const prev = prevDiscreteRef.current;
    const changed =
      prev.dow !== state.timeSlot.dow ||
      prev.hour !== state.timeSlot.hour ||
      prev.block !== state.selectedBlockId ||
      prev.slat !== (state.searchLat ?? undefined) ||
      prev.slng !== (state.searchLng ?? undefined) ||
      prev.cmp !== (state.comparing ?? undefined);

    if (changed) {
      prevDiscreteRef.current = {
        dow: state.timeSlot.dow,
        hour: state.timeSlot.hour,
        block: state.selectedBlockId,
        slat: state.searchLat,
        slng: state.searchLng,
        cmp: state.comparing,
      };
      writeUrl(true);
    }
  }, [state.timeSlot.dow, state.timeSlot.hour, state.selectedBlockId,
      state.searchLat, state.searchLng, state.comparing, writeUrl, state.isPlaying]);

  // Handle popstate (browser back/forward)
  useEffect(() => {
    function handlePopstate() {
      sourceRef.current = "popstate";
      // The caller should re-parse the URL state
      // We dispatch a custom event that App can listen to
      window.dispatchEvent(new CustomEvent("urlstatechange"));
    }
    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  }, []);
}
