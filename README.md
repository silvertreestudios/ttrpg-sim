# TTRPG Sim — D&D 5.5e DPR Calculator

Interactive damage-per-round calculator and combat analysis tool for D&D 5.5e (2024 rules). Built with Vite + TypeScript + Chart.js.

**Live site:** [silvertreestudios.github.io/ttrpg-sim](https://silvertreestudios.github.io/ttrpg-sim) *(after enabling GitHub Pages)*

## Features

- **Exact probability** DPR curves across AC 10-25 with Sharpshooter/GWM breakpoint analysis
- **Monte Carlo** burst damage simulation (100k+ rounds) with percentile distributions and histograms
- **Hex/Concentration spell** break-even analysis — how many rounds does a target need to live for Hex to be worth the bonus action cost?
- **Mook clearing** — multi-target kill rates accounting for overkill waste and target switching
- **Surprise round** comparison — opener vs sustained DPR with full-combat projections
- **Configurable builds** — any number of attacks, damage riders, feats, and advantage sources
- **Import/Export** character configs as JSON — share builds or save presets
- **Auto-save** to localStorage

### Math Engine

All probability calculations account for:
- Halfling Lucky (reroll natural 1s)
- Expanded crit range (Champion 19-20, 18-20)
- Vex weapon mastery (conditional advantage chain)
- Sharpshooter/GWM per-attack toggling
- Conditional damage riders (Thirsting Blade placement, Smite-on-crit-only)
- 2024 crit rules (double all marked dice, static bonuses not doubled)

## Getting Started

```bash
npm install
npm run dev      # local dev server at localhost:5173
npm run build    # production build to dist/
npm run preview  # preview production build
```

## Development verification

Before submitting changes, run:

```sh
npm install
npm run build
```

`npm run build` performs strict TypeScript checking and creates the production bundle in `dist/`.

## Deployment

Push to `main` and GitHub Actions will auto-deploy to GitHub Pages via the included workflow (`.github/workflows/deploy.yml`).

To enable:
1. Go to repo Settings → Pages
2. Set Source to "GitHub Actions"
3. Push — the workflow handles the rest

## Ships With

**Crossbow Champion/Warlock (Level 12)** — a pre-loaded preset featuring:
- 3 attacks (2× main hand +2 pact crossbow, 1× off-hand +1 crossbow)
- Sharpshooter, Piercer, Halfling Lucky, Lucky feat, Crossbow Expert
- Champion 19-20 crit range, Vex weapon mastery
- Thirsting Blade, Eldritch Smite, Hex damage riders

## Tech Stack

- [Vite](https://vitejs.dev/) — build tooling
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [Chart.js](https://www.chartjs.org/) — visualizations
- Vanilla DOM — no framework

## License

MIT
