// ============================================================
// Web Worker Entry Point
// ============================================================
// Handles Monte Carlo and Mook simulations off the main thread.

import type { WorkerRequest, WorkerProgress, WorkerResult } from '../types.js';
import { runMonteCarlo, runMookSim } from './montecarlo.js';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  if (req.type === 'montecarlo') {
    const result = runMonteCarlo(
      req.config,
      {
        simCount: req.simCount,
        targetAC: req.targetAC,
        hexActive: false,
      },
      (pct: number) => {
        const progress: WorkerProgress = { type: 'progress', pct };
        self.postMessage(progress);
      },
    );

    // Serialize histogram (Map -> array)
    const histArray: { damage: number; count: number }[] = [];
    result.histogram.forEach((count, damage) => {
      histArray.push({ damage, count });
    });
    histArray.sort((a, b) => a.damage - b.damage);

    const msg: WorkerResult = {
      type: 'result',
      resultType: 'montecarlo',
      data: {
        histogram: histArray,
        percentiles: {
          p10: result.percentiles.p10,
          p25: result.percentiles.p25,
          p50: result.percentiles.p50,
          p75: result.percentiles.p75,
          p90: result.percentiles.p90,
          p95: result.percentiles.p95,
          p99: result.percentiles.p99,
          max: result.percentiles.max,
          avg: result.avg,
          whiffRate: result.whiffRate,
          killProbs: result.killProbs,
        },
        critRounds: {
          noCrit: {
            freq: result.critRounds.noCrit.count / req.simCount,
            avg: result.critRounds.noCrit.count > 0
              ? result.critRounds.noCrit.totalDmg / result.critRounds.noCrit.count
              : 0,
          },
          singleCrit: {
            freq: result.critRounds.singleCrit.count / req.simCount,
            avg: result.critRounds.singleCrit.count > 0
              ? result.critRounds.singleCrit.totalDmg / result.critRounds.singleCrit.count
              : 0,
          },
          doubleCrit: {
            freq: result.critRounds.doublePlus.count / req.simCount,
            avg: result.critRounds.doublePlus.count > 0
              ? result.critRounds.doublePlus.totalDmg / result.critRounds.doublePlus.count
              : 0,
          },
        },
      },
    };
    self.postMessage(msg);

  } else if (req.type === 'mooksim') {
    const result = runMookSim(
      req.config,
      {
        simCount: req.simCount,
        mookAC: req.mookAC ?? 14,
        mookHP: req.mookHP ?? 35,
        hasSurprise: req.hasSurprise ?? false,
      },
      (pct: number) => {
        const progress: WorkerProgress = { type: 'progress', pct };
        self.postMessage(progress);
      },
    );

    const msg: WorkerResult = {
      type: 'result',
      resultType: 'mooksim',
      data: result,
    };
    self.postMessage(msg);
  }
};
