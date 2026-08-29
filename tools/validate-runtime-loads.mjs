#!/usr/bin/env node
// Simulates the generated Claude and Codex instruction loads that this project
// claims to support. Token counts use a documented bytes/4 approximation.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, frontmatterFields } from './build-distributions.mjs';
import { ROOT_END, ROOT_START } from './install-distribution.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repo, 'source');
const committedDist = path.join(repo, 'dist');
const CODEX_DEFAULT_BYTES = 32768;
const EXPECTED_RUNTIME_PLAN_COUNT = 36;
const EXPECTED_PROFILES = ['prototype', 'standard', 'high-assurance'];
const BUDGETS = {
  profile_lines: 20,
  profile_estimated_tokens: 400,
  skill_lines: 40,
  skill_estimated_tokens: 800,
  skill_catalog_intrinsic_characters: 2000,
  skill_catalog_representative_characters: 2000,
  always_on_estimated_tokens: 2000,
  kernel_profile_skill_estimated_tokens: 3500,
};

const posix = (value) => value.replaceAll('\\', '/');
const unique = (values) => [...new Set(values)];

async function text(file) {
  return readFile(file, 'utf8');
}

function metrics(entries) {
  const combined = entries.map((entry) => entry.content.trimEnd()).join('\n\n') + '\n';
  return {
    physical_lines: combined.trimEnd() ? combined.trimEnd().split(/\r?\n/).length : 0,
    bytes: Buffer.byteLength(combined, 'utf8'),
    estimated_tokens: Math.ceil(Buffer.byteLength(combined, 'utf8') / 4),
    estimator: 'ceil(UTF-8 bytes / 4)',
  };
}

function repeated(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value).sort();
}

async function artifact(root, rel, sources) {
  return { generated: rel, sources: Array.isArray(sources) ? sources : [sources], content: await text(path.join(root, rel)) };
}

function asInstalledRoot(entry) {
  return { ...entry, content: `${ROOT_START}\n${entry.content.trimEnd()}\n${ROOT_END}\n` };
}

function plan(id, host, entries, conflictPairs, extras = {}) {
  const ids = entries.flatMap((entry) => entry.content.match(/\bAE-\d{2}\b/g) ?? []);
  const idSet = new Set(ids);
  const conflicts = conflictPairs.filter(([left, right]) => idSet.has(left) && idSet.has(right));
  const measured = metrics(entries);
  return {
    id,
    host,
    ordered_source_files: unique(entries.flatMap((entry) => entry.sources)),
    ordered_generated_files: entries.map((entry) => entry.generated),
    merge_behavior: host === 'codex' ? 'root-to-leaf concatenation; generated distribution contributes one project-root AGENTS.md' : 'CLAUDE.md plus unscoped rules and matched path-scoped rules',
    ...measured,
    duplicate_directive_ids: repeated(ids),
    contradictory_directive_pairs: conflicts,
    omitted_due_to_host_cap: host === 'codex' && measured.bytes > CODEX_DEFAULT_BYTES ? ['tail beyond project_doc_max_bytes'] : [],
    deterministic_policy_delivery: 'consumer-owned',
    ...extras,
  };
}

async function buildEntries(distributionRoot) {
  const claudeRoot = path.join(distributionRoot, 'claude');
  const codexRoot = path.join(distributionRoot, 'codex');
  const claudeCore = await Promise.all(MANIFEST.core.map((source) => artifact(claudeRoot, `.claude/rules/core-${path.basename(source)}`, source)));
  const claudeBase = [
    asInstalledRoot(await artifact(claudeRoot, 'CLAUDE.md', 'templates/claude-root.md')),
    ...claudeCore,
    await artifact(claudeRoot, '.claude/rules/profile.md', 'profiles/standard.md'),
  ];
  const codexBase = [asInstalledRoot(await artifact(codexRoot, 'AGENTS.md', ['templates/codex-root.md', ...MANIFEST.core, 'profiles/standard.md']))];
  const claudeReviewer = await artifact(claudeRoot, '.claude/agents/code-reviewer.md', ['templates/code-reviewer.md', 'contexts/pr-review.md']);

  const claudeContexts = new Map();
  for (const context of MANIFEST.contexts) claudeContexts.set(context.name, await artifact(claudeRoot, `.claude/rules/${context.rule}`, context.ruleSource));

  const skill = async (host, name) => {
    const root = host === 'claude' ? claudeRoot : codexRoot;
    const rel = host === 'claude' ? `.claude/skills/${name}/SKILL.md` : `.agents/skills/${name}/SKILL.md`;
    return artifact(root, rel, `skills/${name}.md`);
  };

  return { claudeRoot, codexRoot, claudeBase, codexBase, claudeContexts, claudeReviewer, skill };
}

