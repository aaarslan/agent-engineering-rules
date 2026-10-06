import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AerError,
  hash,
  ownedHash,
  safePath,
  walk,
  snapshot,
  utf8,
  STATE,
  RUN_LOCK,
  uniqueJson,
} from './fs-safe.mjs';
import { requiredThreshold } from './thresholds.mjs';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const PROFILES = ['prototype', 'standard', 'high-assurance'];
export function closed(value, keys, label, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...keys, ...optional].includes(k))
  )
    throw new AerError(`${label}: invalid closed object`, 4, 'invalid');
}
export function parseSkill(bytes, directory) {
  const text = utf8(bytes, directory);
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n\r?\n([\s\S]+)$/);
  if (!match)
    throw new AerError(`${directory}: malformed frontmatter`, 4, 'invalid');
  const fields = {};
  for (const row of match[1].split(/\r?\n/)) {
    const f = row.match(/^(name|description): (.+)$/);
    if (!f || Object.hasOwn(fields, f[1]))
      throw new AerError(
        `${directory}: unsupported or duplicate frontmatter field`,
        4,
        'invalid',
      );
    // AER serialization is a small YAML subset: JSON-quoted string scalars.
    try {
      fields[f[1]] = JSON.parse(f[2]);
    } catch {
      throw new AerError(
        `${directory}: expected JSON-quoted YAML scalar`,
        4,
        'invalid',
      );
    }
  }
  closed(fields, ['name', 'description'], directory);
  if (
    typeof fields.name !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name) ||
    fields.name.length > 64 ||
    fields.name !== directory ||
    typeof fields.description !== 'string' ||
    !fields.description.trim() ||
    fields.description.length > 1024
  )
    throw new AerError(
      `${directory}: invalid name or description`,
      4,
      'invalid',
    );
  if (/\$ARGUMENTS|\{\{/.test(match[2]))
    throw new AerError(`${directory}: unresolved placeholder`, 4, 'invalid');
  return { ...fields, body: match[2], text };
}
export async function readPackage(root = ROOT, { inventory = true } = {}) {
  const json = async (p) =>
    uniqueJson(utf8(await readFile(path.join(root, p)), p), p);
  const pkg = await json('package.json'),
    clients = await json('integrations/clients.json'),
    claude = await json('integrations/claude-code.json');
  closed(
    clients,
    ['schemaVersion', 'reviewedOn', 'skills', 'clients'],
    'clients',
  );
  if (
    clients.schemaVersion !== 1 ||
    Object.keys(clients.clients).sort().join(',') !==
      'claude-code,codex,portable'
  )
    throw new AerError('unknown integration', 4, 'invalid');
  const capabilities = {
    portable: ['standard-frontmatter'],
    codex: ['invocation-sidecar'],
    'claude-code': ['manual-invocation', 'restricted-reviewer'],
  };
  for (const [id, c] of Object.entries(clients.clients)) {
    closed(
      c,
      ['renderer', 'channel', 'sources', 'capabilities', 'testedVersions'],
      id,
    );
    if (
      c.renderer !== `${id}-v1` ||
      c.channel !== 'direct' ||
      JSON.stringify(c.capabilities) !== JSON.stringify(capabilities[id]) ||
      !Array.isArray(c.testedVersions) ||
      !Array.isArray(c.sources) ||
      !c.sources.every((s) => typeof s === 'string' && s.startsWith('https://'))
    )
      throw new AerError(
        'unknown integration capability or renderer',
        4,
        'invalid',
      );
  }
  if (
    !Array.isArray(clients.skills) ||
    new Set(clients.skills.map((s) => s.name)).size !== clients.skills.length ||
    !clients.skills.length
  )
    throw new AerError('invalid catalog', 4, 'invalid');
  for (const s of clients.skills) {
    closed(s, ['name', 'manualOnly'], 'skill');
    if (typeof s.manualOnly !== 'boolean' || !/^aer-[a-z-]+$/.test(s.name))
      throw new AerError('invalid catalog skill', 4, 'invalid');
  }
  closed(
    claude,
    ['schemaVersion', 'reviewSkills', 'resource', 'name', 'tools', 'fields'],
    'claude adapter',
  );
  if (
    claude.schemaVersion !== 1 ||
    claude.resource !== '.claude/agents/aer-code-reviewer.md' ||
    claude.name !== 'aer-code-reviewer' ||
    JSON.stringify(claude.tools) !== JSON.stringify(['Read', 'Grep', 'Glob']) ||
    JSON.stringify(claude.reviewSkills) !==
      JSON.stringify(['aer-reviewing-changes', 'aer-reviewing-security']) ||
    JSON.stringify(claude.fields) !==
      JSON.stringify({
        'disable-model-invocation': true,
        context: 'fork',
        agent: 'aer-code-reviewer',
        background: false,
      })
  )
    throw new AerError('invalid restricted-review integration', 4, 'invalid');
  const sources = new Map();
  for (const prefix of ['kernel', 'skills', 'integrations', 'src', 'schemas'])
    for (const relative of await walk(root, prefix)) {
      const s = await snapshot(root, relative);
      sources.set(relative, s.bytes);
    }
  const skills = new Map();
  for (const s of clients.skills)
    skills.set(
      s.name,
      parseSkill(
        sources.get(`skills/${s.name}/SKILL.md`) ?? Buffer.alloc(0),
        s.name,
      ),
    );
  const generated = {
    schemaVersion: 1,
    generatedBy: 'tools/render-v6.mjs',
    files: [...sources]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([p, b]) => ({
        path: p,
        normalization: /\.(md|json|mjs|yaml|txt|svg)$/.test(p)
          ? 'utf8-lf'
          : 'binary',
        sha256: ownedHash(
          b,
          /\.(md|json|mjs|yaml|txt|svg)$/.test(p) ? 'utf8-lf' : 'binary',
        ),
        bytes: b.length,
      })),
  };
  // History is explicit deletion authority supplied by the package, not the
  // consumer ledger. Exclude it from the source identity to avoid self-reference.
  const sourceIdentity = hash(
    JSON.stringify({
      ...generated,
      files: generated.files.filter(
        (f) => f.path !== 'integrations/payload-history.json',
      ),
    }),
  );
  if (inventory) {
    const recorded = await json('payload-manifest.json');
    if (
      JSON.stringify(recorded) !==
      JSON.stringify({ ...generated, sourceIdentity })
    )
      throw new AerError(
        'payload inventory is stale or incomplete',
        4,
        'invalid',
      );
  }
  const thresholds = await json('kernel/thresholds.json');
  const history = await json('integrations/payload-history.json');
  closed(history, ['schemaVersion', 'payloads'], 'payload history');
  if (
    history.schemaVersion !== 1 ||
    !Array.isArray(history.payloads) ||
    new Set(history.payloads.map((h) => h.sourceIdentity)).size !==
      history.payloads.length
  )
    throw new AerError('invalid prior inventory authority', 4, 'invalid');
  for (const h of history.payloads) {
    closed(
      h,
      ['sourceIdentity', 'representations', 'blockHashes'],
      'prior inventory',
    );
    if (
      !/^[a-f0-9]{64}$/.test(h.sourceIdentity) ||
      Object.keys(h.representations).sort().join() !==
        'claude-code,codex,portable' ||
      Object.keys(h.blockHashes).sort().join() !== [...PROFILES].sort().join()
    )
      throw new AerError('invalid prior inventory identity', 4, 'invalid');
    for (const [representation, entries] of Object.entries(h.representations))
      for (const [p, f] of Object.entries(entries)) {
        safePath(p);
        closed(
          f,
          ['sha256', 'normalization', 'representation', 'renderer'],
          'prior file',
        );
        if (
          !/^[a-f0-9]{64}$/.test(f.sha256) ||
          !['utf8-lf', 'binary'].includes(f.normalization) ||
          f.representation !== representation ||
          f.renderer !== clients.clients[representation].renderer ||
          (!p.startsWith('skills/') && p !== claude.resource) ||
          (p.startsWith('skills/') && !skills.has(p.split('/')[1]))
        )
          throw new AerError('unrecognized prior payload path', 4, 'invalid');
      }
    if (Object.values(h.blockHashes).some((h) => !/^[a-f0-9]{64}$/.test(h)))
      throw new AerError('invalid prior block inventory', 4, 'invalid');
  }
  return {
    root,
    pkg,
    clients,
    claude,
    sources,
    skills,
    manifest: { ...generated, sourceIdentity },
    sourceIdentity,
    thresholds,
    history,
  };
}
export function recognizedInventory(pkg, selected, sourceIdentity) {
  if (sourceIdentity === pkg.sourceIdentity)
    return new Map(
      [...expectedFiles(pkg, selected)].map(([p, f]) => [
        p,
        {
          sha256: f.sha256,
          normalization: f.normalization,
          representation: f.representation,
          renderer: f.renderer,
        },
      ]),
    );
  const prior = pkg.history.payloads.find(
    (h) => h.sourceIdentity === sourceIdentity,
  );
  if (!prior)
    throw new AerError(
      'unsupported prior payload identity; use its pinned package to inspect/uninstall; this package cannot authorize cleanup',
      4,
      'invalid',
    );
  const result = new Map();
  for (const d of selected.destinations)
    for (const [p, f] of Object.entries(
      prior.representations[d.representation],
    )) {
      if (p.startsWith('skills/') && selected.skills.includes(p.split('/')[1]))
        result.set(`${d.path}/${p.slice(7)}`, f);
      else if (
        p === pkg.claude.resource &&
        selected.skills.some((n) => pkg.claude.reviewSkills.includes(n))
      )
        result.set(p, f);
    }
  return result;
}
export function historyRecord(pkg) {
  const representations = {};
  for (const representation of ['portable', 'codex', 'claude-code']) {
    const s = selection(
      { destinations: [{ representation, path: 'skills' }] },
      null,
      pkg,
    );
    representations[representation] = Object.fromEntries(
      recognizedInventory(pkg, s, pkg.sourceIdentity),
    );
  }
  const blockHashes = Object.fromEntries(
    PROFILES.map((profile) => [
      profile,
      ownedHash(
        Buffer.from(
          `<!-- aer:v6:start -->\n${kernelBody(pkg, selection({ profile }, null, pkg)).trimEnd()}\n<!-- aer:v6:end -->`,
        ),
      ),
    ]),
  );
  return { sourceIdentity: pkg.sourceIdentity, representations, blockHashes };
}
export function selection(options, previous, pkg) {
  const destinations = options.destinations ??
    previous?.destinations ?? [
      { representation: 'portable', path: '.agents/skills' },
    ];
  const instructionsFile =
    options.instructionsFile ?? previous?.instructionsFile ?? 'AGENTS.md';
  const profile = options.profile ?? previous?.profile ?? 'standard';
  let skills =
    options.skills ?? previous?.skills ?? pkg.clients.skills.map((s) => s.name);
  if (skills === 'all') skills = pkg.clients.skills.map((s) => s.name);
  if (skills === 'none') skills = [];
  if (typeof skills === 'string') skills = skills.split(',');
  if (
    !PROFILES.includes(profile) ||
    !Array.isArray(skills) ||
    new Set(skills).size !== skills.length ||
    skills.some((s) => !pkg.skills.has(s))
  )
    throw new AerError('invalid profile or skill selection', 2, 'error');
  if (
    !Array.isArray(destinations) ||
    !destinations.length ||
    destinations.length >
      requiredThreshold(pkg.thresholds, 'DESTINATION_MAX_COUNT')
  )
    throw new AerError('invalid destinations', 2, 'error');
  const controls = [
    STATE,
    RUN_LOCK,
    '.agent-engineering-rules-state.json',
    '.agent-engineering-rules-install.lock',
  ];
  for (const d of destinations) {
    closed(d, ['representation', 'path'], 'destination');
    if (!Object.hasOwn(pkg.clients.clients, d.representation))
      throw new AerError('unknown destination representation', 2, 'error');
    safePath(d.path);
  }
  safePath(instructionsFile);
  const paths = [
    instructionsFile,
    ...destinations.map((d) => d.path),
    ...controls,
  ];
  if (destinations.some((d) => d.representation === 'claude-code'))
    paths.push(pkg.claude.resource);
  const folded = paths.map((p) => p.toLocaleLowerCase('en-US'));
  for (let i = 0; i < folded.length; i++)
    for (let j = i + 1; j < folded.length; j++)
      if (
        folded[i] === folded[j] ||
        folded[i].startsWith(folded[j] + '/') ||
        folded[j].startsWith(folded[i] + '/')
      )
        throw new AerError(
          `conflicting, overlapping or case-aliased paths: ${paths[i]}, ${paths[j]}`,
        );
  return {
    profile,
    instructionsFile,
    skills: [...skills].sort(),
    destinations: destinations
      .map((d) => ({ ...d }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}
export function expectedFiles(pkg, selected) {
  const result = new Map();
  for (const destination of selected.destinations)
    for (const name of selected.skills) {
      const prefix = `skills/${name}/`,
        skillMetadata = pkg.clients.skills.find((s) => s.name === name);
      for (const [source, sourceBytes] of pkg.sources)
        if (source.startsWith(prefix)) {
          let bytes = sourceBytes;
          if (
            source === prefix + 'SKILL.md' &&
            destination.representation === 'claude-code' &&
            skillMetadata.manualOnly
          ) {
            const fields = pkg.claude.reviewSkills.includes(name)
              ? pkg.claude.fields
              : { 'disable-model-invocation': true };
            bytes = Buffer.from(
              sourceBytes.toString().replace(
                /\n---\n/,
                `\n${Object.entries(fields)
                  .map(
                    ([k, v]) =>
                      `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`,
                  )
                  .join('\n')}\n---\n`,
              ),
            );
          }
          const targetPath = `${destination.path}/${name}/${source.slice(prefix.length)}`;
          const normalization = pkg.manifest.files.find(
            (f) => f.path === source,
          ).normalization;
          result.set(targetPath, {
            bytes,
            normalization,
            sha256: ownedHash(bytes, normalization),
            representation: destination.representation,
            renderer: pkg.clients.clients[destination.representation].renderer,
          });
        }
      if (destination.representation === 'codex') {
        const bytes = Buffer.from(
          `# Generated from integrations/clients.json by codex-v1\npolicy:\n  allow_implicit_invocation: ${!skillMetadata.manualOnly}\n`,
        );
        result.set(`${destination.path}/${name}/agents/openai.yaml`, {
          bytes,
          normalization: 'utf8-lf',
          sha256: ownedHash(bytes),
          representation: 'codex',
          renderer: 'codex-v1',
        });
      }
    }
  if (
    selected.destinations.some(
      (destination) => destination.representation === 'claude-code',
    ) &&
    selected.skills.some((n) => pkg.claude.reviewSkills.includes(n))
  ) {
    const bytes = Buffer.from(
      `---\nname: ${pkg.claude.name}\ndescription: "Bounded requested read-only review; use only for an explicitly invoked AER review skill."\ntools: ${pkg.claude.tools.join(', ')}\n---\n\n${pkg.sources.get('integrations/reviewer.md').toString()}`,
    );
    result.set(pkg.claude.resource, {
      bytes,
      normalization: 'utf8-lf',
      sha256: ownedHash(bytes),
      representation: 'claude-code',
      renderer: 'claude-code-v1',
    });
  }
  return result;
}
export function kernelBody(pkg, selected) {
  return pkg.sources
    .get('kernel/block.md')
    .toString()
    .replace(
      '{{contract}}',
      pkg.sources.get('kernel/contract.md').toString().trimEnd(),
    )
    .replace(
      '{{profile}}',
      pkg.sources
        .get(`kernel/profiles/${selected.profile}.md`)
        .toString()
        .trimEnd(),
    )
    .replace(
      '{{ui}}',
      pkg.sources.get('kernel/clauses/ui-interaction.md').toString().trimEnd(),
    );
}
export function estimates(pkg, selected, files, block) {
  const rawCatalogCharacters = selected.skills.reduce(
    (sum, n) => sum + n.length + pkg.skills.get(n).description.length,
    0,
  );
  const catalogWithPathsCharacters = selected.destinations.reduce(
    (sum, d) =>
      sum +
      selected.skills.reduce(
        (s, n) =>
          s +
          n.length +
          pkg.skills.get(n).description.length +
          `${d.path}/${n}/SKILL.md`.length +
          3,
        0,
      ),
    0,
  );
  return {
    blockBytes: Buffer.byteLength(block),
    blockLines: block.split(/\r?\n/).length,
    rawCatalogCharacters,
    catalogWithPathsCharacters,
    activatedSkillAndResourceBytes: [...files.values()].reduce(
      (s, f) => s + f.bytes.length,
      0,
    ),
    roughBlockTokens: Math.ceil(
      Buffer.byteLength(block) /
        requiredThreshold(pkg.thresholds, 'ESTIMATED_TOKEN_BYTES'),
    ),
    estimator: 'bytes / configured divisor; not measured tokens, usage or cost',
  };
}
