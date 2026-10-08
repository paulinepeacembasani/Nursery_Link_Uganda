import 'leaflet/dist/leaflet.css';
import { MAP_PIN_SCALE, clusterPinSvg, clusterSize, cn, formatDistance, nurseryPinSvg, pinLabel, pinSize } from '@nurserylink/ui';
import { useQueries } from '@tanstack/react-query';
import { unwrap } from '@nurserylink/api-client';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AttributionControl, CircleMarker, GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import Supercluster from 'supercluster';
import type { Feature as GeoFeature } from 'geojson';
import { en } from '../../copy/en';
import { api } from '../../lib/api';
import type { LatLng } from '../../lib/geo';
import { toLatLng, type NurseryFeature, type NurseryProps } from './api';
import { chooseLabels } from './labels';

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const UGANDA: LatLngBoundsExpression = [[-1.5, 29.5], [4.3, 35.1]];

/**
 * Zoom levels: clusters (national) → district outlines and named pins (district) → every pin.
 * With a district or sub-county chosen, pins cluster less and are named at any zoom.
 */
const DISTRICT_ZOOM = 10;
const NAMED_PIN_ZOOM = 10;
const CLUSTER_UNTIL = 13;
const CLUSTER_RADIUS = 44;
const CLUSTER_RADIUS_IN_AREA = 22;
/** Invisible margin around each pin, so small pins are still easy to tap */
const HIT_PAD = 6;

type PointProps = { id: string; name: string; gift: boolean; demo: boolean; km: number | null; approx: boolean };
type ClusterProps = { gift: number };

// Icons are cached so re-renders don't make Leaflet rebuild markers (which also loses keyboard focus)
const iconCache = new Map<string, L.DivIcon>();
const cached = (key: string, make: () => L.DivIcon) => {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = make();
    iconCache.set(key, icon);
  }
  return icon;
};

const pinIcon = (gift: boolean, selected: boolean, label: string) => cached(`p|${String(gift)}|${String(selected)}|${label}`, () => {
  const size = pinSize(gift ? 'gift' : 'normal', selected, MAP_PIN_SCALE);
  const kind = gift ? 'gift' : 'normal';
  return L.divIcon({
    className: 'nl-pin',
    html: `<span role="img" aria-label="${label.replace(/"/g, '&quot;')}" style="display:block;padding:${String(HIT_PAD)}px ${String(HIT_PAD)}px 0">${nurseryPinSvg(kind, selected, MAP_PIN_SCALE)}</span>`,
    iconSize: [size.width + 2 * HIT_PAD, size.height + HIT_PAD],
    iconAnchor: [size.anchor[0] + HIT_PAD, size.anchor[1] + HIT_PAD],
    tooltipAnchor: [size.width / 2, -size.height / 2],
  });
});

