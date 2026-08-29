#!/usr/bin/env node
// Free, deterministic preflight for directive ownership, compatibility and
// policy registries, evaluation scenarios, treatments, and provenance schema.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNoProviderHarness } from './preflight-eval-harness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repo, 'source');
const RUN_SCHEMA_ID = 'https://github.com/aaarslan/agent-engineering-rules/source/evals/run.schema.json';
const EXPECTED_DIRECTIVES = Array.from({ length: 25 }, (_, index) => `AE-${String(index + 1).padStart(2, '0')}`);
const EXPECTED_PROVIDERS = ['anthropic', 'openai'];
const OFFICIAL_MODEL_SOURCE_HOSTS = new Set(['platform.claude.com', 'developers.openai.com']);
const EXPECTED_TREATMENTS = [
  { id: 'host-baseline', kernel: false, profile: null, skill: null, verification: 'host-default' },
  { id: 'compact-kernel', kernel: 'current', profile: null, skill: null, verification: 'risk-based-evidence' },
  { id: 'compact-task', kernel: 'current', profile: 'task-selected', skill: 'task-matched', verification: 'risk-based-evidence' },
  { id: 'compact-verify', kernel: 'current', profile: 'task-selected', skill: 'aer-verify', verification: 'explicit' },
  { id: 'compact-high-assurance', kernel: 'current', profile: 'high-assurance', skill: 'task-matched', verification: 'justified-independent-review' },
];
const SCORE_FIELDS = ['strict_score', 'scope_drift_score', 'evidence_truthfulness_score'];

async function json(rel) {
  const text = await readFile(path.join(sourceRoot, rel), 'utf8');
  return JSON.parse(text);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated].sort();
}

function sameValue(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
    return sameValue(leftKeys, rightKeys) && leftKeys.every((key) => sameValue(left[key], right[key]));
  }
  return false;
}

export function schemaValidationErrors(value, schema, location = '$', rootSchema = schema) {
  const errors = [];
  const fail = (message) => errors.push(`${location}: ${message}`);

  if (schema.$ref) {
    const match = schema.$ref.match(/^#\/\$defs\/([A-Za-z0-9_-]+)$/);
    const target = match ? rootSchema.$defs?.[match[1]] : null;
    if (!target) return [`${location}: unsupported or missing schema reference ${schema.$ref}`];
    return schemaValidationErrors(value, target, location, rootSchema);
  }

  for (const subschema of schema.allOf ?? []) errors.push(...schemaValidationErrors(value, subschema, location, rootSchema));
  if (schema.if) {
    const conditionMatches = schemaValidationErrors(value, schema.if, location, rootSchema).length === 0;
    const branch = conditionMatches ? schema.then : schema.else;
    if (branch) errors.push(...schemaValidationErrors(value, branch, location, rootSchema));
  }

  if (Object.hasOwn(schema, 'const') && !sameValue(value, schema.const)) fail(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((candidate) => sameValue(value, candidate))) {
    fail(`must be one of ${schema.enum.map((candidate) => JSON.stringify(candidate)).join(', ')}`);
  }

  const matchesType = (type) => {
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'null') return value === null;
    return typeof value === type;
  };
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some(matchesType)) {
    fail(`must have type ${types.join(' or ')}`);
    return errors;
  }

  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) fail(`must contain at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && length > schema.maxLength) fail(`must contain at most ${schema.maxLength} characters`);
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern)).test(value)) fail(`must match ${schema.pattern}`);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be at most ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`must contain at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`must contain at most ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) fail('must contain unique items');
    if (schema.items) value.forEach((item, index) => errors.push(...schemaValidationErrors(item, schema.items, `${location}[${index}]`, rootSchema)));
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) fail(`must contain at least ${schema.minProperties} properties`);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) fail(`must contain at most ${schema.maxProperties} properties`);
    for (const name of schema.required ?? []) if (!Object.hasOwn(value, name)) fail(`is missing required property ${name}`);
    for (const [name, item] of Object.entries(value)) {
      if (schema.propertyNames) errors.push(...schemaValidationErrors(name, schema.propertyNames, `${location} property ${JSON.stringify(name)}`, rootSchema));
      if (schema.properties?.[name]) {
        errors.push(...schemaValidationErrors(item, schema.properties[name], `${location}.${name}`, rootSchema));
      } else if (schema.additionalProperties === false) {
        fail(`contains unsupported property ${name}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...schemaValidationErrors(item, schema.additionalProperties, `${location}.${name}`, rootSchema));
      }
    }
  }

  return errors;
}

function strictIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

export function registryEnumErrors(field, registryValues, schemaValues) {
  if (!Array.isArray(schemaValues)) return [`evaluation run schema ${field} must be an enum`];
  const errors = duplicates(schemaValues).map((duplicate) => `evaluation run schema ${field} repeats ${duplicate}`);
  const registry = new Set(registryValues);
  const declared = new Set(schemaValues);
  for (const value of registry) if (!declared.has(value)) errors.push(`evaluation run schema ${field} omits registry value ${value}`);
  for (const value of declared) if (!registry.has(value)) errors.push(`evaluation run schema ${field} contains unknown registry value ${value}`);
  return errors;
}

export function reviewWindowErrors(label, reviewedValue, revalidateValue, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  const reviewed = strictIsoDate(reviewedValue);
  const revalidateAfter = strictIsoDate(revalidateValue);
  if (!reviewed) errors.push(`${label} reviewed must be strict ISO YYYY-MM-DD`);
  if (!revalidateAfter) errors.push(`${label} revalidate_after must be strict ISO YYYY-MM-DD`);
  if (reviewed && revalidateAfter && reviewed >= revalidateAfter) errors.push(`${label} revalidate_after must be later than reviewed`);
  if (reviewed && reviewed > today) errors.push(`${label} reviewed date ${reviewed} is in the future`);
  if (revalidateAfter && revalidateAfter < today) errors.push(`${label} capability record expired after ${revalidateAfter}`);
  return errors;
}

