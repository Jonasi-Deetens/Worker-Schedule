/**
 * Geospatial helpers used by optional geofenced clock-in. Pure functions with
 * no I/O so they are trivially unit-testable and reusable on both edges.
 */

const EARTH_RADIUS_M = 6_371_000;

export interface LatLng {
  lat: number;
  lng: number;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two WGS-84 points in metres (haversine
 * formula). Accurate to well within the few-metre tolerance a geofence cares
 * about.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when `point` is within `radiusMeters` of `center`. */
export function isWithinRadius(
  center: LatLng,
  point: LatLng,
  radiusMeters: number,
): boolean {
  return haversineMeters(center, point) <= radiusMeters;
}
