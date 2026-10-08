import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { WEB_URL } from './env';

/**
 * Budgets from the brief, measured with Lighthouse's mobile preset: a mid-range phone on simulated
 * slow 4G (150 ms RTT, 1.6 Mbps, 4x CPU slowdown).
 *   performance >= 85, accessibility >= 95, LCP < 2.5 s, on / and /nurseries.
 * Reports and scores are saved in docs/lighthouse/ for review.
 *
 * /nurseries: its speed is recorded but doesn't fail the run (user's decision, October 2026). Its
 * largest element is an OpenStreetMap tile, fetched from a third-party server at the end of the
 * page's script chain, and it scores about 70-79 however our own code changes. Its accessibility
 * budget still applies. A tile CDN (or self-hosted tiles) is the fix that would let it be strict again.
 */
const BUDGET = { performance: 0.85, accessibility: 0.95, lcpMs: 2500 };
const PAGES = [{ name: 'home', path: '/', speedGate: true }, { name: 'nurseries', path: '/nurseries', speedGate: false }];
const OUT = 'docs/lighthouse';

interface Scores { performance: number; accessibility: number; lcpMs: number; failingA11y: string[]; opportunities: string[] }

test.describe('Lighthouse (mobile, simulated slow 4G)', () => {
  test.describe.configure({ timeout: 240_000 });

  for (const { name, path, speedGate } of PAGES) {
    test(`${path} meets the budgets`, () => {
      mkdirSync(OUT, { recursive: true });
      const output = execFileSync('node', ['scripts/lighthouse.mjs', `${WEB_URL}${path}`, `${OUT}/${name}.html`], { encoding: 'utf8' });
      const line = output.trim().split('\n').at(-1) ?? '{}';
      writeFileSync(`${OUT}/${name}.json`, `${JSON.stringify(JSON.parse(line), null, 2)}\n`);
      const scores = JSON.parse(line) as Scores;
      console.log(`${path}: ${line}`);
      expect(scores.accessibility, `accessibility audits failing: ${scores.failingA11y.join(', ')}`).toBeGreaterThanOrEqual(BUDGET.accessibility);
      if (!speedGate) {
        test.info().annotations.push({ type: 'speed (report only)', description: `performance ${String(scores.performance)}, LCP ${String(Math.round(scores.lcpMs))} ms` });
        return;
      }
      expect(scores.performance, `opportunities: ${scores.opportunities.join(', ')}`).toBeGreaterThanOrEqual(BUDGET.performance);
      expect(scores.lcpMs).toBeLessThan(BUDGET.lcpMs);
    });
  }
});
