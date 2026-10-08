import type { GeoJsonLineString, LatLng } from '../../lib/geo.js';

export interface RouteStep {
  instruction: string;
  road: string | null;
  distance_m: number;
  duration_s: number;
}

/** Sample points reachable by road within `km` of the origin (the origin included). */
export interface IsochroneSamples {
  km: number;
  points: LatLng[];
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  geometry: GeoJsonLineString;
  steps: RouteStep[];
}

/**
 * Road routing. Implementations: Osrm (self-hosted, car profile), OpenRouteService (hosted API on
 * OpenStreetMap roads) and MockRouting (straight line × 1.3).
 */
export interface RoutingProvider {
  readonly name: 'mock' | 'osrm' | 'openrouteservice';
  /** Turn-by-turn route between two points. Throws ProviderUnavailableError if no route can be computed. */
  route(from: LatLng, to: LatLng): Promise<RouteResult>;
  /** Road distance in km from one origin to many destinations; null where a destination is unreachable. */
  table(from: LatLng, to: LatLng[]): Promise<(number | null)[]>;
  /**
   * Service areas: for each distance in `kms`, the sampled points reachable by road within it.
   * Polygons are built from these with a concave hull in PostGIS (ST_ConcaveHull), which is why
   * this returns points and the caller, which has the database, draws the shape.
   */
  isochrone(origin: LatLng, kms: number[]): Promise<IsochroneSamples[]>;
}
