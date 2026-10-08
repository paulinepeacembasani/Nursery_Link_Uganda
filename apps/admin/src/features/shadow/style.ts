/** Token colours for Leaflet, which needs real values rather than CSS classes. */
const token = (name: string, fallback: string) => {
  const v = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

export const colours = () => ({
  laterite: token('--color-laterite', '#b42318'),
  forest: token('--color-forest', '#1d7647'),
  canopy: token('--color-canopy', '#1b6e44'),
});

/** Forest-loss squares in three tones, relative to the run's threshold (the map only gets squares from half of it). */
export const lossBands = (threshold: number) => [
  { from: threshold / 2, to: threshold, opacity: 0.18 },
  { from: threshold, to: Math.min(100, threshold * 2), opacity: 0.4 },
  { from: Math.min(100, threshold * 2), to: 100, opacity: 0.7 },
];

export const lossOpacity = (pct: number, threshold: number) =>
  pct >= threshold * 2 ? 0.7 : pct >= threshold ? 0.4 : 0.18;
