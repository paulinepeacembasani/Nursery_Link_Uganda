/** Most labels drawn at once (each is a DOM element) */
const MAX_LABELS = 120;

/** Rough width of a pin label in pixels (13 px bold text plus padding). */
const labelWidth = (name: string) => name.length * 7.2 + 14;
const LABEL_HEIGHT = 20;

/**
 * Which pins get a name label: as many as fit without overlapping each other or other pins, the
 * selected nursery first, then free-seedling nurseries, then real ones before samples.
 */
export const chooseLabels = (
  pins: { id: string; name: string; x: number; y: number; selected: boolean; gift: boolean; demo: boolean }[],
  pinBox: { width: number; height: number },
  max = MAX_LABELS
): Set<string> => {
  const ranked = [...pins].sort(
    (a, b) => Number(b.selected) - Number(a.selected) || Number(b.gift) - Number(a.gift) || Number(a.demo) - Number(b.demo) || a.name.localeCompare(b.name)
  );
  // Pins themselves are obstacles, so a label never covers another pin (except the selected one's)
  const taken = pins.map(p => ({ x1: p.x - pinBox.width / 2, x2: p.x + pinBox.width / 2, y1: p.y - pinBox.height, y2: p.y }));
  const pinCount = taken.length;
  const chosen = new Set<string>();
  for (const p of ranked) {
    if (chosen.size >= max) break;
    // To the right of the pin, level with its middle (where the tooltip opens)
    const x1 = p.x + pinBox.width / 2 + 4;
    const yc = p.y - pinBox.height / 2;
    const box = { x1, x2: x1 + labelWidth(p.name), y1: yc - LABEL_HEIGHT / 2, y2: yc + LABEL_HEIGHT / 2 };
    const obstacles = p.selected ? taken.slice(pinCount) : taken;
    if (obstacles.some(t => box.x1 < t.x2 && box.x2 > t.x1 && box.y1 < t.y2 && box.y2 > t.y1)) continue;
    taken.push(box);
    chosen.add(p.id);
  }
  return chosen;
};
