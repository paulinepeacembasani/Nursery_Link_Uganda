import { unwrap, type Schemas } from '@nurserylink/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { LatLng } from '../../lib/geo';
import type { NurseryParams } from './params';

export type NurseryProps = Schemas['NurseryFeatureCollection']['features'][number]['properties'];
/** As openapi-fetch delivers it (its response types widen coordinate tuples to number[]) */
export interface NurseryFeature {
  id: string;
  geometry: { type: 'Point'; coordinates: number[] };
  properties: NurseryProps;
}

/** [lng, lat] of a GeoJSON position, in Leaflet's [lat, lng] order. */
export const toLatLng = (coordinates: number[]): [number, number] => [coordinates[1] ?? 0, coordinates[0] ?? 0];
export type NurserySummary = Schemas['NurserySummary'];
export type DistanceMode = 'road' | 'straight_line';

const filterQuery = (p: NurseryParams) => ({
  ...(p.q.trim().length >= 1 ? { q: p.q.trim() } : {}),
  ...(p.district ? { district_id: p.district } : {}),
  ...(p.subCounty ? { sub_county_id: p.subCounty } : {}),
  ...(p.species ? { species: p.species } : {}),
  ...(p.category ? { category: p.category } : {}),
});

/**
 * Every nursery matching the filters as GeoJSON: one request feeds both the map and the
 * alphabetical list (and the service worker keeps the last answer for offline use). With the
 * user's position, each nursery also carries its straight-line distance.
 */
export const useNurseryMap = (p: NurseryParams, position: LatLng | null) =>
  useQuery({
    queryKey: ['nurseries', 'map', filterQuery(p), position],
    queryFn: async () => {
      const result = await unwrap(api.GET('/nurseries', { params: { query: { format: 'geojson', ...filterQuery(p), ...(position ?? {}) } } }));
      const data = result.data;
      if (!('features' in data)) throw new Error('Expected GeoJSON from /nurseries?format=geojson');
      return { ...result, data };
    },
    placeholderData: keepPreviousData,
  });

/**
 * The nearest nurseries by road (the API ranks the 20 closest by straight line, then by road).
 * Loaded whenever the location is known, not only for "Sort by nearest", so the alphabetical list
 * and the map pins show road distances for the nurseries close enough to matter.
 */
export const useNearest = (p: NurseryParams, position: LatLng | null) =>
  useQuery({
    queryKey: ['nurseries', 'nearest', filterQuery(p), position],
    enabled: position !== null,
    queryFn: async () => {
      if (!position) throw new Error('No position');
      const result = await unwrap(api.GET('/nurseries', { params: { query: { ...filterQuery(p), sort: 'nearest', limit: 20, ...position } } }));
      if (!Array.isArray(result.data)) throw new Error('Expected a list from /nurseries');
      const meta = result.meta as { distance_mode?: DistanceMode; total: number } | undefined;
      return { ...result, data: result.data, distanceMode: meta?.distance_mode ?? 'road' };
    },
    placeholderData: keepPreviousData,
  });

export const useDistricts = () =>
  useQuery({
    queryKey: ['boundaries', 'district'],
    queryFn: async () => (await unwrap(api.GET('/boundaries', { params: { query: { level: 'district' } } }))).data,
    staleTime: 24 * 60 * 60_000,
  });

export const useSubCounties = (districtId: string | null) =>
  useQuery({
    queryKey: ['boundaries', 'sub_county', districtId],
    enabled: districtId !== null,
    queryFn: async () => (await unwrap(api.GET('/boundaries', { params: { query: { level: 'sub_county', parent_id: districtId ?? undefined } } }))).data,
    staleTime: 24 * 60 * 60_000,
  });

/** A district or sub-county outline (for highlighting on the map). */
export const useBoundaryShape = (id: string | null) =>
  useQuery({
    queryKey: ['boundaries', 'shape', id],
    enabled: id !== null,
    queryFn: async () => (await unwrap(api.GET('/boundaries/{id}/geojson', { params: { path: { id: id ?? '' } } }))).data,
    staleTime: 24 * 60 * 60_000,
  });

export const useNurseryProfile = (id: string | null, position: LatLng | null) =>
  useQuery({
    queryKey: ['nurseries', 'profile', id, position],
    enabled: id !== null,
    queryFn: async () => unwrap(api.GET('/nurseries/{id}', { params: { path: { id: id ?? '' }, query: position ?? {} } })),
  });

/** Driving route from the user to a nursery (FR-11). */
export const useRoute = (id: string | null, position: LatLng | null, enabled: boolean) =>
  useQuery({
    queryKey: ['nurseries', 'route', id, position],
    enabled: enabled && id !== null && position !== null,
    queryFn: async () => (await unwrap(api.GET('/nurseries/{id}/route', { params: { path: { id: id ?? '' }, query: position ?? { lat: 0, lng: 0 } } }))).data,
    retry: false,
  });

/** A Library entry, for the side drawer opened from a nursery's stock list (FR-21). */
export const useSpecies = (slug: string | null) =>
  useQuery({
    queryKey: ['species', slug],
    enabled: slug !== null,
    queryFn: async () => (await unwrap(api.GET('/species/{slug}', { params: { path: { slug: slug ?? '' } } }))).data,
    staleTime: 60 * 60_000,
  });
