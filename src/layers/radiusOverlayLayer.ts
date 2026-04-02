import { ScatterplotLayer } from "deck.gl";

interface RadiusCenter {
  lng: number;
  lat: number;
}

export function createRadiusOverlayLayer(center: RadiusCenter, radiusMeters: number) {
  return new ScatterplotLayer({
    id: "search-radius",
    data: [center],
    getPosition: (d: RadiusCenter) => [d.lng, d.lat],
    getRadius: radiusMeters,
    getFillColor: [59, 130, 246, 25],
    getLineColor: [59, 130, 246, 120],
    stroked: true,
    lineWidthMinPixels: 1.5,
    radiusUnits: "meters" as const,
    pickable: false,
  });
}