async function selectedProfileEntries(host, entries, distributionRoot, selectedProfile) {
  const hostRoot = path.join(distributionRoot, host);
  const standard = await text(path.join(hostRoot, 'agent-rules/profiles/standard.md'));
  const selected = await text(path.join(hostRoot, `agent-rules/profiles/${selectedProfile}.md`));
  if (host === 'claude') {
    const profile = entries.find((entry) => entry.generated === '.claude/rules/profile.md');
    const from = standard.trimEnd();
    if (!profile?.content.trimEnd().endsWith(from)) throw new Error('Claude profile rule does not contain the generated standard profile at the end');
    const content = `${profile.content.trimEnd().slice(0, -from.length)}${selected.trimEnd()}\n`;
    return entries.map((entry) => entry === profile ? { ...entry, sources: [`profiles/${selectedProfile}.md`], content } : entry);
  }
  const root = entries[0];
  if (!root.content.includes(standard.trim())) throw new Error('Codex root does not contain the generated standard profile exactly once');
  return [{ ...root, sources: root.sources.filter((source) => source !== 'profiles/standard.md').concat(`profiles/${selectedProfile}.md`), content: root.content.replace(standard.trim(), selected.trim()) }];
}

export async function analyzeRuntimeLoads(distributionRoot = committedDist) {
  const conflictsDoc = JSON.parse(await text(path.join(sourceRoot, 'compatibility/conflicts.json')));
  const modelsDoc = JSON.parse(await text(path.join(sourceRoot, 'compatibility/models.json')));
  const conflictPairs = (conflictsDoc.directive_conflicts ?? []).map((entry) => entry.directive_ids);
  const built = await buildEntries(distributionRoot);
  const plans = [];
  const activeProfileNames = MANIFEST.profiles.map((source) => path.basename(source, '.md'));
  const canonicalSkillNames = MANIFEST.skills.map((skill) => skill.name);
  const reviewSkillNames = MANIFEST.skills.filter((skill) => skill.claude?.context === 'fork' && skill.claude?.agent === 'code-reviewer').map((skill) => skill.name);
  const profileEntries = {};

  for (const host of ['claude', 'codex']) {
    const base = host === 'claude' ? built.claudeBase : built.codexBase;
    profileEntries[host] = new Map();
    for (const profileName of activeProfileNames) {
      profileEntries[host].set(profileName, profileName === 'standard'
        ? base
        : await selectedProfileEntries(host, base, distributionRoot, profileName));
    }
  }
  const largestProfile = Object.fromEntries(['claude', 'codex'].map((host) => [host,
    [...profileEntries[host]].sort((left, right) => metrics(right[1]).bytes - metrics(left[1]).bytes || left[0].localeCompare(right[0]))[0],
  ]));

  for (const host of ['claude', 'codex']) {
    const base = host === 'claude' ? built.claudeBase : built.codexBase;
    plans.push(plan(`${host}:repository-root`, host, base, conflictPairs, { scenario: 'repository root', selected_profile: 'standard', budget_class: 'always-on' }));
    plans.push(plan(`${host}:deepest-source`, host, base, conflictPairs, { scenario: 'deepest representative source directory; no generated nested root', budget_class: 'always-on' }));
    const frontend = host === 'claude' ? [...base, built.claudeContexts.get('web-ui'), built.claudeContexts.get('typescript-react')] : base;
    plans.push(plan(`${host}:frontend-path`, host, frontend, conflictPairs, { scenario: 'frontend path' }));
    const backend = host === 'claude' ? [...base, built.claudeContexts.get('backend-api')] : base;
    plans.push(plan(`${host}:backend-path`, host, backend, conflictPairs, { scenario: 'backend path' }));
    plans.push(plan(`${host}:migration-path`, host, base, conflictPairs, { scenario: 'migration path; task detail remains on demand', budget_class: 'always-on' }));
    const [largestProfileName, largestProfileEntries] = largestProfile[host];
    for (const skillDefinition of MANIFEST.skills) {
      const skillName = skillDefinition.name;
      const selected = [...largestProfileEntries];
      if (host === 'claude') selected.push(...built.claudeContexts.values());
      selected.push(await built.skill(host, skillName));
      const isClaudeReview = host === 'claude'
        && skillDefinition.claude?.context === 'fork'
        && skillDefinition.claude?.agent === 'code-reviewer';
      if (isClaudeReview) selected.push(built.claudeReviewer);
      plans.push(plan(`${host}:skill:${skillName}`, host, selected, conflictPairs, {
        scenario: host === 'claude'
          ? `${skillName} on api/**/*.tsx with largest active profile ${largestProfileName}; all three generated path routes match${isClaudeReview ? ' and the review fork adds code-reviewer' : ''}; subsequent reference reads are excluded`
          : `${skillName} selected with largest active profile ${largestProfileName}; on-demand skill body included`,
        selected_skill: skillName,
        selected_profile: largestProfileName,
        skill_kind: 'canonical',
        review_fork: isClaudeReview,
        ...(host === 'claude' ? {
          matched_path: 'api/**/*.tsx',
          dynamically_matched_contexts: [...built.claudeContexts.keys()],
          automatic_route_sources: MANIFEST.contexts.map((context) => context.ruleSource),
          on_demand_reference_reads_excluded: true,
        } : {}),
      }));
    }
    for (const profileName of activeProfileNames.filter((name) => name !== 'standard')) {
      plans.push(plan(`${host}:profile:${profileName}`, host, profileEntries[host].get(profileName), conflictPairs, { scenario: `${profileName} profile selected`, selected_profile: profileName, budget_class: 'always-on' }));
    }
  }
  for (const overlay of modelsDoc.overlays ?? []) {
    const entries = overlay.host === 'claude' ? built.claudeBase : built.codexBase;
    plans.push(plan(`${overlay.host}:model:${overlay.id}`, overlay.host, entries, conflictPairs, { scenario: `${overlay.id} compatibility record`, model_overlay: overlay.id, overlay_prompt_bytes: 0, budget_class: 'always-on' }));
  }

  const skillMetrics = {};
  const catalogEntries = [];
  for (const skill of MANIFEST.skills) {
    const source = await text(path.join(sourceRoot, `skills/${skill.name}.md`));
    const description = frontmatterFields(source).description ?? '';
    catalogEntries.push(`${skill.name}\t${description}\t.agents/skills/${skill.name}/SKILL.md`);
    const generated = await built.skill('codex', skill.name);
    skillMetrics[skill.name] = metrics([generated]);
  }
  const catalogIntrinsicCharacters = catalogEntries.join('\n').length;
  const representativeCatalogEntries = MANIFEST.skills.map((skill, index) => {
    const intrinsic = catalogEntries[index];
    return intrinsic.replace(`.agents/skills/${skill.name}/SKILL.md`, `/workspace/project/.agents/skills/${skill.name}/SKILL.md`);
  });
  const catalogRepresentativeCharacters = representativeCatalogEntries.join('\n').length;
  const profileMetrics = {};
  for (const name of activeProfileNames) {
    const profile = await artifact(path.join(distributionRoot, 'codex'), `agent-rules/profiles/${name}.md`, `profiles/${name}.md`);
    profileMetrics[name] = metrics([profile]);
  }

  return {
    schema_version: 4,
    budgets: BUDGETS,
    skill_catalog_intrinsic_format: 'name\\tdescription\\trepository-relative-path',
    skill_catalog_intrinsic_characters: catalogIntrinsicCharacters,
    skill_catalog_representative_target_root: '/workspace/project',
    skill_catalog_representative_characters: catalogRepresentativeCharacters,
    skill_catalog_measurement: 'intrinsic excludes the variable target-root prefix; representative uses /workspace/project; both exclude skills supplied by other scopes',
    profile_inventory: { active: activeProfileNames, manifest: activeProfileNames },
    skill_inventory: { canonical: canonicalSkillNames, all: canonicalSkillNames, review_forks: reviewSkillNames },
    model_inventory: (modelsDoc.overlays ?? []).map((overlay) => ({ id: overlay.id, host: overlay.host })),
    context_routes: MANIFEST.contexts.map((context) => ({
      name: context.name,
      source: context.source,
      rule_source: context.ruleSource,
      references: context.references,
      generated: `.claude/rules/${context.rule}`,
    })),
    largest_skill_profile: Object.fromEntries(Object.entries(largestProfile).map(([host, [name, entries]]) => [host, { name, ...metrics(entries) }])),
    profiles: profileMetrics,
    skills: skillMetrics,
    plans,
  };
}