export function runRecordSemanticErrors(record, context = {}) {
  const errors = [];
  const problem = (message) => errors.push(message);
  const artifacts = record.artifacts && typeof record.artifacts === 'object' && !Array.isArray(record.artifacts)
    ? record.artifacts : {};
  const experimentArms = context.experimentArms ?? new Map();
  const artifact = (name, label, expected = null) => {
    if (name === null || name === undefined) return;
    const found = artifacts[name];
    if (!found) { problem(`${label} references missing artifact ${name}`); return; }
    if (expected?.sha256 && found.sha256 !== expected.sha256) problem(`${label} hash does not match artifact ${name}`);
    if (expected?.content_type && found.content_type !== expected.content_type) problem(`${label} content type does not match artifact ${name}`);
  };

  const expanded = record.instructions?.expanded_artifact;
  artifact(expanded?.name, 'expanded instructions', expanded);
  artifact(record.instruction_assembly?.name, 'instruction assembly', record.instruction_assembly);
  artifact(record.execution_config?.name, 'execution config', record.execution_config);
  artifact(record.raw_output?.name, 'raw output', record.raw_output);
  artifact(record.grader?.output_artifact, 'grader output', {
    sha256: record.grader?.output_sha256,
    content_type: 'application/json',
  });
  for (const [label, entries] of [['tool call', record.tool_calls], ['test run', record.test_runs]]) {
    for (const entry of entries ?? []) artifact(entry.output_artifact, `${label} ${entry.sequence}`);
  }
  for (const retry of record.retries ?? []) artifact(retry.prior_result_artifact, `retry ${retry.sequence}`);

  const contiguous = (entries, label) => {
    for (let index = 0; index < (entries ?? []).length; index += 1) {
      if (entries[index].sequence !== index + 1) problem(`${label} sequence must be contiguous from 1`);
    }
  };
  contiguous(record.tool_calls, 'tool call');
  contiguous(record.test_runs, 'test run');
  contiguous(record.retries, 'retry');
  for (const test of record.test_runs ?? []) {
    if (test.status === 'passed' && test.exit_code !== 0) problem(`test run ${test.sequence} passed without exit code 0`);
    if (test.status === 'invalid' && test.exit_code !== null) problem(`invalid test run ${test.sequence} must use a null exit code`);
    if (test.status === 'failed' && !Number.isInteger(test.exit_code)) problem(`failed test run ${test.sequence} must record an exit code`);
  }

  if (record.tokens?.total !== record.tokens?.input + record.tokens?.output) problem('tokens.total must equal input plus output');

  const expectedProvider = { claude: 'anthropic', codex: 'openai' }[record.host];
  if (expectedProvider && record.provider !== expectedProvider) problem(`${record.host} runs require provider ${expectedProvider}`);
  const task = context.tasks?.get(record.task_id);
  if (!task) problem(`run references unknown task ${record.task_id}`);
  else {
    if (record.task_contract_sha256 !== task.task_contract_sha256) problem(`task_contract_sha256 does not match exact bytes for ${record.task_id}`);
    if (record.scenario_id !== task.scenario_id) problem(`task ${record.task_id} requires scenario ${task.scenario_id}`);
    if (record.grader?.id !== task.grader_id) problem(`task ${record.task_id} requires grader ${task.grader_id}`);
  }

  const authorization = record.provider_authorization ?? {};
  if (authorization.authorized === false) {
    if (authorization.reference !== null || authorization.spend_cap_usd !== 0) problem('unauthorized provider runs require a null reference and zero spend cap');
    if (record.cost_usd !== 0) problem('unauthorized provider runs cannot record external cost');
    if (record.execution_status !== 'invalid') problem('an executed provider run requires explicit provider authorization');
  } else if (authorization.authorized === true) {
    if (typeof authorization.reference !== 'string' || !authorization.reference.trim()) problem('authorized provider runs require a non-empty authorization reference');
    if (!(authorization.spend_cap_usd > 0)) problem('authorized provider runs require a positive spend cap');
    if (record.cost_usd > authorization.spend_cap_usd) problem('run cost exceeds the authorized provider spend cap');
  }

  const nodes = record.subagents?.nodes ?? [];
  if (record.subagents?.count !== nodes.length) problem('subagents.count must equal the topology node count');
  const nodeIds = new Set();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) problem(`subagent topology repeats node ${node.id}`);
    nodeIds.add(node.id);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (node.parent_id === null) {
      if (node.depth !== 1) problem(`root subagent ${node.id} must have depth 1`);
    } else {
      const parent = byId.get(node.parent_id);
      if (!parent) problem(`subagent ${node.id} references missing parent ${node.parent_id}`);
      else if (node.depth !== parent.depth + 1) problem(`subagent ${node.id} depth does not follow parent ${node.parent_id}`);
    }
  }
  const measuredDepth = nodes.length ? Math.max(...nodes.map((node) => node.depth)) : 0;
  if (record.subagents?.max_depth !== measuredDepth) problem('subagents.max_depth must equal the topology maximum');
  const measuredSpend = nodes.reduce((sum, node) => sum + node.spend_usd, 0);
  if (Math.abs((record.subagents?.spend_usd ?? 0) - measuredSpend) > 1e-9) problem('subagents.spend_usd must equal topology node spend');
  if ((record.subagents?.spend_usd ?? 0) > (authorization.spend_cap_usd ?? 0)) problem('subagent spend exceeds the authorized provider spend cap');
  for (const node of nodes) {
    const seen = new Set([node.id]);
    let parentId = node.parent_id;
    while (parentId !== null) {
      if (seen.has(parentId)) { problem(`subagent topology contains a cycle through ${parentId}`); break; }
      seen.add(parentId);
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
  }

  const logicalPath = (value, { allowDot = false } = {}) => {
    if (allowDot && value === '.') return true;
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/.test(value)
      && !value.includes('//') && !value.includes('/./') && !value.includes('/../')
      && !value.endsWith('/') && !value.endsWith('/.') && !value.endsWith('/..') && !value.includes('\\')
      && path.posix.normalize(value) === value;
  };
  for (const [kind, values] of Object.entries(record.instructions?.components ?? {})) {
    for (const key of Object.keys(values ?? {})) if (!logicalPath(key)) problem(`instruction component ${kind} has non-canonical logical key ${key}`);
  }
  const requiredComponents = {
    'compact-kernel': ['kernel'],
    'compact-task': ['kernel', 'profile', 'skill'],
    'compact-verify': ['kernel', 'profile', 'skill'],
    'compact-high-assurance': ['kernel', 'profile', 'skill'],
  }[record.treatment_id] ?? [];
  for (const component of requiredComponents) if (!Object.keys(record.instructions?.components?.[component] ?? {}).length) problem(`${record.treatment_id} requires a non-empty ${component} component map`);
  for (const test of record.test_runs ?? []) if (!logicalPath(test.working_directory, { allowDot: true })) problem(`test run ${test.sequence} has a non-canonical working directory`);

  if (record.grader_status === 'passed' && (record.execution_status !== 'passed' || record.artifact_status !== 'passed')) {
    problem('grader_status cannot pass unless execution and artifact capture passed');
  }
  if (record.experiment_id === null) {
    if (record.experiment_arm_id !== null) problem('non-experiment runs require a null experiment arm');
    if (record.experiment_factor_value !== null) problem('non-experiment runs require a null experiment factor value');
    if (record.cell_id !== null) problem('non-experiment runs require a null frozen cell ID');
    if (authorization.authorized !== false || authorization.reference !== null || authorization.spend_cap_usd !== 0
      || record.cost_usd !== 0 || record.execution_status !== 'invalid' || record.artifact_status !== 'invalid'
      || record.grader_status !== 'invalid' || SCORE_FIELDS.some((field) => record[field] !== null)) {
      problem('version-2 non-experiment records are structural examples only; executable treatment runs require a future byte-frozen application registry');
    }
  } else {
    if (typeof record.cell_id !== 'string' || !record.cell_id) problem('experiment runs require a non-empty frozen cell ID');
    const arms = experimentArms.get(record.experiment_id);
    if (!arms) problem(`experiment run references unknown experiment ${record.experiment_id}`);
    else if (!arms.has(record.experiment_arm_id)) problem(`experiment ${record.experiment_id} has unknown arm ${record.experiment_arm_id}`);
    if (task) {
      const coverage = (task.experiment_coverage ?? []).find((entry) => entry.experiment_id === record.experiment_id);
      if (!coverage?.arm_ids?.includes(record.experiment_arm_id)) {
        problem(`task ${task.id} experiment_coverage does not contain experiment ${record.experiment_id} arm ${record.experiment_arm_id}`);
      }
      const contract = task.instruction_contract;
      if (!contract) {
        problem(`task ${task.id} lacks an instruction component contract`);
      } else {
        const expectedLogicalNames = {
          kernel: [contract.kernel_logical_name],
          profile: [contract.profile_logical_name],
          skill: contract.skill_logical_names,
        };
        for (const [kind, expectedNames] of Object.entries(expectedLogicalNames)) {
          const actualNames = Object.keys(record.instructions?.components?.[kind] ?? {}).sort();
          const expected = [...(expectedNames ?? [])].sort();
          if (!sameValue(actualNames, expected)) {
            problem(`task ${task.id} requires exact ${kind} logical components ${expected.join(', ')}`);
          }
        }
        for (const kind of contract.forbidden_kinds ?? []) {
          if (Object.keys(record.instructions?.components?.[kind] ?? {}).length) {
            problem(`task ${task.id} forbids ${kind} instruction components`);
          }
        }
      }
    }
    const experiment = context.experiments?.get(record.experiment_id);
    if (experiment) {
      const selectedArm = experiment.arms.find((arm) => arm.id === record.experiment_arm_id);
      if (selectedArm && !sameValue(record.experiment_factor_value, selectedArm.value)) problem(`experiment ${record.experiment_id} factor value does not match arm ${record.experiment_arm_id}`);
      if (!experiment.hosts.includes(record.host)) problem(`experiment ${record.experiment_id} does not support host ${record.host}`);
      if (!experiment.scenario_ids.includes(record.scenario_id)) problem(`experiment ${record.experiment_id} does not include scenario ${record.scenario_id}`);
      if (record.treatment_id !== experiment.base_treatment_id) problem(`experiment ${record.experiment_id} requires base treatment ${experiment.base_treatment_id}`);
      if (experiment.model_overlay_id !== null) {
        const overlay = context.overlays?.get(experiment.model_overlay_id);
        const patterns = overlay?.match?.patterns ?? [];
        const matches = patterns.some((pattern) => new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\*', '.*')}$`).test(record.model));
        if (!matches) problem(`experiment ${record.experiment_id} model does not match overlay ${experiment.model_overlay_id}`);
      }
      if (experiment.factor === 'effort' && record.effort !== record.experiment_factor_value) problem(`experiment ${record.experiment_id} effort must equal its applied factor value`);
      if (experiment.factor === 'maximum_subagents' && record.subagents?.count > record.experiment_factor_value) problem(`experiment ${record.experiment_id} subagent topology exceeds its applied maximum`);
    }

    const configuredPlans = context.cellPlans;
    const planValues = configuredPlans instanceof Map
      ? [...configuredPlans.values()]
      : Array.isArray(configuredPlans)
        ? configuredPlans
        : Array.isArray(configuredPlans?.cells)
          ? configuredPlans.cells
          : configuredPlans && typeof configuredPlans === 'object'
            ? Object.values(configuredPlans)
            : [];
    const cell = configuredPlans instanceof Map && configuredPlans.has(record.cell_id)
      ? configuredPlans.get(record.cell_id)
      : planValues.find((candidate) => candidate?.cell_id === record.cell_id);
    if (!configuredPlans) {
      problem('experiment semantic validation requires the frozen cell plan registry');
    } else if (!cell) {
      problem(`experiment run references unknown frozen cell ${record.cell_id}`);
    } else {
      const exactFields = [
        ['experiment_id', cell.experiment_id, record.experiment_id],
        ['experiment_arm_id', cell.experiment_arm_id ?? cell.arm_id, record.experiment_arm_id],
        ['host', cell.host, record.host],
        ['scenario_id', cell.scenario_id, record.scenario_id],
        ['task_id', cell.task_id, record.task_id],
        ['treatment_id', cell.treatment_id ?? cell.base_treatment_id, record.treatment_id],
      ];
      for (const [field, expected, actual] of exactFields) {
        if (expected !== actual) problem(`frozen cell ${cell.cell_id} ${field} does not match the run record`);
      }
      if (!sameValue(cell.factor_value, record.experiment_factor_value)) problem(`frozen cell ${cell.cell_id} factor value does not match the run record`);
      const experimentFactor = context.experiments?.get(record.experiment_id)?.factor;
      if (cell.factor_name !== undefined && experimentFactor !== cell.factor_name) problem(`frozen cell ${cell.cell_id} factor name does not match the experiment registry`);

      const plannedComponents = cell.components ?? cell.instructions?.components;
      if (!plannedComponents) problem(`frozen cell ${cell.cell_id} lacks component hashes`);
      else if (!sameValue(record.instructions?.components, plannedComponents)) problem(`frozen cell ${cell.cell_id} instruction component hashes do not match the run record`);

      const refFields = (value) => value && typeof value === 'object' ? {
        name: value.name,
        sha256: value.sha256,
        content_type: value.content_type,
      } : value;
      const compareRef = (label, actual, expected) => {
        if (!expected) { problem(`frozen cell ${cell.cell_id} lacks ${label} reference`); return; }
        if (!sameValue(refFields(actual), refFields(expected))) problem(`frozen cell ${cell.cell_id} ${label} reference does not match the run record`);
      };
      compareRef('instruction assembly', record.instruction_assembly, cell.instruction_assembly);
      compareRef('expanded instructions', record.instructions?.expanded_artifact, cell.expanded_instructions ?? cell.expanded_artifact);
      compareRef('execution config', record.execution_config, cell.execution_config);

      const plannedArtifactsValue = cell.component_artifacts ?? cell.artifacts?.components ?? [];
      const plannedArtifacts = Array.isArray(plannedArtifactsValue)
        ? plannedArtifactsValue
        : Object.entries(plannedArtifactsValue).map(([name, value]) => ({ name, ...value }));
      for (const plannedArtifact of plannedArtifacts) {
        artifact(plannedArtifact.name, `frozen cell ${cell.cell_id} component artifact`, plannedArtifact);
      }

      const executionConfig = cell.execution_config ?? {};
      const plannedEffort = cell.effort ?? executionConfig.effort ?? executionConfig.requested_effort;
      const plannedModel = cell.model ?? executionConfig.model;
      const plannedProvider = cell.provider ?? executionConfig.provider;
      const plannedMaxSubagents = cell.max_subagents ?? executionConfig.max_subagents;
      if (plannedEffort !== undefined && record.effort !== plannedEffort) {
        problem(`frozen cell ${cell.cell_id} effort does not match the archived execution config`);
      }
      if (plannedModel !== undefined && record.model !== plannedModel) {
        problem(`frozen cell ${cell.cell_id} model does not match the archived execution config`);
      }
      if (plannedProvider !== undefined && record.provider !== plannedProvider) {
        problem(`frozen cell ${cell.cell_id} provider does not match the archived execution config`);
      }
      if (Number.isInteger(plannedMaxSubagents) && record.subagents?.count > plannedMaxSubagents) {
        problem(`frozen cell ${cell.cell_id} subagent topology exceeds the archived execution config maximum`);
      }
    }
  }
  const grader = context.graders?.get(record.grader?.id);
  if (!grader) problem(`run references unknown grader ${record.grader?.id}`);
  else {
    if (record.grader.version !== grader.version) problem(`grader ${grader.id} version does not match the registry`);
    if (record.grader.rubric_sha256 !== grader.rubric_sha256) problem(`grader ${grader.id} rubric hash does not match exact fixture bytes`);
  }
  return errors;
}

export async function validateEvalPreflight() {
  const errors = [];
  const problem = (message) => errors.push(message);
  const [directivesDoc, scenariosDoc, treatmentsDoc, runSchema, runExample, hostsDoc, modelsDoc, conflictsDoc, policyDoc] = await Promise.all([
    json('evals/directives.json'),
    json('evals/scenarios.json'),
    json('evals/treatments.json'),
    json('evals/run.schema.json'),
    json('evals/run.example.json'),
    json('compatibility/hosts.json'),
    json('compatibility/models.json'),
    json('compatibility/conflicts.json'),
    json('policy/policy-map.json'),
  ]);
  const harness = await validateNoProviderHarness();
  for (const error of harness.errors) problem(`harness preflight: ${error}`);

  const kernelText = await readFile(path.join(sourceRoot, 'kernel/contract.md'), 'utf8');
  const kernelIds = kernelText.match(/\bAE-\d{2}\b/g) ?? [];
  const duplicateKernelIds = duplicates(kernelIds);
  if (duplicateKernelIds.length) problem(`kernel repeats directive IDs: ${duplicateKernelIds.join(', ')}`);
  if (kernelIds.join(',') !== EXPECTED_DIRECTIVES.join(',')) problem('kernel directive IDs must be exactly AE-01 through AE-25 in order');
  const kernelLines = kernelText.trimEnd().split(/\r?\n/).length;
  const kernelBytes = Buffer.byteLength(kernelText, 'utf8');
  if (kernelLines > 90) problem(`kernel has ${kernelLines} lines; budget is 90`);
  if (kernelBytes > 6144) problem(`kernel has ${kernelBytes} bytes; budget is 6144`);

  const directives = directivesDoc.directives ?? [];
  const directiveIds = directives.map((entry) => entry.id);
  if (duplicates(directiveIds).length) problem(`directive registry repeats IDs: ${duplicates(directiveIds).join(', ')}`);
  if ([...directiveIds].sort().join(',') !== [...EXPECTED_DIRECTIVES].sort().join(',')) problem('directive registry must cover AE-01 through AE-25 exactly once');

  const scenarios = scenariosDoc.scenarios ?? [];
  const scenarioIds = scenarios.map((scenario) => scenario.id);
  if (duplicates(scenarioIds).length) problem(`evaluation scenarios repeat IDs: ${duplicates(scenarioIds).join(', ')}`);
  const knownScenarios = new Set(scenarioIds);
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const scenarioCoverage = new Set(scenarios.flatMap((scenario) => scenario.directive_ids ?? []));
  for (const id of EXPECTED_DIRECTIVES) if (!scenarioCoverage.has(id)) problem(`${id} has no evaluation scenario coverage`);
  for (const scenario of scenarios) {
    if (!scenario.prompt || !scenario.failure_class || !(scenario.assertions?.length)) problem(`scenario ${scenario.id ?? '<unknown>'} is incomplete`);
    if (duplicates(scenario.directive_ids ?? []).length) problem(`scenario ${scenario.id} repeats directive IDs: ${duplicates(scenario.directive_ids).join(', ')}`);
    for (const id of scenario.directive_ids ?? []) if (!EXPECTED_DIRECTIVES.includes(id)) problem(`scenario ${scenario.id} references unknown directive ${id}`);
  }
  for (const directive of directives) {
    if (directive.owner !== 'kernel/contract.md') problem(`${directive.id} has unexpected owner ${directive.owner}`);
    if (!directive.rationale || !directive.counterexample) problem(`${directive.id} needs a rationale and counterexample`);
    if (!(directive.scenarios?.length)) problem(`${directive.id} needs at least one evaluation scenario`);
    for (const id of directive.scenarios ?? []) {
      if (!knownScenarios.has(id)) problem(`${directive.id} references unknown scenario ${id}`);
      else if (!(scenariosById.get(id).directive_ids ?? []).includes(directive.id)) problem(`${directive.id} references scenario ${id}, but that scenario omits the directive`);
    }
  }
  const directivesById = new Map(directives.map((directive) => [directive.id, directive]));
  for (const scenario of scenarios) for (const id of scenario.directive_ids ?? []) {
    if (directivesById.has(id) && !(directivesById.get(id).scenarios ?? []).includes(scenario.id)) problem(`scenario ${scenario.id} references ${id}, but the directive registry omits the scenario`);
  }

  const treatmentList = treatmentsDoc.treatments ?? [];
  const treatmentIdList = treatmentList.map((treatment) => treatment.id);
  const repeatedTreatmentIds = duplicates(treatmentIdList);
  if (repeatedTreatmentIds.length) problem(`evaluation treatments repeat IDs: ${repeatedTreatmentIds.join(', ')}`);
  const treatmentIds = new Set(treatmentIdList);
  for (const id of EXPECTED_TREATMENTS.map((treatment) => treatment.id)) {
    if (!treatmentIds.has(id)) problem(`evaluation treatments omit ${id}`);
  }
  if (treatmentsDoc.freeze_before_held_out !== true) problem('evaluation treatments must freeze before held-out runs');
  if (Object.keys(treatmentsDoc).sort().join(',') !== 'freeze_before_held_out,schema_version,treatments') {
    problem('evaluation treatment registry must be a closed schema_version, freeze flag, and treatments record');
  }
  if (treatmentList.length !== EXPECTED_TREATMENTS.length) problem('evaluation treatment registry must contain exactly the frozen v1 treatment arms');
  for (const expected of EXPECTED_TREATMENTS) {
    const actual = treatmentList.find((treatment) => treatment.id === expected.id);
    if (!actual || Object.keys(actual).sort().join(',') !== Object.keys(expected).sort().join(',')
      || Object.entries(expected).some(([field, value]) => !sameValue(actual[field], value))) {
      problem(`evaluation treatment ${expected.id} must match its frozen v1 definition; create a new evaluation version for intentional changes`);
    }
  }

  for (const [label, document] of [
    ['directive registry', directivesDoc],
    ['scenario registry', scenariosDoc],
    ['treatment registry', treatmentsDoc],
    ['host compatibility registry', hostsDoc],
    ['model compatibility registry', modelsDoc],
    ['conflict registry', conflictsDoc],
    ['policy registry', policyDoc],
  ]) {
    if (document.schema_version !== 1) problem(`${label} schema_version must be 1`);
  }

  const supportedHosts = Object.keys(hostsDoc.supported_hosts ?? {}).sort();
  if (supportedHosts.join(',') !== 'claude,codex') problem(`supported hosts must be exactly claude and codex, found: ${supportedHosts.join(', ') || 'none'}`);
  for (const host of supportedHosts) {
    const entry = hostsDoc.supported_hosts[host];
    if (entry.root_install_strategy !== 'managed-block') problem(`${host} must use managed-block root installation`);
    if (!(entry.sources?.length)) problem(`${host} needs official capability sources`);
  }
  const protectedClaudeEntryPoints = hostsDoc.supported_hosts?.claude?.protected_native_entrypoints;
  if (!Array.isArray(protectedClaudeEntryPoints) || protectedClaudeEntryPoints.join(',') !== 'security-review,verify') {
    problem('Claude compatibility metadata must protect the native security-review and verify entrypoints');
  }
  if (!(hostsDoc.supported_hosts?.claude?.sources ?? []).includes('https://code.claude.com/docs/en/commands')) {
    problem('Claude compatibility metadata must cite the official native-command registry');
  }

  const requiredRunFields = new Set(runSchema.required ?? []);
  const runProperties = new Set(Object.keys(runSchema.properties ?? {}));
  for (const field of runProperties) if (!requiredRunFields.has(field)) problem(`evaluation run schema leaves ${field} optional`);
  for (const field of requiredRunFields) if (!runProperties.has(field)) problem(`evaluation run schema requires undefined property ${field}`);
  if (runSchema.additionalProperties !== false) problem('evaluation run schema must reject unsupported top-level properties');
  if (runSchema.properties?.schema_version?.const !== 2) problem('evaluation run schema must require schema_version 2');
  if (runSchema.$id !== RUN_SCHEMA_ID) problem(`evaluation run schema $id must resolve to ${RUN_SCHEMA_ID}`);

  const requireRegistryEnum = (field, registryValues) => {
    const schemaValues = runSchema.properties?.[field]?.enum;
    for (const error of registryEnumErrors(field, registryValues, schemaValues)) problem(error);
  };
  requireRegistryEnum('task_id', [...harness.tasks.keys()]);
  requireRegistryEnum('scenario_id', scenarioIds);
  requireRegistryEnum('treatment_id', treatmentIdList);
  requireRegistryEnum('experiment_id', [null, ...harness.experimentArms.keys()]);
  requireRegistryEnum('host', supportedHosts);
  for (const error of registryEnumErrors('provider', EXPECTED_PROVIDERS, runSchema.properties?.provider?.enum)) problem(error);

  const shaSchema = (schema) => schema?.type === 'string' && schema.pattern === '^[a-f0-9]{64}$';
  const mediaTypeSchema = (schema) => schema?.type === 'string'
    && schema.pattern === '^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$';
  if (!shaSchema(runSchema.properties?.task_contract_sha256)) problem('evaluation run schema task_contract_sha256 must require a lowercase SHA-256 hash');
  if (runSchema.properties?.repository_revision?.type !== 'string' || runSchema.properties.repository_revision.pattern !== '^(?:[a-f0-9]{40}|[a-f0-9]{64})$') {
    problem('evaluation run schema repository_revision must require a full 40- or 64-character hexadecimal Git object ID');
  }
  const instructionsSchema = runSchema.properties?.instructions;
  const componentSchema = instructionsSchema?.properties?.components;
  const componentKinds = ['hook', 'kernel', 'plugin', 'policy', 'profile', 'skill'];
  if (instructionsSchema?.type !== 'object'
    || [...(instructionsSchema.required ?? [])].sort().join(',') !== 'components,expanded_artifact'
    || Object.keys(instructionsSchema.properties ?? {}).sort().join(',') !== 'components,expanded_artifact'
    || instructionsSchema.additionalProperties !== false
    || [...(componentSchema?.required ?? [])].sort().join(',') !== componentKinds.join(',')
    || Object.keys(componentSchema?.properties ?? {}).sort().join(',') !== componentKinds.join(',')
    || componentSchema?.additionalProperties !== false
    || componentKinds.some((kind) => componentSchema.properties?.[kind]?.$ref !== '#/$defs/hashMap')) {
    problem('evaluation run schema instructions must require one expanded artifact plus typed kernel/profile/skill/plugin/hook/policy hash maps');
  }
  const expandedSchema = instructionsSchema?.properties?.expanded_artifact;
  if (expandedSchema?.type !== 'object'
    || [...(expandedSchema.required ?? [])].sort().join(',') !== 'content_type,name,sha256'
    || Object.keys(expandedSchema.properties ?? {}).sort().join(',') !== 'content_type,name,sha256'
    || expandedSchema.additionalProperties !== false || expandedSchema.properties?.content_type?.const !== 'text/plain'
    || !shaSchema(expandedSchema.properties?.sha256)) {
    problem('evaluation run schema expanded instructions must be a closed named text artifact record');
  }
  const hashMap = runSchema.$defs?.hashMap;
  if (hashMap?.type !== 'object' || !Number.isFinite(hashMap.maxProperties)
    || hashMap.propertyNames?.pattern !== '^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$'
    || !shaSchema(hashMap.additionalProperties)) problem('evaluation run schema component hash maps must be bounded named SHA-256 maps');
  const jsonArtifactRef = runSchema.$defs?.jsonArtifactRef;
  if (jsonArtifactRef?.type !== 'object'
    || [...(jsonArtifactRef.required ?? [])].sort().join(',') !== 'content_type,name,sha256'
    || Object.keys(jsonArtifactRef.properties ?? {}).sort().join(',') !== 'content_type,name,sha256'
    || jsonArtifactRef.additionalProperties !== false
    || jsonArtifactRef.properties?.name?.pattern !== '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    || jsonArtifactRef.properties?.content_type?.const !== 'application/json'
    || !shaSchema(jsonArtifactRef.properties?.sha256)
    || runSchema.properties?.instruction_assembly?.$ref !== '#/$defs/jsonArtifactRef'
    || runSchema.properties?.execution_config?.$ref !== '#/$defs/jsonArtifactRef') {
    problem('evaluation run schema must require closed named JSON artifact references for instruction assembly and execution config');
  }

  const rawOutputSchema = runSchema.properties?.raw_output;
  if (rawOutputSchema?.type !== 'object'
    || [...(rawOutputSchema.required ?? [])].sort().join(',') !== 'content_type,name,sha256'
    || Object.keys(rawOutputSchema.properties ?? {}).sort().join(',') !== 'content_type,name,sha256'
    || rawOutputSchema.additionalProperties !== false
    || !shaSchema(rawOutputSchema.properties?.sha256)
    || !mediaTypeSchema(rawOutputSchema.properties?.content_type)) {
    problem('evaluation run schema raw_output must be a closed named SHA-256 and media-type record');
  }
  const artifactsSchema = runSchema.properties?.artifacts;
  const artifactSchema = runSchema.$defs?.artifact;
  if (artifactsSchema?.type !== 'object' || !Number.isFinite(artifactsSchema.maxProperties)
    || !(artifactsSchema.minProperties >= 3)
    || artifactsSchema.propertyNames?.pattern !== '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    || artifactsSchema.additionalProperties?.$ref !== '#/$defs/artifact'
    || artifactSchema?.type !== 'object'
    || [...(artifactSchema.required ?? [])].sort().join(',') !== 'content_type,sha256'
    || Object.keys(artifactSchema.properties ?? {}).sort().join(',') !== 'content_type,sha256'
    || artifactSchema.additionalProperties !== false
    || !shaSchema(artifactSchema.properties?.sha256)
    || !mediaTypeSchema(artifactSchema.properties?.content_type)) {
    problem('evaluation run schema artifacts must be a bounded logical-name map of closed SHA-256 and media-type records');
  }
  const graderSchema = runSchema.properties?.grader;
  if (graderSchema?.type !== 'object'
    || [...(graderSchema.required ?? [])].sort().join(',') !== 'id,output_artifact,output_sha256,rubric_sha256,version'
    || Object.keys(graderSchema.properties ?? {}).sort().join(',') !== 'id,output_artifact,output_sha256,rubric_sha256,version'
    || graderSchema.additionalProperties !== false
    || graderSchema.properties?.id?.type !== 'string' || !(graderSchema.properties.id.minLength > 0)
    || graderSchema.properties?.version?.type !== 'string' || !(graderSchema.properties.version.minLength > 0)
    || !shaSchema(graderSchema.properties?.rubric_sha256)
    || !shaSchema(graderSchema.properties?.output_sha256)) {
    problem('evaluation run schema grader must be a closed identity, version, rubric-hash, and named output-hash record');
  }

  const evidenceRequired = {
    tool_calls: ['duration_ms', 'input_sha256', 'output_artifact', 'sequence', 'status', 'tool'],
    test_runs: ['command', 'duration_ms', 'exit_code', 'output_artifact', 'sequence', 'status', 'working_directory'],
    retries: ['action', 'change_kind', 'prior_result_artifact', 'reason', 'sequence'],
  };
  for (const [field, required] of Object.entries(evidenceRequired)) {
    const schema = runSchema.properties?.[field];
    const item = schema?.items;
    if (schema?.type !== 'array' || !Number.isFinite(schema.maxItems) || item?.type !== 'object'
      || [...(item.required ?? [])].sort().join(',') !== required.join(',')
      || Object.keys(item.properties ?? {}).sort().join(',') !== required.join(',')
      || item.additionalProperties !== false) problem(`evaluation run schema ${field} must be a bounded closed evidence sequence`);
  }
  const tokenSchema = runSchema.properties?.tokens;
  const tokenRequired = [...(tokenSchema?.required ?? [])].sort().join(',');
  const tokenProperties = Object.keys(tokenSchema?.properties ?? {}).sort().join(',');
  if (tokenSchema?.type !== 'object' || tokenRequired !== 'input,output,total' || tokenProperties !== 'input,output,total' || tokenSchema.additionalProperties !== false) {
    problem('evaluation run schema tokens must be a closed object requiring input, output, and total');
  }
  for (const field of ['input', 'output', 'total']) {
    const schema = tokenSchema?.properties?.[field];
    if (schema?.type !== 'integer' || schema.minimum !== 0 || !Number.isFinite(schema.maximum)) problem(`evaluation run schema tokens.${field} must be a bounded non-negative integer`);
  }
  for (const field of SCORE_FIELDS) {
    const schema = runSchema.properties?.[field];
    if (!Array.isArray(schema?.type) || schema.type.join(',') !== 'number,null' || schema.minimum !== 0 || schema.maximum !== 1) {
      problem(`evaluation run schema ${field} must be null or normalized to 0..1`);
    }
  }
  const scoreCondition = runSchema.allOf?.[0];
  if (runSchema.allOf?.length !== 2
    || scoreCondition?.if?.properties?.grader_status?.const !== 'passed'
    || scoreCondition.if.required?.join(',') !== 'grader_status'
    || Object.keys(scoreCondition.then?.properties ?? {}).sort().join(',') !== [...SCORE_FIELDS].sort().join(',')
    || Object.keys(scoreCondition.else?.properties ?? {}).sort().join(',') !== [...SCORE_FIELDS].sort().join(',')
    || SCORE_FIELDS.some((field) => scoreCondition.then.properties[field]?.type !== 'number')
    || SCORE_FIELDS.some((field) => scoreCondition.else.properties[field]?.type !== 'null')) {
    problem('evaluation run schema must require numeric scores only for a passed grader and null scores otherwise');
  }
  const factorSchema = runSchema.properties?.experiment_factor_value;
  const cellIdSchema = runSchema.properties?.cell_id;
  const experimentCondition = runSchema.allOf?.[1];
  if (!Array.isArray(factorSchema?.type) || factorSchema.type.join(',') !== 'boolean,integer,string,array,object,null'
    || !Number.isFinite(factorSchema.maxItems) || !Number.isFinite(factorSchema.maxProperties)
    || !Array.isArray(cellIdSchema?.type) || cellIdSchema.type.join(',') !== 'string,null'
    || cellIdSchema.pattern !== '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    || experimentCondition?.if?.properties?.experiment_id?.const !== null
    || experimentCondition?.then?.properties?.experiment_arm_id?.type !== 'null'
    || experimentCondition?.then?.properties?.experiment_factor_value?.type !== 'null'
    || experimentCondition?.then?.properties?.cell_id?.type !== 'null'
    || experimentCondition?.then?.properties?.provider_authorization?.properties?.authorized?.const !== false
    || experimentCondition?.then?.properties?.execution_status?.const !== 'invalid'
    || experimentCondition?.then?.properties?.artifact_status?.const !== 'invalid'
    || experimentCondition?.then?.properties?.grader_status?.const !== 'invalid'
    || experimentCondition?.then?.properties?.cost_usd?.const !== 0
    || experimentCondition?.else?.properties?.experiment_arm_id?.type !== 'string'
    || experimentCondition?.else?.properties?.cell_id?.type !== 'string'
    || !Array.isArray(experimentCondition?.else?.properties?.experiment_factor_value?.type)
    || experimentCondition.else.properties.experiment_factor_value.type.includes('null')) {
    problem('evaluation run schema must close executable records to a bounded non-null experiment factor and frozen cell ID, leaving null-experiment records invalid and unauthorized');
  }
  const subagentSchema = runSchema.properties?.subagents;
  if (subagentSchema?.type !== 'object'
    || [...(subagentSchema.required ?? [])].sort().join(',') !== 'count,max_depth,nodes,spend_usd'
    || Object.keys(subagentSchema.properties ?? {}).sort().join(',') !== 'count,max_depth,nodes,spend_usd'
    || subagentSchema.additionalProperties !== false
    || subagentSchema.properties?.nodes?.type !== 'array'
    || !Number.isFinite(subagentSchema.properties.nodes.maxItems)
    || subagentSchema.properties?.spend_usd?.type !== 'number'
    || subagentSchema.properties.spend_usd.minimum !== 0
    || !Number.isFinite(subagentSchema.properties.spend_usd.maximum)) {
    problem('evaluation run schema subagents must be closed and record bounded topology plus spend_usd');
  }
  const nodeSchema = subagentSchema?.properties?.nodes?.items;
  if (nodeSchema?.type !== 'object'
    || [...(nodeSchema.required ?? [])].sort().join(',') !== 'depth,id,model,parent_id,role,spend_usd,status'
    || Object.keys(nodeSchema.properties ?? {}).sort().join(',') !== 'depth,id,model,parent_id,role,spend_usd,status'
    || nodeSchema.additionalProperties !== false) problem('evaluation run schema subagent nodes must record a closed parent/role/model/depth/spend/status topology');
  const authorizationSchema = runSchema.properties?.provider_authorization;
  if (authorizationSchema?.type !== 'object'
    || [...(authorizationSchema.required ?? [])].sort().join(',') !== 'authorized,reference,spend_cap_usd'
    || Object.keys(authorizationSchema.properties ?? {}).sort().join(',') !== 'authorized,reference,spend_cap_usd'
    || authorizationSchema.additionalProperties !== false
    || authorizationSchema.properties?.authorized?.type !== 'boolean'
    || authorizationSchema.properties?.spend_cap_usd?.type !== 'number'
    || authorizationSchema.properties.spend_cap_usd.minimum !== 0) problem('evaluation run schema provider authorization must be a closed authorization reference and bounded USD cap');
  const costSchema = runSchema.properties?.cost_usd;
  if (costSchema?.type !== 'number' || costSchema.minimum !== 0 || !Number.isFinite(costSchema.maximum)) {
    problem('evaluation run schema cost_usd must be a bounded non-negative number');
  }

  for (const error of schemaValidationErrors(runExample, runSchema)) problem(`evaluation run example ${error}`);
  const runContext = {
    tasks: harness.tasks,
    graders: harness.graders,
    experimentArms: harness.experimentArms,
    experiments: harness.experiments,
    cellPlans: harness.cellPlans,
    overlays: new Map((modelsDoc.overlays ?? []).map((overlay) => [overlay.id, overlay])),
  };
  for (const error of runRecordSemanticErrors(runExample, runContext)) problem(`evaluation run example ${error}`);
  let semanticArmCells = 0;
  const frozenCells = harness.cellPlans instanceof Map
    ? [...harness.cellPlans.values()]
    : Array.isArray(harness.cellPlans)
      ? harness.cellPlans
      : Array.isArray(harness.cellPlans?.cells)
        ? harness.cellPlans.cells
        : [];
  const artifactRef = (value) => ({ name: value.name, sha256: value.sha256, content_type: value.content_type });
  for (const cell of frozenCells) {
    const experiment = harness.experiments.get(cell.experiment_id);
    const task = harness.tasks.get(cell.task_id);
    const synthetic = structuredClone(runExample);
    synthetic.task_id = task.id;
    synthetic.task_contract_sha256 = task.task_contract_sha256;
    synthetic.scenario_id = cell.scenario_id;
    synthetic.treatment_id = cell.treatment_id ?? cell.base_treatment_id;
    synthetic.experiment_id = cell.experiment_id;
    synthetic.experiment_arm_id = cell.experiment_arm_id ?? cell.arm_id;
    synthetic.experiment_factor_value = structuredClone(cell.factor_value);
    synthetic.cell_id = cell.cell_id;
    synthetic.host = cell.host;
    synthetic.provider = cell.provider;
    synthetic.model = cell.model;
    synthetic.effort = cell.effort;
    synthetic.instructions.components = structuredClone(cell.components ?? cell.instructions.components);
    synthetic.instructions.expanded_artifact = artifactRef(cell.expanded_instructions ?? cell.expanded_artifact);
    synthetic.instruction_assembly = artifactRef(cell.instruction_assembly);
    synthetic.execution_config = artifactRef(cell.execution_config);
    const plannedArtifactsValue = cell.component_artifacts ?? cell.artifacts?.components ?? [];
    const plannedArtifacts = Array.isArray(plannedArtifactsValue)
      ? plannedArtifactsValue
      : Object.entries(plannedArtifactsValue).map(([name, value]) => ({ name, ...value }));
    for (const planned of [
      ...plannedArtifacts,
      cell.expanded_instructions ?? cell.expanded_artifact,
      cell.instruction_assembly,
      cell.execution_config,
    ]) synthetic.artifacts[planned.name] = { sha256: planned.sha256, content_type: planned.content_type };
    const subagentCount = experiment.factor === 'maximum_subagents'
      ? Math.min(cell.factor_value, cell.max_subagents ?? cell.execution_config.max_subagents ?? cell.factor_value)
      : 0;
    synthetic.subagents = {
      count: subagentCount,
      max_depth: subagentCount ? 1 : 0,
      spend_usd: 0,
      nodes: Array.from({ length: subagentCount }, (_, index) => ({
        id: `arm-agent-${index + 1}`, parent_id: null, role: 'synthetic-arm', model: synthetic.model, depth: 1, spend_usd: 0, status: 'invalid',
      })),
    };
    for (const error of schemaValidationErrors(synthetic, runSchema)) problem(`experiment cell ${cell.experiment_id}/${cell.host}/${cell.scenario_id}/${cell.experiment_arm_id ?? cell.arm_id} ${error}`);
    for (const error of runRecordSemanticErrors(synthetic, runContext)) problem(`experiment cell ${cell.experiment_id}/${cell.host}/${cell.scenario_id}/${cell.experiment_arm_id ?? cell.arm_id} ${error}`);
    semanticArmCells += 1;
  }
  if (!knownScenarios.has(runExample.scenario_id)) problem(`evaluation run example references unknown scenario ${runExample.scenario_id}`);
  if (!treatmentIds.has(runExample.treatment_id)) problem(`evaluation run example references unknown treatment ${runExample.treatment_id}`);
  if (!supportedHosts.includes(runExample.host)) problem(`evaluation run example references unknown host ${runExample.host}`);
  for (const field of ['execution_status', 'artifact_status', 'grader_status']) {
    if (runExample[field] !== 'invalid') problem(`evaluation run example ${field} must remain invalid so the fixture cannot be mistaken for a result`);
  }
  for (const field of SCORE_FIELDS) if (runExample[field] !== null) problem(`evaluation run example ${field} must remain null while the grader is invalid`);
  const zeroHash = '0'.repeat(64);
  if (runExample.raw_output?.sha256 !== zeroHash || runExample.raw_output?.content_type !== 'text/plain'
    || runExample.instructions?.expanded_artifact?.sha256 !== zeroHash) {
    problem('evaluation run example raw output must remain an unexecuted zero-hash text fixture');
  }
  if (Object.values(runExample.artifacts ?? {}).some((entry) => entry.sha256 !== zeroHash)) problem('evaluation run example artifacts must remain zero-hash fixtures');
  if (runExample.grader?.output_sha256 !== zeroHash) {
    problem('evaluation run example grader output must remain an unexecuted zero-hash fixture');
  }
  if (runExample.cost_usd !== 0 || runExample.subagents?.spend_usd !== 0 || runExample.provider_authorization?.authorized !== false) problem('evaluation run example must remain unauthorized with zero USD spend');

  const today = new Date().toISOString().slice(0, 10);
  for (const error of reviewWindowErrors('host compatibility registry', hostsDoc.reviewed, hostsDoc.revalidate_after, today)) problem(error);

  const overlayIds = new Set();
  for (const overlay of modelsDoc.overlays ?? []) {
    if (overlayIds.has(overlay.id)) problem(`model overlay repeats ID ${overlay.id}`);
    overlayIds.add(overlay.id);
    if (overlay.match?.type !== 'glob' || !(overlay.match.patterns?.length)) problem(`${overlay.id} needs explicit glob matching semantics`);
    const evaluationMatches = overlay.match?.patterns?.some((pattern) => new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\*', '.*')}$`).test(overlay.evaluation_model));
    if (!evaluationMatches) problem(`${overlay.id} evaluation_model must be an operable alias matched by its overlay`);
    if (typeof overlay.evaluation_effort !== 'string' || !overlay.evaluation_effort) problem(`${overlay.id} needs an explicit evaluation_effort`);
    if (!overlay.host || !supportedHosts.includes(overlay.host)) problem(`${overlay.id} must name one supported host`);
    if (!overlay.reviewed || !overlay.revalidate_after || !overlay.expected_effect || !overlay.removal_policy) problem(`${overlay.id} lacks review, effect, or removal metadata`);
    for (const error of reviewWindowErrors(overlay.id, overlay.reviewed, overlay.revalidate_after, today)) problem(error);
    if (!(overlay.evaluation_scenarios?.length)) problem(`${overlay.id} needs evaluation scenario coverage`);
    for (const scenario of overlay.evaluation_scenarios ?? []) if (!knownScenarios.has(scenario)) problem(`${overlay.id} references unknown scenario ${scenario}`);
    try {
      const source = new URL(overlay.source);
      if (!OFFICIAL_MODEL_SOURCE_HOSTS.has(source.hostname)) problem(`${overlay.id} source is not an approved official model-guidance host`);
    } catch {
      problem(`${overlay.id} has an invalid source URL`);
    }
  }

  const knownDirectives = new Set(EXPECTED_DIRECTIVES);
  for (const conflict of conflictsDoc.directive_conflicts ?? []) {
    if (!Array.isArray(conflict.directive_ids) || conflict.directive_ids.length !== 2) problem('each declared directive conflict must contain exactly two directive IDs');
    for (const id of conflict.directive_ids ?? []) if (!knownDirectives.has(id)) problem(`declared conflict references unknown directive ${id}`);
  }
  for (const entry of policyDoc.entries ?? []) {
    for (const id of entry.directive_ids ?? []) if (!knownDirectives.has(id)) problem(`policy ${entry.concern} references unknown directive ${id}`);
    for (const host of supportedHosts) if (!(entry.mechanisms?.[host]?.length)) problem(`policy ${entry.concern} has no ${host} mechanism`);
  }
  if (policyDoc.delivery !== 'consumer-owned') problem('policy delivery must remain consumer-owned until active generated mechanisms exist');

  return {
    errors,
    metrics: {
      kernel_lines: kernelLines,
      kernel_bytes: kernelBytes,
      directives: EXPECTED_DIRECTIVES.length,
      scenarios: scenarios.length,
      harness_tasks: harness.metrics.tasks_executed,
      harness_graders: harness.metrics.graders_executed,
      experiments: harness.metrics.experiments_registered,
      planned_experiment_cells: harness.metrics.planned_experiment_cells,
      semantic_arm_cells: semanticArmCells,
      provider_calls: harness.metrics.provider_calls,
    },
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  validateEvalPreflight().then(({ errors, metrics }) => {
    if (errors.length) {
      console.error(`FAIL (${errors.length})`);
      for (const error of errors) console.error(`  - ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS (kernel ${metrics.kernel_lines} lines/${metrics.kernel_bytes} bytes; ${metrics.directives} directives; ${metrics.scenarios} scenarios; provider-free harness ${metrics.harness_tasks} tasks/${metrics.harness_graders} grader; ${metrics.semantic_arm_cells}/${metrics.planned_experiment_cells} arm cells semantically validated; provider calls ${metrics.provider_calls})`);
  }).catch((error) => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });
}
