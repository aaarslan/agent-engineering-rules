import {
  readPackage,
  selection,
  expectedFiles,
  kernelBody,
  estimates,
} from '../src/payload.mjs';
import { compose } from '../src/block.mjs';
import { requiredThreshold, THRESHOLDS } from '../src/thresholds.mjs';
export async function analyzeRuntimeLoads() {
  const pkg = await readPackage(),
    plans = [];
  for (const representation of ['portable', 'codex', 'claude-code'])
    for (const profile of ['prototype', 'standard', 'high-assurance'])
      for (const mode of [
        'root',
        'nested',
        'skill-only',
        'full-set',
        'plugin-kernel',
        'long-session',
      ]) {
        const s = selection(
          {
            profile,
            skills: mode === 'plugin-kernel' ? 'none' : 'all',
            destinations: [
              {
                representation,
                path:
                  mode === 'nested'
                    ? 'packages/app/.agents/skills'
                    : '.agents/skills',
              },
            ],
          },
          null,
          pkg,
        );
        const block = mode === 'skill-only' ? '' : compose(kernelBody(pkg, s)),
          files = expectedFiles(pkg, s);
        const cost = estimates(pkg, s, files, block);
        cost.catalogWithPathsCharacters += s.skills.reduce(
          (sum, n) => sum + '<consumer-root>/'.length,
          0,
        );
        plans.push({
          id: `${representation}:${profile}:${mode}`,
          representation,
          profile,
          mode,
          ...cost,
          uiClause:
            mode === 'skill-only'
              ? pkg.skills.get('aer-building-web-ui').body.includes('UI-01')
              : block.includes('UI-01'),
          cumulativeReferenceBytes:
            mode === 'long-session' ? cost.activatedSkillAndResourceBytes : 0,
          claims:
            'Structural loading estimate; plugin delivery deferred; repeated discovery and client truncation/cache behavior unmeasured.',
        });
      }
  return { schemaVersion: 1, plans };
}
export function runtimeLoadErrors(report) {
  const errors = [];
  if (
    report.plans.length !== 54 ||
    new Set(report.plans.map((p) => p.id)).size !== 54
  )
    errors.push('incomplete load scenarios');
  for (const p of report.plans)
    if (
      !p.uiClause ||
      (p.mode !== 'skill-only' &&
        (p.blockBytes === 0 ||
          p.blockBytes >
            requiredThreshold(THRESHOLDS, 'COMPOSED_BLOCK_MAX_BYTES') ||
          p.blockLines >
            requiredThreshold(THRESHOLDS, 'KERNEL_MAX_PHYSICAL_LINES'))) ||
      p.catalogWithPathsCharacters < p.rawCatalogCharacters
    )
      errors.push(`${p.id}: omitted content/accounting`);
  return errors;
}
if (process.argv[1]?.endsWith('validate-runtime-loads.mjs')) {
  const r = await analyzeRuntimeLoads(),
    errors = runtimeLoadErrors(r);
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      scenarios: r.plans.length,
      errors,
      maxBlockBytes: Math.max(...r.plans.map((p) => p.blockBytes)),
      maxCatalogEstimate: Math.max(
        ...r.plans.map((p) => p.catalogWithPathsCharacters),
      ),
      claim: 'No token/caching/cost measurement',
    }),
  );
  if (errors.length) process.exitCode = 1;
}
