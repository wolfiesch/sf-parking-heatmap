/** Photon geocoder wrapper with SF bounding box */

const PHOTON_URL = "https://photon.komoot.io/api";
const SF_BBOX = { west: -122.52, south: 37.7, east: -122.35, north: 37.82 };

export interface GeoResult {
  name: string;
  lat: number;
  lng: number;
  type: string; // "house", "street", "city", etc.
}

interface PhotonProperties {
  name?: string;
  street?: string;
  district?: string;
  type?: string;
  osm_value?: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: PhotonProperties;
}

const cache = new Map<string, GeoResult[]>();

export async function geocode(query: string): Promise<GeoResult[]> {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  const params = new URLSearchParams({
    q: query,
    bbox: `${SF_BBOX.west},${SF_BBOX.south},${SF_BBOX.east},${SF_BBOX.north}`,
    limit: "5",
    lang: "en",
    lat: "37.775",
    lon: "-122.42",
  });

  const res = await fetch(`${PHOTON_URL}?${params}`);
  if (!res.ok) return [];

  const data = (await res.json()) as { features?: PhotonFeature[] };
  const results: GeoResult[] = (data.features ?? [])
    .filter((f) => {
      const [lng, lat] = f.geometry.coordinates;
      return lat >= SF_BBOX.south && lat <= SF_BBOX.north &&
             lng >= SF_BBOX.west && lng <= SF_BBOX.east;
    })
    .map((f) => ({
      name: buildDisplayName(f.properties),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      type: f.properties.osm_value ?? f.properties.type ?? "place",
    }));

  cache.set(key, results);
  return results;
}

function buildDisplayName(props: PhotonProperties): string {
  const parts: string[] = [];
  if (props.name) parts.push(props.name);
  if (props.street && props.street !== props.name) parts.push(props.street);
  if (props.district) parts.push(props.district);
  return parts.join(", ") || props.name || "Unknown";
}

/** Haversine distance in meters between two lat/lng points */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
