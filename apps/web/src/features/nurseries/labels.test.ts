import { describe, expect, it } from 'vitest';
import { chooseLabels } from './labels';

const pin = (id: string, x: number, y: number, extra: Partial<{ selected: boolean; gift: boolean; demo: boolean }> = {}) => ({
  id, name: `Nursery ${id}`, x, y, selected: false, gift: false, demo: false, ...extra,
});
const BOX = { width: 20, height: 26 };

describe('chooseLabels', () => {
  it('labels every pin when there is room', () => {
    expect(chooseLabels([pin('a', 0, 100), pin('b', 0, 200), pin('c', 300, 100)], BOX)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('skips a label that would overlap another, keeping the selected and free-seedling nurseries', () => {
    const crowded = [pin('a', 0, 100), pin('b', 10, 105, { gift: true }), pin('c', 5, 110, { selected: true })];
    const chosen = chooseLabels(crowded, BOX);
    expect(chosen.has('c')).toBe(true);
    expect(chosen.has('a')).toBe(false);
  });

  it('never covers another pin, and puts real nurseries before samples', () => {
    // b's pin sits where a's label would go
    expect(chooseLabels([pin('a', 0, 100), pin('b', 40, 100)], BOX)).toEqual(new Set(['b']));
    expect(chooseLabels([pin('s', 0, 100, { demo: true }), pin('r', 0, 108)], BOX)).toEqual(new Set(['r']));
  });

  it('stops at the maximum', () => {
    const many = Array.from({ length: 10 }, (_, i) => pin(String(i), 0, i * 100));
    expect(chooseLabels(many, BOX, 3).size).toBe(3);
  });
});
