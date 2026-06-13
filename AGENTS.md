# AGENTS.md — ttrpg-sim

## Project Overview

D&D 5.5e (2024 rules) DPR calculator and combat analysis tool. Vite + vanilla TypeScript + Chart.js. Deployed as a static site to GitHub Pages.

## Architecture

```
src/
├── engine/          # Pure math — no DOM, no side effects
│   ├── probability.ts   # Exact probability DPR (Halfling Lucky, Vex chains, advantage CDFs)
│   ├── montecarlo.ts    # Monte Carlo simulation engine
│   ├── worker.ts        # Web Worker entry (runs MC off main thread)
│   ├── dice.ts          # Dice parsing and rolling
│   └── halfling-lucky.ts # d20 probability distribution with Halfling Lucky
├── analysis/        # Analysis orchestrators — call engine, return structured results
│   ├── dpr-curve.ts     # DPR vs AC sweep
│   ├── burst.ts         # Burst/percentile distribution
│   ├── hex.ts           # Concentration spell break-even
│   ├── mook-clearing.ts # Multi-target kill rate
│   └── surprise.ts      # Surprise round comparison
├── ui/              # DOM rendering — no math here
│   ├── sidebar.ts       # Character config panel
│   ├── tabs.ts          # Tab management
│   ├── charts.ts        # Chart.js wrappers
│   └── tables.ts        # Table rendering with highlights
├── presets/          # Character build presets (JSON)
├── types.ts          # All TypeScript interfaces
├── main.ts           # Entry point — wires UI to analysis
└── style.css         # Dark theme styles
```

## Key Design Principles

- **Engine is pure:** `engine/` modules have zero DOM dependencies. They take typed config objects, return typed results. This makes them testable and worker-safe.
- **Analysis orchestrates:** `analysis/` modules call engine functions with the right parameters for each analysis mode.
- **UI renders:** `ui/` modules take analysis results and render DOM + charts. No computation here.
- **Character config is data:** Everything about a build is a JSON-serializable `CharacterConfig` object. Import/export/localStorage persistence for free.

## Math Correctness (Critical)

The probability engine must be exact. Key invariants:

- **Halfling Lucky:** P(nat 1) = 1/400, P(nat k for k≥2) = 21/400. Do NOT use uniform d20.
- **Advantage:** P(max of two HL d20s = k) via CDF² method, not naive 2/20².
- **Vex chain:** Attack N+1 has advantage IFF attack N hit. This creates a probability tree — enumerate all paths for exact calc.
- **Crit doubling (2024):** Double ALL dice marked `doublesOnCrit: true`. Piercer-style dice are `doublesOnCrit: false`. Static bonuses NEVER double.
- **Nat 1 always misses.** Nat ≥ critRange always crits (and hits).
- **Sharpshooter:** −5 to hit, +10 to damage. Per-attack toggle.

## Build & Deploy

```bash
npm install
npm run dev          # Vite dev server
npm run build        # tsc + vite build → dist/
```

GitHub Actions deploys `dist/` to Pages on push to `main`.

## Adding Presets

Drop a JSON file in `src/presets/` matching the `CharacterConfig` interface. Import it in `main.ts` and add to the preset dropdown.

## Style

- TypeScript strict mode
- No `any` except where interfacing with Chart.js internals
- Prefer explicit types over inference for function signatures
- Keep engine/ free of DOM APIs (must work in Web Worker context)
