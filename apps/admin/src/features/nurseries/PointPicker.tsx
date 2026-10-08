import 'leaflet/dist/leaflet.css';
import { nurseryPinSvg, pinSize } from '@nurserylink/ui';
import L from 'leaflet';
import { useEffect } from 'react';
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { Feature } from 'geojson';
import { en } from '../../copy/en';

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const UGANDA: L.LatLngBoundsExpression = [[-1.5, 29.5], [4.3, 35.1]];

export interface Point {
  lat: number;
  lng: number;
}

const icon = (() => {
  const size = pinSize('normal', true);
  return L.divIcon({ className: 'nl-pin', html: nurseryPinSvg('normal', true), iconSize: [size.width, size.height], iconAnchor: size.anchor });
})();

const round = (n: number) => Math.round(n * 1e6) / 1e6;

const Click = ({ onPick }: { onPick: (p: Point) => void }) => {
  useMapEvents({ click: e => { onPick({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }); } });
  return null;
};

/** Leaflet measures its box once; re-measure when the layout settles or changes (lazy load, grid reflow). */
const KeepSized = () => {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => { map.invalidateSize(); });
    observer.observe(map.getContainer());
    return () => { observer.disconnect(); };
  }, [map]);
  return null;
};

const FlyTo = ({ point, boundary }: { point: Point | null; boundary: Feature | null }) => {
  const map = useMap();
  useEffect(() => {
    if (boundary) map.flyToBounds(L.geoJSON(boundary).getBounds(), { padding: [16, 16], duration: 0.5 });
  }, [boundary, map]);
  useEffect(() => {
    if (point && !map.getBounds().contains([point.lat, point.lng])) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 13));
  }, [point, map]);
  return null;
};

/** Click to place the nursery (or drag the pin). The chosen boundary is outlined to help find the spot. */
const PointPicker = ({ point, onPick, boundary, label }: { point: Point | null; onPick: (p: Point) => void; boundary: Feature | null; label: string }) => (
  <div role="region" aria-label={label} className="relative isolate h-80 overflow-hidden rounded-md ring-1 ring-line">
    <MapContainer {...(point ? { center: [point.lat, point.lng] as [number, number], zoom: 14 } : { bounds: UGANDA })} className="size-full">
      <TileLayer url={TILE_URL} maxZoom={18} crossOrigin attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      <KeepSized />
      <Click onPick={onPick} />
      <FlyTo point={point} boundary={boundary} />
      {boundary && <GeoJSON key={String(boundary.id)} data={boundary} interactive={false} style={{ color: '#1d7647', weight: 2, fillOpacity: 0.05 }} />}
      {point && (
        <Marker
          position={[point.lat, point.lng]}
          icon={icon}
          draggable
          // Leaflet makes a keyboard marker role="button"; the title is its accessible name
          title={en.nurseries.nurseryPin}
          eventHandlers={{ dragend: e => { const ll = (e.target as L.Marker).getLatLng(); onPick({ lat: round(ll.lat), lng: round(ll.lng) }); } }}
        />
      )}
    </MapContainer>
  </div>
);
export default PointPicker;
