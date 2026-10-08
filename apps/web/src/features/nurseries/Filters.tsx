import { speciesCategories } from '@nurserylink/shared';
import { Field, Select, cn } from '@nurserylink/ui';
import { LocateFixed } from 'lucide-react';
import { SearchBox, type SuggestConfig } from '../../components/SearchBox';
import { en } from '../../copy/en';
import { useDistricts, useSubCounties } from './api';
import type { NurseryParams, ParamUpdate } from './params';

/** District → Sub-county: the sub-county list loads for the chosen district only (FR-07). */
export const BoundaryFilters = ({ district, subCounty, onChange }: { district: string | null; subCounty: string | null; onChange: (u: ParamUpdate) => void }) => {
  const districts = useDistricts();
  const subCounties = useSubCounties(district);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label={en.nurseries.district}>
        {({ id }) => (
          <Select id={id} value={district ?? ''} onChange={e => { onChange({ district: e.target.value || null }); }} disabled={districts.isPending && !districts.data}>
            <option value="">{en.nurseries.allDistricts}</option>
            {districts.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        )}
      </Field>
      <Field label={en.nurseries.subCounty}>
        {({ id }) => (
          <Select id={id} value={subCounty ?? ''} onChange={e => { onChange({ subCounty: e.target.value || null }); }} disabled={!district}>
            <option value="">{district ? en.nurseries.allSubCounties : en.nurseries.chooseDistrictFirst}</option>
            {subCounties.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
      </Field>
    </div>
  );
};

/**
 * Seedling type (Coffee, Cocoa, Indigenous…): shows nurseries with at least one tree of that type in
 * stock, so one nursery can appear under several types.
 */
export const CategoryFilter = ({ value, onChange }: { value: NurseryParams['category']; onChange: (u: ParamUpdate) => void }) => {
  const chip = (on: boolean) =>
    cn('min-h-11 shrink-0 rounded-full px-3.5 text-sm font-bold ring-1 transition-colors', on ? 'bg-forest text-paper ring-forest' : 'bg-paper text-forest ring-field hover:bg-forest-tint');
  return (
    <div role="group" aria-labelledby="category-filter-label" className="flex flex-col gap-1.5">
      <span id="category-filter-label" className="font-bold text-bark">{en.nurseries.category}</span>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap">
        <button type="button" aria-pressed={value === null} onClick={() => { onChange({ category: null }); }} className={chip(value === null)}>
          {en.nurseries.allCategories}
        </button>
        {speciesCategories.map(c => (
          <button key={c} type="button" aria-pressed={value === c} onClick={() => { onChange({ category: value === c ? null : c }); }} className={chip(value === c)}>
            {en.categories[c]}
          </button>
        ))}
      </div>
    </div>
  );
};

/** "Sort by nearest" as a toggle button (asks for the location the first time). */
export const NearestToggle = ({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) => (
  <button
    type="button"
    aria-pressed={on}
    aria-busy={busy || undefined}
    onClick={onToggle}
    className={cn(
      'flex min-h-11 items-center gap-2 rounded-full px-4 font-bold ring-1 transition-colors',
      on ? 'bg-forest text-paper ring-forest' : 'bg-paper text-forest ring-field hover:bg-forest-tint'
    )}
  >
    <LocateFixed aria-hidden className="size-5" />
    {busy ? en.location.finding : en.nurseries.sortNearest}
  </button>
);

/**
 * What choosing a suggestion does on /nurseries: a tree searches for it, a nursery opens its card,
 * a district or sub-county becomes the area filter.
 */
export const nurserySuggest = (update: (u: ParamUpdate, o?: { replace?: boolean }) => void): SuggestConfig => ({
  types: ['species', 'nursery', 'place'],
  onPick: s => {
    switch (s.kind) {
      case 'species':
        update({ q: s.label });
        return s.label;
      case 'nursery':
        update({ q: '', nursery: s.id });
        return '';
      case 'place':
        update(s.level === 'district' ? { q: '', district: s.id } : { q: '', district: s.parent_id, subCounty: s.id });
        return '';
    }
  },
});

export const FilterPanel = ({ params, update, onNearest, findingLocation, showSearch = true }: {
  params: NurseryParams;
  update: (u: ParamUpdate, o?: { replace?: boolean }) => void;
  onNearest: () => void;
  findingLocation: boolean;
  showSearch?: boolean;
}) => (
  <div className="flex flex-col gap-3">
    {showSearch && <SearchBox value={params.q} onChange={q => { update({ q }, { replace: true }); }} suggest={nurserySuggest(update)} />}
    <BoundaryFilters district={params.district} subCounty={params.subCounty} onChange={u => { update(u); }} />
    <CategoryFilter value={params.category} onChange={u => { update(u); }} />
    <div className="flex flex-wrap items-center gap-2">
      <NearestToggle on={params.sort === 'nearest'} busy={findingLocation} onToggle={onNearest} />
    </div>
  </div>
);

export { SearchBox };
