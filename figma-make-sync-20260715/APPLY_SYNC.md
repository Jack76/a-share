# Apply this staged source update

The `figma-make-sync-20260715` folder is temporary staging input. Do not import
modules from this folder and do not redesign or rewrite the supplied code.

Copy each staged file byte-for-byte to the matching project-root path:

- `package.json`
- `vite.config.ts`
- `src/app/components/MarketBreadthIndicators.tsx`
- `src/app/context/Store.tsx`
- `src/app/services/marketData.ts`
- `src/app/types.ts`
- `src/app/utils/predatorEngine.ts`
- `src/app/utils/predictionCalibration.ts` (create if missing)
- `supabase/functions/server/index.tsx`
- `supabase/functions/server/market_rules.ts` (create if missing)

The following files are verification-only. They may be copied if the Make
workspace supports test files, but they are not required by the runtime build:

- `tests/marketRules.test.ts`
- `tests/predictionCalibration.test.ts`
- `README.md`

After copying:

1. Keep all existing files not listed above unchanged.
2. Run the production build and fix only concrete import or syntax errors.
3. Verify that `predictionCalibration.ts` and `market_rules.ts` resolve from
   their existing import statements.
4. Remove the temporary `figma-make-sync-20260715` staging folder. If deleting
   staged files is unavailable, leave the folder unreferenced.
5. Report the exact files changed and the build result.