const clusterIcon = (count: number, gift: boolean) => cached(`c|${String(count)}|${String(gift)}`, () => {
  const size = clusterSize(count);
  return L.divIcon({ className: 'nl-cluster', html: clusterPinSvg(count, gift), iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
});

/** Re-renders on pan/zoom with the current view, so clusters can be recomputed. */
const useView = () => {
  const map = useMap();
  const read = () => ({ zoom: map.getZoom(), bounds: map.getBounds() });
  const [view, setView] = useState(read);
  useMapEvents({ moveend: () => { setView(read()); }, zoomend: () => { setView(read()); } });
  return view;
};

/** Labels each pin for keyboard and screen-reader users (Leaflet makes marker icons focusable). */
const labelMarker = (marker: L.Marker | null, label: string) => {
  const el = marker?.getElement();
  if (el) {
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', label);
  }
};

const clusterLabel = (count: number, gift: number) => en.nurseries.clusterLabel(count, gift > 0);

const Pins = ({ features, selectedId, onSelect, areaChosen }: { features: NurseryFeature[]; selectedId: string | null; onSelect: (id: string) => void; areaChosen: boolean }) => {
  const map = useMap();
  const { zoom, bounds } = useView();
  const index = useMemo(() => {
    const sc = new Supercluster<PointProps, ClusterProps>({
      radius: areaChosen ? CLUSTER_RADIUS_IN_AREA : CLUSTER_RADIUS,
      maxZoom: CLUSTER_UNTIL,
      map: p => ({ gift: p.gift ? 1 : 0 }),
      reduce: (acc, p) => { acc.gift += p.gift; },
    });
    sc.load(
      features.map(f => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.geometry.coordinates[0] ?? 0, f.geometry.coordinates[1] ?? 0] },
        properties: pointProps(f.properties),
      }))
    );
    return sc;
  }, [features, areaChosen]);

  const clusters = index.getClusters([bounds.getWest() - 0.2, bounds.getSouth() - 0.2, bounds.getEast() + 0.2, bounds.getNorth() + 0.2], Math.round(zoom));
  const labelled = (() => {
    if (zoom < NAMED_PIN_ZOOM && !areaChosen) return new Set<string>();
    const pins = clusters.flatMap(c => {
      const [lng, lat] = c.geometry.coordinates;
      if ('cluster' in c.properties || lat === undefined || lng === undefined || !bounds.contains([lat, lng])) return [];
      const { x, y } = map.latLngToContainerPoint([lat, lng]);
      const p = c.properties;
      return [{ id: p.id, name: p.name, x, y, selected: p.id === selectedId, gift: p.gift, demo: p.demo }];
    });
    const box = pinSize('normal', false, MAP_PIN_SCALE);
    return chooseLabels(pins, { width: box.width, height: box.height });
  })();

  return (
    <>
      {clusters.map(c => {
        const [lng, lat] = c.geometry.coordinates;
        if (lat === undefined || lng === undefined) return null;
        if ('cluster' in c.properties) {
          const { cluster_id: clusterId, point_count: count, gift } = c.properties;
          return (
            <Marker
              key={`c${String(clusterId)}`}
              position={[lat, lng]}
              icon={clusterIcon(count, gift > 0)}
              keyboard
              ref={m => { labelMarker(m, clusterLabel(count, gift)); }}
              eventHandlers={{
                // Also on add: the element may not exist yet when the ref is set
                add: e => { labelMarker(e.target as L.Marker, clusterLabel(count, gift)); },
                click: () => { map.flyTo([lat, lng], Math.min(index.getClusterExpansionZoom(clusterId), 18)); },
              }}
            />
          );
        }
        const p = c.properties;
        const selected = p.id === selectedId;
        const label = pinLabel(p.name, { distance: p.km !== null ? formatDistance(p.km, p.approx ? 'straight_line' : 'road') : undefined, gift: p.gift, selected });
        return (
          <Marker
            key={p.id}
            position={[lat, lng]}
            icon={pinIcon(p.gift, selected, label)}
            keyboard
            zIndexOffset={selected ? 1000 : p.gift ? 500 : 0}
            ref={m => { labelMarker(m, label); }}
            eventHandlers={{ add: e => { labelMarker(e.target as L.Marker, label); }, click: () => { onSelect(p.id); } }}
          >
            {labelled.has(p.id) && (
              <Tooltip permanent direction="right" offset={[4, 0]} className="nl-pin-label">
                {p.name}
              </Tooltip>
            )}
          </Marker>
        );
      })}
    </>
  );
};

const pointProps = (p: NurseryProps): PointProps => ({
  id: p.id,
  name: p.name,
  gift: p.has_active_campaign,
  demo: p.is_demo,
  km: p.road_km ?? p.straight_km ?? null,
  approx: p.road_km === undefined || p.road_km === null,
});

/** At district zoom, outline the districts of the nurseries in view (one cached request each). */
const DistrictOutlines = ({ features }: { features: NurseryFeature[] }) => {
  const { zoom, bounds } = useView();
  const ids = useMemo(() => {
    if (zoom < DISTRICT_ZOOM - 1) return [];
    const inView = features.filter(f => {
      return bounds.contains(toLatLng(f.geometry.coordinates));
    });
    return [...new Set(inView.map(f => f.properties.district.id))].slice(0, 6);
  }, [features, zoom, bounds]);
  const shapes = useQueries({
    queries: ids.map(id => ({
      queryKey: ['boundaries', 'shape', id],
      queryFn: async () => (await unwrap(api.GET('/boundaries/{id}/geojson', { params: { path: { id } } }))).data,
      staleTime: 24 * 60 * 60_000,
    })),
  });
  return (
    <>
      {shapes.map(s =>
        s.data ? (
          <GeoJSON
            key={s.data.id}
            data={s.data as unknown as GeoFeature}
            interactive={false}
            style={{ color: '#1b6e44', weight: 2, opacity: 0.6, dashArray: '6 6', fill: false }}
          />
        ) : null
      )}
    </>
  );
};

/** The filter's district or sub-county: highlighted, and the map moves to it. */
const SelectedBoundary = ({ shape, compact }: { shape: GeoFeature | null; compact: boolean }) => {
  const map = useMap();
  useEffect(() => {
    if (!shape) return;
    const layer = L.geoJSON(shape);
    // Phones: keep the area clear of the floating search box and the list sheet
    const padding = compact
      ? { paddingTopLeft: L.point(16, 120), paddingBottomRight: L.point(16, Math.round(map.getSize().y * 0.45)) }
      : { padding: L.point(24, 24) };
    map.flyToBounds(layer.getBounds(), { ...padding, duration: 0.6 });
  }, [shape, map, compact]);
  if (!shape) return null;
  return <GeoJSON key={String(shape.id)} data={shape} interactive={false} style={{ color: '#1d7647', weight: 3, fillColor: '#1d7647', fillOpacity: 0.07 }} />;
};