export function runtimeLoadErrors(report) {
  const errors = [];
  const sameMembers = (actual, expected) => actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
  if (report.schema_version !== 4) errors.push(`runtime report schema_version must be 4, found ${report.schema_version}`);
  const activeProfiles = report.profile_inventory?.active ?? [];
  const manifestProfiles = report.profile_inventory?.manifest ?? [];
  if (!sameMembers(activeProfiles, EXPECTED_PROFILES)) errors.push(`active profiles must be exactly ${EXPECTED_PROFILES.join(', ')}`);
  if (!sameMembers(manifestProfiles, activeProfiles)) errors.push('every manifest profile must be active and canonical');
  const canonicalSkills = report.skill_inventory?.canonical ?? [];
  const allSkills = report.skill_inventory?.all ?? [];
  const reviewSkills = report.skill_inventory?.review_forks ?? [];
  if (canonicalSkills.length !== 10 || new Set(canonicalSkills).size !== 10) errors.push(`skill inventory must contain exactly 10 unique canonical skills, found ${canonicalSkills.length}`);
  if (!sameMembers(allSkills, canonicalSkills)) errors.push('every public skill must be canonical');
  if (new Set(reviewSkills).size !== reviewSkills.length || reviewSkills.some((name) => !allSkills.includes(name))) errors.push('review-fork skill inventory must contain unique public skill names');

  const contextRoutes = report.context_routes ?? [];
  const contextNames = contextRoutes.map((context) => context.name);
  if (new Set(contextNames).size !== contextNames.length) errors.push('runtime context route names must be unique');
  for (const context of contextRoutes) {
    if (!context.rule_source || !context.generated || !(context.references?.length)) errors.push(`runtime context route ${context.name ?? '(missing)'} lacks source, generated, or reference attribution`);
  }

  for (const [name, measured] of Object.entries(report.profiles)) {
    if (measured.physical_lines > BUDGETS.profile_lines) errors.push(`profile ${name} has ${measured.physical_lines} lines; budget is ${BUDGETS.profile_lines}`);
    if (measured.estimated_tokens > BUDGETS.profile_estimated_tokens) errors.push(`profile ${name} estimates ${measured.estimated_tokens} tokens; budget is ${BUDGETS.profile_estimated_tokens}`);
  }
  for (const [name, measured] of Object.entries(report.skills)) {
    if (measured.physical_lines > BUDGETS.skill_lines) errors.push(`skill ${name} has ${measured.physical_lines} lines; budget is ${BUDGETS.skill_lines}`);
    if (measured.estimated_tokens > BUDGETS.skill_estimated_tokens) errors.push(`skill ${name} estimates ${measured.estimated_tokens} tokens; budget is ${BUDGETS.skill_estimated_tokens}`);
  }
  if (report.skill_catalog_intrinsic_characters > BUDGETS.skill_catalog_intrinsic_characters) errors.push(`intrinsic skill catalog has ${report.skill_catalog_intrinsic_characters} characters; budget is ${BUDGETS.skill_catalog_intrinsic_characters}`);
  if (report.skill_catalog_representative_characters > BUDGETS.skill_catalog_representative_characters) errors.push(`representative absolute-path skill catalog has ${report.skill_catalog_representative_characters} characters; budget is ${BUDGETS.skill_catalog_representative_characters}`);
  for (const plan of report.plans) {
    if (plan.duplicate_directive_ids.length) errors.push(`${plan.id} repeats directives: ${plan.duplicate_directive_ids.join(', ')}`);
    if (plan.contradictory_directive_pairs.length) errors.push(`${plan.id} loads declared conflicts: ${JSON.stringify(plan.contradictory_directive_pairs)}`);
    if (plan.omitted_due_to_host_cap.length) errors.push(`${plan.id} exceeds the host cap and omits instructions`);
    if (plan.budget_class === 'always-on' && plan.estimated_tokens > BUDGETS.always_on_estimated_tokens) errors.push(`${plan.id} estimates ${plan.estimated_tokens} always-on tokens; budget is ${BUDGETS.always_on_estimated_tokens}`);
    if (plan.selected_skill && plan.estimated_tokens > BUDGETS.kernel_profile_skill_estimated_tokens) errors.push(`${plan.id} estimates ${plan.estimated_tokens} tokens; combined budget is ${BUDGETS.kernel_profile_skill_estimated_tokens}`);
  }
  for (const host of ['claude', 'codex']) {
    const skillPlans = report.plans.filter((candidate) => candidate.host === host && candidate.selected_skill);
    const covered = skillPlans.map((candidate) => candidate.selected_skill);
    if (!sameMembers(covered, allSkills)) errors.push(`${host} skill plans must cover every public skill exactly once; covered: ${covered.sort().join(', ')}`);
    for (const skillPlan of skillPlans) {
      if (skillPlan.skill_kind !== 'canonical') errors.push(`${skillPlan.id} must identify its selected skill as canonical`);
      if (skillPlan.selected_profile !== report.largest_skill_profile?.[host]?.name) errors.push(`${skillPlan.id} does not use the largest active ${host} profile`);
      if (host === 'claude') {
        if (!sameMembers(skillPlan.dynamically_matched_contexts ?? [], contextNames)) errors.push(`${skillPlan.id} does not model every dynamically matchable Claude route`);
        if (!sameMembers(skillPlan.automatic_route_sources ?? [], contextRoutes.map((context) => context.rule_source))) errors.push(`${skillPlan.id} does not attribute every automatic Claude route source`);
        if (skillPlan.on_demand_reference_reads_excluded !== true) errors.push(`${skillPlan.id} must state that subsequent on-demand reference reads are excluded`);
        for (const context of contextRoutes) if (!skillPlan.ordered_source_files.includes(context.rule_source)) errors.push(`${skillPlan.id} omits automatic route source ${context.rule_source}`);
        const expectsReviewer = reviewSkills.includes(skillPlan.selected_skill);
        if (skillPlan.review_fork !== expectsReviewer) errors.push(`${skillPlan.id} review-fork metadata does not match the skill manifest`);
        if (skillPlan.ordered_generated_files.includes('.claude/agents/code-reviewer.md') !== expectsReviewer) errors.push(`${skillPlan.id} reviewer prompt inclusion does not match the skill manifest`);
      }
    }
    const dedicatedProfilePlans = new Map(activeProfiles.map((profile) => [profile,
      report.plans.filter((candidate) => candidate.host === host
        && candidate.selected_profile === profile
        && (candidate.id === `${host}:repository-root` || candidate.id === `${host}:profile:${profile}`)),
    ]));
    for (const [profile, matches] of dedicatedProfilePlans) if (matches.length !== 1) errors.push(`${host} active profile ${profile} must have exactly one dedicated runtime plan`);
  }
  const modelPlans = report.plans.filter((candidate) => candidate.model_overlay).map((candidate) => ({ id: candidate.model_overlay, host: candidate.host }));
  const expectedModelPlans = report.model_inventory ?? [];
  for (const model of expectedModelPlans) if (!['claude', 'codex'].includes(model.host)) errors.push(`model overlay ${model.id} names unsupported runtime host ${model.host}`);
  if (modelPlans.length !== expectedModelPlans.length
    || !expectedModelPlans.every((expected) => modelPlans.filter((actual) => actual.id === expected.id && actual.host === expected.host).length === 1)) {
    errors.push('runtime model plans must cover every compatibility overlay exactly once on its declared host');
  }
  const derivedPlanCount = (2 * (5 + allSkills.length + activeProfiles.length - 1)) + expectedModelPlans.length;
  if (derivedPlanCount !== EXPECTED_RUNTIME_PLAN_COUNT) errors.push(`runtime inventory derives ${derivedPlanCount} plans; the canonical inventory requires ${EXPECTED_RUNTIME_PLAN_COUNT}`);
  if (report.plans.length !== EXPECTED_RUNTIME_PLAN_COUNT) errors.push(`runtime report has ${report.plans.length} plans; exact canonical coverage requires ${EXPECTED_RUNTIME_PLAN_COUNT}`);
  return errors;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  analyzeRuntimeLoads().then((report) => {
    const errors = runtimeLoadErrors(report);
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      for (const item of report.plans) console.log(`${item.id.padEnd(38)} ${String(item.physical_lines).padStart(4)} lines ${String(item.bytes).padStart(6)} bytes ~${String(item.estimated_tokens).padStart(4)} tokens`);
      console.log(`intrinsic skill catalog: ${report.skill_catalog_intrinsic_characters}/${BUDGETS.skill_catalog_intrinsic_characters} characters`);
      console.log(`representative skill catalog (${report.skill_catalog_representative_target_root}): ${report.skill_catalog_representative_characters}/${BUDGETS.skill_catalog_representative_characters} characters`);
    }
    if (errors.length) {
      console.error(`FAIL (${errors.length})`);
      for (const error of errors) console.error(`  - ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS (${report.plans.length} expanded runtime plans validated)`);
  }).catch((error) => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });
}
