#!/usr/bin/env node
// Simulates generated Claude and Codex instruction loads. Automatic plans
// include matched pointers; optional full-reference accumulation is reported.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontmatterFields } from './build-distributions.mjs';
import { MANIFEST } from './manifest.mjs';
import { ROOT_END, ROOT_START } from './install-distribution.mjs';
import { loadThresholds, requiredThreshold } from './lib/thresholds.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repo, 'source');
const committedDist = path.join(repo, 'dist');
const EXPECTED_PROFILES = ['prototype', 'standard', 'high-assurance'];
const THRESHOLDS = await loadThresholds();
const BUDGETS = {
  profile_lines: requiredThreshold(THRESHOLDS, 'PROFILE_MAX_PHYSICAL_LINES'),
  profile_estimated_tokens: requiredThreshold(THRESHOLDS, 'PROFILE_MAX_ESTIMATED_TOKENS'),
  skill_lines: requiredThreshold(THRESHOLDS, 'SELECTED_SKILL_MAX_PHYSICAL_LINES'),
  skill_estimated_tokens: requiredThreshold(THRESHOLDS, 'SELECTED_SKILL_MAX_ESTIMATED_TOKENS'),
  skill_catalog_intrinsic_characters: requiredThreshold(THRESHOLDS, 'SKILL_CATALOG_MAX_CHARACTERS'),
  skill_catalog_representative_characters: requiredThreshold(THRESHOLDS, 'SKILL_CATALOG_MAX_CHARACTERS'),
  always_on_estimated_tokens: requiredThreshold(THRESHOLDS, 'ALWAYS_ON_MAX_ESTIMATED_TOKENS'),
  routed_load_estimated_tokens: requiredThreshold(THRESHOLDS, 'ROUTED_LOAD_MAX_ESTIMATED_TOKENS'),
};
const ESTIMATED_TOKEN_BYTES = requiredThreshold(THRESHOLDS, 'ESTIMATED_TOKEN_BYTES');

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
    estimated_tokens: Math.ceil(Buffer.byteLength(combined, 'utf8') / ESTIMATED_TOKEN_BYTES),
    estimator: `ceil(UTF-8 bytes / ${ESTIMATED_TOKEN_BYTES})`,
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