/**
 * Fits the view to the nurseries the first time they arrive, and after the filters change. When a
 * district or sub-county is chosen, the map goes to that area instead (SelectedBoundary).
 */
const FitToData = ({ features, fitKey, areaChosen }: { features: NurseryFeature[]; fitKey: string; areaChosen: boolean }) => {
  const map = useMap();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (features.length === 0 || last.current === fitKey) return;
    last.current = fitKey;
    if (areaChosen) return;
    const latLngs = features.map(f => L.latLng(toLatLng(f.geometry.coordinates)));
    map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 13 });
  }, [features, fitKey, map, areaChosen]);
  return null;
};

const positionKey = (p: LatLng | null) => (p ? `${String(p.lat)},${String(p.lng)}` : null);

/**
 * Goes to the user's location when they share it or pick a place, close enough to read names.
 * A location remembered from earlier in the session doesn't move the map on arrival.
 */
const FollowPosition = ({ position }: { position: LatLng | null }) => {
  const map = useMap();
  const last = useRef<string | null>(positionKey(position));
  useEffect(() => {
    const key = positionKey(position);
    if (!position || last.current === key) return;
    last.current = key;
    map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
  }, [position, map]);
  return null;
};

/** Keeps the selected nursery in view. */
const FollowSelected = ({ features, selectedId }: { features: NurseryFeature[]; selectedId: string | null }) => {
  const map = useMap();
  useEffect(() => {
    const f = features.find(x => x.id === selectedId);
    if (!f) return;
    const target = L.latLng(toLatLng(f.geometry.coordinates));
    if (!map.getBounds().pad(-0.15).contains(target)) map.panTo(target);
  }, [selectedId, features, map]);
  return null;
};

const RouteLine = ({ coordinates }: { coordinates: number[][] | null }) => {
  const map = useMap();
  const positions = useMemo(() => coordinates?.map(toLatLng) ?? null, [coordinates]);
  useEffect(() => {
    if (positions && positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [48, 48] });
  }, [positions, map]);
  if (!positions) return null;
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} interactive={false} />
      <Polyline positions={positions} pathOptions={{ color: '#1d7647', weight: 5 }} interactive={false} />
    </>
  );
};

/** Leaflet must be told when its container changes size (bottom sheet, split resize). */
const KeepSized = ({ container }: { container: HTMLElement | null }) => {
  const map = useMap();
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(() => { map.invalidateSize(); });
    observer.observe(container);
    return () => { observer.disconnect(); };
  }, [container, map]);
  return null;
};

export interface NurseryMapProps {
  features: NurseryFeature[];
  fitKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  boundary: GeoFeature | null;
  /** A district or sub-county filter is set (its outline may still be loading) */
  areaChosen: boolean;
  route: number[][] | null;
  position: LatLng | null;
  onLocate: () => void;
  /** Phones: pinch to zoom (no zoom buttons under the floating search), locate button at the top */
  compact?: boolean;
  className?: string;
}

const NurseryMap = ({ features, fitKey, selectedId, onSelect, boundary, areaChosen, route, position, onLocate, compact = false, className }: NurseryMapProps) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setContainer} role="region" aria-label={en.nurseries.mapLabel} className={cn(className, compact && 'nl-map-compact')}>
      <MapContainer bounds={UGANDA} className="size-full" zoomControl={!compact} attributionControl={!compact} preferCanvas={false} minZoom={6}>
        {/* Phones: the list sheet covers the bottom, so the required credit sits at the top */}
        {compact && <AttributionControl position="topright" prefix={false} />}
        <TileLayer url={TILE_URL} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={18} crossOrigin />
        <KeepSized container={container} />
        <FitToData features={features} fitKey={fitKey} areaChosen={areaChosen} />
        <FollowPosition position={position} />
        <FollowSelected features={features} selectedId={selectedId} />
        <DistrictOutlines features={features} />
        <SelectedBoundary shape={boundary} compact={compact} />
        <RouteLine coordinates={route} />
        {position && (
          <CircleMarker center={[position.lat, position.lng]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1b6e44', fillOpacity: 1 }} interactive={false} />
        )}
        <Pins features={features} selectedId={selectedId} onSelect={onSelect} areaChosen={areaChosen} />
      </MapContainer>
      <button
        type="button"
        onClick={onLocate}
        aria-label={en.nurseries.locateMe}
        className={cn('absolute right-3 z-[400] flex size-11 items-center justify-center rounded-sm bg-paper text-forest shadow-float ring-1 ring-line', compact ? 'top-[7.25rem]' : 'bottom-6')}
      >
        <LocateFixed aria-hidden className="size-5" />
      </button>
    </div>
  );
};

export default NurseryMap;
