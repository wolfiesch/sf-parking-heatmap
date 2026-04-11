/**
 * Point-in-polygon utilities using ray-casting algorithm.
 * Used by IsochroneAnalysis to classify which parking blocks
 * fall within each contour ring.
 */

/** Ray-casting test for a single polygon ring (array of [lng, lat] coords) */
function pointInRing(
  lat: number,
  lng: number,
  ring: number[][],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], xi = ring[i][0];
    const yj = ring[j][1], xj = ring[j][0];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Test if a point is inside a GeoJSON Polygon geometry */
function pointInPolygonGeom(
  lat: number,
  lng: number,
  coordinates: number[][][],
): boolean {
  // First ring is exterior, subsequent rings are holes
  if (!pointInRing(lat, lng, coordinates[0])) return false;
  for (let i = 1; i < coordinates.length; i++) {
    if (pointInRing(lat, lng, coordinates[i])) return false;
  }
  return true;
}

/**
 * Test if a point falls inside a GeoJSON Feature with Polygon
 * or MultiPolygon geometry.
 */
export function pointInFeature(
  lat: number,
  lng: number,
  feature: GeoJSON.Feature,
): boolean {
  const geom = feature.geometry;
  if (geom.type === "Polygon") {
    return pointInPolygonGeom(lat, lng, geom.coordinates);
  }
  if (geom.type === "MultiPolygon") {
    for (const polygon of geom.coordinates) {
      if (pointInPolygonGeom(lat, lng, polygon)) return true;
    }
  }
  return false;
}