function plan(id, host, entries, conflictPairs, hostCapBytes, extras = {}) {
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
    host_cap_bytes: host === 'codex' ? hostCapBytes : null,
    omitted_due_to_host_cap: host === 'codex' && measured.bytes > hostCapBytes ? ['tail beyond project_doc_max_bytes'] : [],
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
  const codexGeneratedRoot = await artifact(codexRoot, 'AGENTS.md', ['templates/codex-root.md', ...MANIFEST.core, 'profiles/standard.md']);
  const codexContexts = (selectedNames) => {
    const selected = new Set(selectedNames);
    const content = codexGeneratedRoot.content.split('\n').filter((row) => !MANIFEST.contexts.some((context) =>
      !selected.has(context.name) && row.includes(`agent-rules/reference/${path.basename(context.source)}`))).join('\n');
    const obligationSources = MANIFEST.contexts
      .filter((context) => selected.has(context.name) && context.obligationSource)
      .map((context) => context.obligationSource);
    return [asInstalledRoot({ ...codexGeneratedRoot, sources: [...codexGeneratedRoot.sources, ...obligationSources], content })];
  };
  const codexEmptyBase = codexContexts([]);
  const codexBase = codexContexts(MANIFEST.contexts.map((context) => context.name));
  const claudeReviewer = await artifact(claudeRoot, '.claude/agents/code-reviewer.md', ['templates/code-reviewer.md', 'contexts/pr-review.md']);

  const claudeContexts = new Map();
  for (const context of MANIFEST.contexts) {
    claudeContexts.set(context.name, await artifact(claudeRoot, `.claude/rules/${context.rule}`,
      [context.ruleSource, ...(context.obligationSource ? [context.obligationSource] : [])]));
  }

  const skill = async (host, name) => {
    const root = host === 'claude' ? claudeRoot : codexRoot;
    const rel = host === 'claude' ? `.claude/skills/${name}/SKILL.md` : `.agents/skills/${name}/SKILL.md`;
    return artifact(root, rel, `skills/${name}.md`);
  };

  const reference = async (host, source) => {
    const root = host === 'claude' ? claudeRoot : codexRoot;
    const context = MANIFEST.contexts.find((candidate) => candidate.source === source);
    return artifact(root, `agent-rules/reference/${path.basename(source)}`,
      [source, ...(context?.obligationSource ? [context.obligationSource] : [])]);
  };

  return { claudeRoot, codexRoot, claudeBase, codexBase, codexEmptyBase, codexContexts, claudeContexts, claudeReviewer, reference, skill };
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
  const [conflictsDoc, modelsDoc, hostsDoc] = await Promise.all([
    text(path.join(sourceRoot, 'compatibility/conflicts.json')).then((value) => JSON.parse(value)),
    text(path.join(sourceRoot, 'compatibility/models.json')).then((value) => JSON.parse(value)),
    text(path.join(sourceRoot, 'compatibility/hosts.json')).then((value) => JSON.parse(value)),
  ]);
  const codexHostCap = hostsDoc.supported_hosts?.codex?.combined_project_instruction_bytes;
  if (!Number.isInteger(codexHostCap) || codexHostCap <= 0) throw new Error('Codex compatibility record needs combined_project_instruction_bytes');
  const conflictPairs = (conflictsDoc.directive_conflicts ?? []).map((entry) => entry.directive_ids);
  const built = await buildEntries(distributionRoot);
  const plans = [];
  const activeProfileNames = MANIFEST.profiles.map((source) => path.basename(source, '.md'));
  const canonicalSkillNames = MANIFEST.skills.map((skill) => skill.name);
  const reviewSkillNames = MANIFEST.skills.filter((skill) => skill.claude?.context === 'fork' && skill.claude?.agent === 'code-reviewer').map((skill) => skill.name);
  const profileEntries = {};
  const selectedCodexContexts = { selected_contexts: MANIFEST.contexts.map((context) => context.name) };

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
    plans.push(plan(`${host}:repository-root`, host, base, conflictPairs, codexHostCap, { scenario: 'repository root; Codex includes all selected contexts', selected_profile: 'standard', budget_class: 'always-on', ...(host === 'codex' ? selectedCodexContexts : {}) }));
    if (host === 'codex') plans.push(plan('codex:contexts:none', host, built.codexEmptyBase, conflictPairs, codexHostCap, { scenario: 'repository root with no selected contexts', selected_profile: 'standard', selected_contexts: [], budget_class: 'always-on' }));
    plans.push(plan(`${host}:deepest-source`, host, base, conflictPairs, codexHostCap, { scenario: 'deepest representative source directory; no generated nested root', budget_class: 'always-on' }));
    const frontendContexts = ['web-ui', 'typescript-react'];
    const frontend = host === 'claude'
      ? [...base, ...frontendContexts.map((name) => built.claudeContexts.get(name))]
      : built.codexContexts(frontendContexts);
    plans.push(plan(`${host}:frontend-path`, host, frontend, conflictPairs, codexHostCap, {
      scenario: 'frontend path with compact UI obligation and optional-reference pointers', budget_class: 'routed',
      routed_reference_reads: [],
      selected_contexts: frontendContexts,
      optional_reference_candidates: ['contexts/web-ui.md', 'contexts/typescript-react.md'],
    }));
    const backendContexts = ['backend-api'];
    const backend = host === 'claude'
      ? [...base, ...backendContexts.map((name) => built.claudeContexts.get(name))]
      : built.codexContexts(backendContexts);
    plans.push(plan(`${host}:backend-path`, host, backend, conflictPairs, codexHostCap, {
      scenario: 'backend path with an automatically matched optional-reference pointer', budget_class: 'routed',
      routed_reference_reads: [],
      selected_contexts: backendContexts,
      optional_reference_candidates: ['contexts/backend-api.md', 'quality/security.md'],
    }));
    plans.push(plan(`${host}:migration-path`, host, base, conflictPairs, codexHostCap, {
      scenario: 'persistent-data migration before an optional full-reference consultation', budget_class: 'always-on',
      optional_reference_candidates: ['contexts/database-migrations.md', 'quality/testing.md', 'quality/security.md'],
    }));
    const [largestProfileName, largestProfileEntries] = largestProfile[host];
    for (const skillDefinition of MANIFEST.skills) {
      const skillName = skillDefinition.name;
      const selected = [...largestProfileEntries];
      if (host === 'claude') selected.push(...built.claudeContexts.values());
      selected.push(await built.skill(host, skillName));
      const isClaudeReview = host === 'claude'
        && skillDefinition.claude?.context === 'fork'
        && skillDefinition.claude?.agent === 'code-reviewer';
      plans.push(plan(`${host}:skill:${skillName}`, host, selected, conflictPairs, codexHostCap, {
        scenario: host === 'claude'
          ? `${skillName} on api/**/*.tsx with largest active profile ${largestProfileName}; all three generated path pointers and one selected skill load`
          : `${skillName} selected with largest active profile ${largestProfileName}; one selected skill body loads`,
        selected_skill: skillName,
        selected_profile: largestProfileName,
        selected_contexts: MANIFEST.contexts.map((context) => context.name),
        skill_kind: 'canonical',
        dispatches_review_fork: isClaudeReview,
        budget_class: 'routed',
        routed_reference_reads: [],
        ...(host === 'claude' ? {
          matched_path: 'api/**/*.tsx',
          dynamically_matched_contexts: [...built.claudeContexts.keys()],
          automatic_route_sources: MANIFEST.contexts.flatMap((context) => [context.ruleSource, ...(context.obligationSource ? [context.obligationSource] : [])]),
        } : {}),
      }));
      if (isClaudeReview) {
        plans.push(plan(`${host}:review-fork:${skillName}`, host, [...selected, built.claudeReviewer], conflictPairs, codexHostCap, {
          scenario: `${skillName} read-only fork with the selected skill task prompt, all possible path pointers, its agent prompt, and no parent conversation history`,
          forked_skill: skillName,
          selected_profile: largestProfileName,
          skill_kind: 'review-fork',
          review_fork: true,
          budget_class: 'routed',
          routed_reference_reads: [],
        }));
      }
    }
    for (const profileName of activeProfileNames.filter((name) => name !== 'standard')) {
      plans.push(plan(`${host}:profile:${profileName}`, host, profileEntries[host].get(profileName), conflictPairs, codexHostCap, { scenario: `${profileName} profile selected`, selected_profile: profileName, budget_class: 'always-on', ...(host === 'codex' ? selectedCodexContexts : {}) }));
    }
  }
  for (const overlay of modelsDoc.overlays ?? []) {
    const entries = overlay.host === 'claude' ? built.claudeBase : built.codexBase;
    plans.push(plan(`${overlay.host}:model:${overlay.id}`, overlay.host, entries, conflictPairs, codexHostCap, {
      scenario: `${overlay.id} compatibility record`, model_overlay: overlay.id,
      evaluation_model: overlay.evaluation_model, evaluation_effort: overlay.evaluation_effort,
      overlay_prompt_bytes: 0, budget_class: 'always-on',
    }));
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
  const largestSkillName = Object.entries(skillMetrics)
    .sort((left, right) => right[1].bytes - left[1].bytes || left[0].localeCompare(right[0]))[0][0];
  const optionalReferenceCumulative = [];
  for (const host of ['claude', 'codex']) {
    const optionalReferences = await Promise.all(MANIFEST.reference.map((source) => built.reference(host, source)));
    const pointers = host === 'claude' ? [...built.claudeContexts.values()] : [];
    const [profileName, largestProfileBase] = largestProfile[host];
    const profileBase = host === 'codex'
      ? await selectedProfileEntries(host, built.codexContexts(MANIFEST.contexts.map((context) => context.name)), distributionRoot, profileName)
      : largestProfileBase;
    const selectedSkill = await built.skill(host, largestSkillName);
    optionalReferenceCumulative.push(plan(`${host}:all-optional-references`, host,
      [...profileBase, ...pointers, selectedSkill, ...optionalReferences], conflictPairs, codexHostCap, {
        scenario: `largest profile, all matching pointers, largest skill, and every optional full reference consulted`,
        selected_profile: profileName,
        selected_skill: largestSkillName,
        budget_class: 'measured-optional-cumulative',
        full_reference_reads: optionalReferences.map((entry) => entry.generated),
        host_cap_bytes: null,
        omitted_due_to_host_cap: [],
      }));
  }
  {
    const optionalReferences = await Promise.all(MANIFEST.reference.map((source) => built.reference('claude', source)));
    const [profileName, profileBase] = largestProfile.claude;
    const largestReviewSkillName = reviewSkillNames
      .sort((left, right) => skillMetrics[right].bytes - skillMetrics[left].bytes || left.localeCompare(right))[0];
    const reviewSkill = await built.skill('claude', largestReviewSkillName);
    optionalReferenceCumulative.push(plan('claude:review-fork:all-optional-references', 'claude',
      [...profileBase, ...built.claudeContexts.values(), reviewSkill, built.claudeReviewer, ...optionalReferences], conflictPairs, codexHostCap, {
        scenario: 'read-only review fork with its selected skill, all possible path pointers, agent prompt, and every optional full reference consulted',
        selected_profile: profileName,
        selected_skill: largestReviewSkillName,
        budget_class: 'measured-optional-cumulative',
        full_reference_reads: optionalReferences.map((entry) => entry.generated),
      }));
  }

  return {
    schema_version: 5,
    budgets: BUDGETS,
    skill_catalog_intrinsic_format: 'name\\tdescription\\trepository-relative-path',
    skill_catalog_intrinsic_characters: catalogIntrinsicCharacters,
    skill_catalog_representative_target_root: '/workspace/project',
    skill_catalog_representative_characters: catalogRepresentativeCharacters,
    skill_catalog_representative_estimated_tokens: Math.ceil(Buffer.byteLength(representativeCatalogEntries.join('\n'), 'utf8') / ESTIMATED_TOKEN_BYTES),
    skill_catalog_measurement: 'intrinsic excludes the variable target-root prefix; representative uses /workspace/project; both exclude skills supplied by other scopes',
    profile_inventory: { active: activeProfileNames, manifest: activeProfileNames },
    skill_inventory: { canonical: canonicalSkillNames, all: canonicalSkillNames, review_forks: reviewSkillNames },
    model_inventory: (modelsDoc.overlays ?? []).map((overlay) => ({
      id: overlay.id, host: overlay.host,
      evaluation_model: overlay.evaluation_model, evaluation_effort: overlay.evaluation_effort,
    })),
    context_routes: MANIFEST.contexts.map((context) => ({
      name: context.name,
      source: context.source,
      rule_source: context.ruleSource,
      obligation_source: context.obligationSource ?? null,
      references: context.references,
      generated: `.claude/rules/${context.rule}`,
    })),
    largest_skill_profile: Object.fromEntries(Object.entries(largestProfile).map(([host, [name, entries]]) => [host, { name, ...metrics(entries) }])),
    profiles: profileMetrics,
    skills: skillMetrics,
    plans,
    optional_reference_inventory: MANIFEST.reference,
    optional_reference_cumulative: optionalReferenceCumulative,
  };
}

