import 'leaflet/dist/leaflet.css';
import { nurseryPinSvg, pinSize } from '@nurserylink/ui';
import L from 'leaflet';
import { useMemo } from 'react';
import { AttributionControl, MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import type { LatLng } from '../lib/geo';

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const nurseryIcon = (() => {
  const size = pinSize('normal');
  return L.divIcon({ className: 'nl-pin', html: nurseryPinSvg('normal'), iconSize: [size.width, size.height], iconAnchor: size.anchor });
})();
const dropIcon = L.divIcon({
  className: 'nl-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 41C16 41 2 25.5 2 16a14 14 0 0 1 28 0c0 9.5-14 25-14 25Z" fill="#b8501f" stroke="#ffffff" stroke-width="2"/><circle cx="16" cy="16" r="5" fill="#ffffff"/></svg>`,
  iconSize: [36, 46],
  iconAnchor: [18, 46],
});

/** A nursery pin, and optionally a drop point, framed together (order map, campaign pickup). */
const LocationMap = ({ nursery, drop = null, label }: { nursery: LatLng; drop?: LatLng | null; label: string }) => {
  const bounds = useMemo(() => L.latLngBounds([[nursery.lat, nursery.lng], ...(drop ? [[drop.lat, drop.lng] as [number, number]] : [])]).pad(0.3), [nursery, drop]);
  return (
    <div role="region" aria-label={label} className="relative isolate h-72 overflow-hidden rounded-md ring-1 ring-line md:h-96">
      <MapContainer bounds={bounds} maxZoom={16} className="size-full" attributionControl={false}>
        <TileLayer url={TILE_URL} maxZoom={18} crossOrigin />
        <AttributionControl position="bottomright" prefix={false} />
        <Marker position={[nursery.lat, nursery.lng]} icon={nurseryIcon} interactive={false} keyboard={false} />
        {drop && (
          <>
            <Polyline positions={[[nursery.lat, nursery.lng], [drop.lat, drop.lng]]} pathOptions={{ color: '#1d7647', weight: 3, dashArray: '6 8' }} interactive={false} />
            <Marker position={[drop.lat, drop.lng]} icon={dropIcon} interactive={false} keyboard={false} />
          </>
        )}
      </MapContainer>
    </div>
  );
};
export default LocationMap;
