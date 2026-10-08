import { BottomSheet, Badge, Skeleton, cn, type SheetSnap } from '@nurserylink/ui';
import { List, Map as MapIcon, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { Feature as GeoFeature } from 'geojson';
import { CachedNote } from '../components/CachedNote';
import { CorrectedNote } from '../components/CorrectedNote';
import { usePageTitle } from '../components/usePageTitle';
import { en } from '../copy/en';
import { useBoundaryShape, useNearest, useNurseryMap, useRoute } from '../features/nurseries/api';
import { FilterPanel, SearchBox, nurserySuggest } from '../features/nurseries/Filters';
import { useAskLocation } from '../features/nurseries/LocationDialog';
import { NurseryCard } from '../features/nurseries/NurseryCard';
import { NurseryList, type ListNursery } from '../features/nurseries/NurseryList';
import { useNurseryParams } from '../features/nurseries/params';
import { SpeciesDrawer } from '../features/nurseries/SpeciesDrawer';
import { DESKTOP, useMedia } from '../lib/media';

// Leaflet is the biggest dependency on the site: it loads only when a map is on screen
const loadMap = () => import('../features/nurseries/NurseryMap');
const NurseryMap = lazy(loadMap);
// The map is this page's largest element: start downloading its code now, alongside the page's data,
// rather than after the first render. List view never shows the map, so it skips this (saves data).
if (new URLSearchParams(window.location.search).get('view') !== 'list') void loadMap();

const MapFallback = () => <Skeleton className="size-full rounded-none" />;

const Nurseries = () => {
  usePageTitle(en.nurseries.title);
  const { params, update } = useNurseryParams();
  const desktop = useMedia(DESKTOP);
  const { ask, dialog, position, finding } = useAskLocation();
  const [speciesSlug, setSpeciesSlug] = useState<string | null>(null);
  const [snap, setSnap] = useState<SheetSnap>('half');

  const map = useNurseryMap(params, position);
  const nearest = useNearest(params, position);
  const nearestOn = params.sort === 'nearest' && position !== null;
  const shape = useBoundaryShape(params.subCounty ?? params.district);
  const route = useRoute(params.nursery, position, params.directions);

  // Deep links such as /nurseries?species=mvule&sort=nearest ask for the location once (FR-20)
  useEffect(() => {
    if (params.sort === 'nearest' && !position) ask(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, []);

  // Road distances (by id) for the closest nurseries, when routing answered
  const roadKm = useMemo(() => {
    const km = new Map<string, number>();
    if (nearest.data?.distanceMode !== 'road') return km;
    for (const n of nearest.data.data) if (n.road_km !== undefined && n.road_km !== null) km.set(n.id, n.road_km);
    return km;
  }, [nearest.data]);
  const features = useMemo(() => {
    const all = map.data?.data.features ?? [];
    return roadKm.size === 0 ? all : all.map(f => (roadKm.has(f.id) ? { ...f, properties: { ...f.properties, road_km: roadKm.get(f.id) } } : f));
  }, [map.data, roadKm]);
  const items: ListNursery[] | undefined = useMemo(() => {
    if (nearestOn) {
      return nearest.data?.data.map(n => ({
        id: n.id,
        name: n.name,
        subCounty: n.sub_county.name,
        hasCampaign: n.has_active_campaign,
        isDemo: n.is_demo,
        speciesCount: n.species_count,
        km: n.road_km ?? n.straight_km ?? null,
        distanceMode: n.road_km !== undefined && n.road_km !== null && nearest.data.distanceMode === 'road' ? 'road' : 'straight_line',
      }));
    }
    if (!map.data) return undefined;
    return features.map(f => ({
      id: f.id,
      name: f.properties.name,
      subCounty: f.properties.sub_county.name,
      hasCampaign: f.properties.has_active_campaign,
      isDemo: f.properties.is_demo,
      speciesCount: f.properties.species_count,
      km: roadKm.get(f.id) ?? f.properties.straight_km ?? null,
      distanceMode: roadKm.has(f.id) ? 'road' : 'straight_line',
    }));
  }, [nearestOn, nearest.data, map.data, features, roadKm]);

  const listQuery = nearestOn ? nearest : map;
  const correctedQ = (listQuery.data?.meta as { corrected_q?: string } | undefined)?.corrected_q;
  const heading = nearestOn
    ? nearest.data?.distanceMode === 'straight_line' ? en.nurseries.sortedStraight : en.nurseries.sortedByRoad
    : en.nurseries.count(items?.length ?? 0);

  const openNursery = useCallback((id: string) => { update({ nursery: id }); }, [update]);
  const toggleNearest = () => {
    if (nearestOn) update({ sort: 'name' });
    else ask(() => { update({ sort: 'nearest' }); });
  };
  const clearFilters = () => { update({ q: '', district: null, species: null, category: null, sort: 'name' }); };
  const fitKey = JSON.stringify([params.q, params.district, params.subCounty, params.species, params.category]);

  const mapElement = (
    <Suspense fallback={<MapFallback />}>
      <NurseryMap
        className="relative isolate size-full"
        features={features}
        fitKey={fitKey}
        selectedId={params.nursery}
        onSelect={openNursery}
        boundary={(shape.data as unknown as GeoFeature | undefined) ?? null}
        areaChosen={(params.subCounty ?? params.district) !== null}
        route={params.directions && route.data ? route.data.geometry.coordinates : null}
        position={position}
        onLocate={() => { ask(() => undefined); }}
        compact={!desktop}
      />
    </Suspense>
  );

  const speciesChip = params.species && (
    <Badge tone="info" className="self-start py-1">
      {en.nurseries.filterSpecies(params.species)}
      <button type="button" onClick={() => { update({ species: null }); }} aria-label={en.nurseries.removeSpecies} className="-mr-1 flex size-7 items-center justify-center rounded-full hover:bg-paper">
        <X aria-hidden className="size-4" />
      </button>
    </Badge>
  );

  const list = (
    <div className="flex flex-col gap-3">
      {speciesChip}
      {correctedQ && <CorrectedNote typed={params.q} corrected={correctedQ} />}
      {listQuery.data && <CachedNote fromCache={listQuery.data.fromCache} fetchedAt={listQuery.data.fetchedAt} />}
      <NurseryList
        items={items}
        loading={listQuery.isPending}
        error={listQuery.error}
        onRetry={() => { void listQuery.refetch(); }}
        selectedId={params.nursery}
        onOpen={openNursery}
        onClearFilters={clearFilters}
        heading={heading}
      />
    </div>
  );

  const overlays = (
    <>
      <NurseryCard
        id={params.nursery}
        position={position}
        directions={params.directions}
        onClose={() => { update({ nursery: null }); }}
        onDirections={on => {
          if (on) ask(() => { update({ directions: true }); });
          else update({ directions: false });
        }}
        onSpecies={setSpeciesSlug}
        modal={!desktop}
      />
      <SpeciesDrawer slug={speciesSlug} onClose={() => { setSpeciesSlug(null); }} />
      {dialog}
    </>
  );

  if (desktop) {
    return (
      <div className="grid h-[calc(100dvh-4rem)] grid-cols-[3fr_2fr]">
        {mapElement}
        <aside aria-label={en.nurseries.title} className="flex flex-col gap-4 overflow-y-auto border-l border-line bg-mist p-5">
          <h1 className="text-2xl">{en.nurseries.title}</h1>
          <FilterPanel params={params} update={update} onNearest={toggleNearest} findingLocation={finding} />
          {list}
        </aside>
        {overlays}
      </div>
    );
  }

  // Phones: a full-screen map with the list in a sheet, or the list on its own (no map download)
  const viewToggle = (
    <div role="group" aria-label={en.nurseries.viewToggle} className="flex rounded-full bg-paper p-1 shadow-float ring-1 ring-line">
      {(['map', 'list'] as const).map(v => (
        <button
          key={v}
          type="button"
          aria-pressed={params.view === v}
          onClick={() => { update({ view: v }); }}
          className={cn('flex min-h-11 items-center gap-1 rounded-full px-4 font-bold', params.view === v ? 'bg-forest text-paper' : 'text-forest')}
        >
          {v === 'map' ? <MapIcon aria-hidden className="size-4" /> : <List aria-hidden className="size-4" />}
          {v === 'map' ? en.nurseries.viewMap : en.nurseries.viewList}
        </button>
      ))}
    </div>
  );

  if (params.view === 'list') {
    return (
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl">{en.nurseries.title}</h1>
          {viewToggle}
        </div>
        <FilterPanel params={params} update={update} onNearest={toggleNearest} findingLocation={finding} />
        {list}
        {overlays}
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-4rem)] overflow-hidden">
      <h1 className="sr-only">{en.nurseries.title}</h1>
      {mapElement}
      <div className="absolute inset-x-3 top-3 z-[500] flex flex-col gap-2">
        <SearchBox value={params.q} onChange={q => { update({ q }, { replace: true }); }} suggest={nurserySuggest(update)} className="shadow-float" />
        <div className="self-start">{viewToggle}</div>
      </div>
      <BottomSheet title={en.nurseries.title} snap={snap} onSnapChange={setSnap} expandLabel={en.nurseries.expandList} collapseLabel={en.nurseries.collapseList}>
        <div className="flex flex-col gap-4 pt-1">
          {/* The search box floats over the map on phones, so it isn't repeated here */}
          <FilterPanel params={params} update={update} onNearest={toggleNearest} findingLocation={finding} showSearch={false} />
          {list}
        </div>
      </BottomSheet>
      {overlays}
    </div>
  );
};

export default Nurseries;