export function runtimeLoadErrors(report) {
  const errors = [];
  const sameMembers = (actual, expected) => actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
  if (report.schema_version !== 5) errors.push(`runtime report schema_version must be 5, found ${report.schema_version}`);
  const activeProfiles = report.profile_inventory?.active ?? [];
  const manifestProfiles = report.profile_inventory?.manifest ?? [];
  if (!sameMembers(activeProfiles, EXPECTED_PROFILES)) errors.push(`active profiles must be exactly ${EXPECTED_PROFILES.join(', ')}`);
  if (!sameMembers(manifestProfiles, activeProfiles)) errors.push('every manifest profile must be active and canonical');
  const canonicalSkills = report.skill_inventory?.canonical ?? [];
  const allSkills = report.skill_inventory?.all ?? [];
  const reviewSkills = report.skill_inventory?.review_forks ?? [];
  if (!canonicalSkills.length || new Set(canonicalSkills).size !== canonicalSkills.length) errors.push('skill inventory must contain unique canonical skills');
  if (!sameMembers(allSkills, canonicalSkills)) errors.push('every public skill must be canonical');
  if (new Set(reviewSkills).size !== reviewSkills.length || reviewSkills.some((name) => !allSkills.includes(name))) errors.push('review-fork skill inventory must contain unique public skill names');

  const contextRoutes = report.context_routes ?? [];
  const contextNames = contextRoutes.map((context) => context.name);
  if (new Set(contextNames).size !== contextNames.length) errors.push('runtime context route names must be unique');
  for (const context of contextRoutes) {
    if (!context.rule_source || !context.generated || !(context.references?.length)) errors.push(`runtime context route ${context.name ?? '(missing)'} lacks source, generated, or reference attribution`);
    const declared = MANIFEST.contexts.find((candidate) => candidate.name === context.name);
    if ((context.obligation_source ?? null) !== (declared?.obligationSource ?? null)) errors.push(`runtime context route ${context.name ?? '(missing)'} has incorrect compact obligation attribution`);
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
    const automaticTokens = plan.estimated_tokens + (report.skill_catalog_representative_estimated_tokens ?? 0);
    if (plan.budget_class === 'always-on' && automaticTokens > BUDGETS.always_on_estimated_tokens) errors.push(`${plan.id} plus the representative skill catalog estimates ${automaticTokens} automatic tokens; budget is ${BUDGETS.always_on_estimated_tokens}`);
    if (plan.budget_class === 'routed' && automaticTokens > BUDGETS.routed_load_estimated_tokens) errors.push(`${plan.id} plus the representative skill catalog estimates ${automaticTokens} automatic-and-one-skill tokens; budget is ${BUDGETS.routed_load_estimated_tokens}`);
    if (plan.budget_class === 'routed' && !Array.isArray(plan.routed_reference_reads)) errors.push(`${plan.id} must enumerate routed reference reads`);
    for (const source of plan.optional_reference_candidates ?? []) {
      if (!(report.optional_reference_inventory ?? []).includes(source)) errors.push(`${plan.id} names unknown optional reference ${source}`);
      if (plan.ordered_source_files.includes(source)) errors.push(`${plan.id} includes optional full reference ${source} in its automatic load`);
    }
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
        const automaticRouteSources = contextRoutes.flatMap((context) => [context.rule_source, ...(context.obligation_source ? [context.obligation_source] : [])]);
        if (!sameMembers(skillPlan.automatic_route_sources ?? [], automaticRouteSources)) errors.push(`${skillPlan.id} does not attribute every automatic Claude route source`);
        for (const context of contextRoutes) if (!skillPlan.ordered_source_files.includes(context.rule_source)) errors.push(`${skillPlan.id} omits automatic route source ${context.rule_source}`);
        for (const context of contextRoutes.filter((candidate) => candidate.obligation_source)) if (!skillPlan.ordered_source_files.includes(context.obligation_source)) errors.push(`${skillPlan.id} omits compact obligation source ${context.obligation_source}`);
        const expectsReviewer = reviewSkills.includes(skillPlan.selected_skill);
        if (skillPlan.dispatches_review_fork !== expectsReviewer) errors.push(`${skillPlan.id} review-fork dispatch metadata does not match the skill manifest`);
        if (skillPlan.ordered_generated_files.includes('.claude/agents/code-reviewer.md')) errors.push(`${skillPlan.id} mixes a separate review-fork prompt into the parent load`);
      }
    }
    const dedicatedProfilePlans = new Map(activeProfiles.map((profile) => [profile,
      report.plans.filter((candidate) => candidate.host === host
        && candidate.selected_profile === profile
        && (candidate.id === `${host}:repository-root` || candidate.id === `${host}:profile:${profile}`)),
    ]));
    for (const [profile, matches] of dedicatedProfilePlans) {
      if (matches.length !== 1) errors.push(`${host} active profile ${profile} must have exactly one dedicated runtime plan`);
      if (host !== 'codex' || matches.length !== 1) continue;
      const selectedRoot = matches[0];
      if (selectedRoot.budget_class !== 'always-on') errors.push(`${selectedRoot.id} must count selected Codex context content as always-on`);
      if (!sameMembers(selectedRoot.selected_contexts ?? [], contextNames)) errors.push(`${selectedRoot.id} must include all selected Codex contexts`);
      for (const route of contextRoutes.filter((context) => context.obligation_source)) {
        if (!selectedRoot.ordered_source_files.includes(route.obligation_source)) errors.push(`${selectedRoot.id} omits selected Codex obligation source ${route.obligation_source}`);
      }
    }
  }
  const reviewForkPlans = report.plans.filter((candidate) => candidate.forked_skill);
  if (!sameMembers(reviewForkPlans.map((candidate) => candidate.forked_skill), reviewSkills)) errors.push('Claude review-fork plans must cover every review-fork skill exactly once');
  for (const forkPlan of reviewForkPlans) {
    if (forkPlan.host !== 'claude' || forkPlan.skill_kind !== 'review-fork' || forkPlan.review_fork !== true) errors.push(`${forkPlan.id} has invalid review-fork metadata`);
    if (forkPlan.selected_profile !== report.largest_skill_profile?.claude?.name) errors.push(`${forkPlan.id} does not use the largest active Claude profile`);
    if (!forkPlan.ordered_generated_files.includes(`.claude/skills/${forkPlan.forked_skill}/SKILL.md`)) errors.push(`${forkPlan.id} omits its selected skill task prompt`);
    for (const context of contextRoutes) if (!forkPlan.ordered_source_files.includes(context.rule_source)) errors.push(`${forkPlan.id} omits possible automatic route pointer ${context.rule_source}`);
    if (!forkPlan.ordered_generated_files.includes('.claude/agents/code-reviewer.md')) errors.push(`${forkPlan.id} omits the review-fork prompt`);
  }
  const expectedFullReferences = (report.optional_reference_inventory ?? []).map((source) => `agent-rules/reference/${path.posix.basename(source)}`);
  const cumulative = report.optional_reference_cumulative ?? [];
  if (cumulative.length !== 3) errors.push('runtime report must measure Codex, Claude, and Claude review-fork cumulative optional reference loads');
  for (const item of cumulative) {
    if (item.budget_class !== 'measured-optional-cumulative') errors.push(`${item.id} must identify its optional cumulative measurement class`);
    if (!sameMembers(item.full_reference_reads ?? [], expectedFullReferences)) errors.push(`${item.id} does not account for every optional full reference`);
  }
  const cumulativeFork = cumulative.find((item) => item.id === 'claude:review-fork:all-optional-references');
  if (cumulativeFork) {
    if (!reviewSkills.includes(cumulativeFork.selected_skill)) errors.push('Claude review-fork cumulative measurement must include a review-fork skill task prompt');
    if (!cumulativeFork.ordered_generated_files.includes(`.claude/skills/${cumulativeFork.selected_skill}/SKILL.md`)) errors.push('Claude review-fork cumulative measurement omits its selected skill task prompt');
    for (const context of contextRoutes) if (!cumulativeFork.ordered_source_files.includes(context.rule_source)) errors.push(`Claude review-fork cumulative measurement omits possible automatic route pointer ${context.rule_source}`);
  }
  const modelPlans = report.plans.filter((candidate) => candidate.model_overlay).map((candidate) => ({
    id: candidate.model_overlay, host: candidate.host,
    evaluation_model: candidate.evaluation_model, evaluation_effort: candidate.evaluation_effort,
  }));
  const expectedModelPlans = report.model_inventory ?? [];
  for (const model of expectedModelPlans) if (!['claude', 'codex'].includes(model.host)) errors.push(`model overlay ${model.id} names unsupported runtime host ${model.host}`);
  if (modelPlans.length !== expectedModelPlans.length
    || !expectedModelPlans.every((expected) => modelPlans.filter((actual) => JSON.stringify(actual) === JSON.stringify(expected)).length === 1)) {
    errors.push('runtime model plans must cover every compatibility overlay exactly once on its declared host');
  }
  const derivedPlanCount = (2 * (5 + allSkills.length + activeProfiles.length - 1)) + expectedModelPlans.length + reviewSkills.length + 1;
  if (report.plans.length !== derivedPlanCount) errors.push(`runtime report has ${report.plans.length} plans; inventory derives ${derivedPlanCount}`);
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
      for (const item of report.optional_reference_cumulative) console.log(`${item.id.padEnd(38)} ${String(item.physical_lines).padStart(4)} lines ${String(item.bytes).padStart(6)} bytes ~${String(item.estimated_tokens).padStart(4)} optional cumulative tokens`);
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
