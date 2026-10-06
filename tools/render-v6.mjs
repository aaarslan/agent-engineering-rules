// Controlled shared fragments/resources and inventory. No recursive templates.
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, readPackage } from '../src/payload.mjs';
import { requiredThreshold } from '../src/thresholds.mjs';

export async function retireReferences(
  directory,
  names,
  { check = false } = {},
) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (names.includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      throw Error(`unexpected reference resource: ${file}`);
    }
    const text = await readFile(file, 'utf8');
    const marker = `<!-- Generated from source/shared/${entry.name} by tools/render-v6.mjs -->\n`;
    if (!text.startsWith(marker))
      throw Error(`unowned reference resource: ${file}`);
    if (check) throw Error(`obsolete generated reference: ${file}`);
    await unlink(file);
  }
}

export async function render({ check = false } = {}) {
  const ui = (
    await readFile(path.join(ROOT, 'kernel/clauses/ui-interaction.md'), 'utf8')
  ).trimEnd();
  const safety = (
    await readFile(path.join(ROOT, 'source/shared/skill-safety.md'), 'utf8')
  ).trimEnd();
  const mapping = JSON.parse(
    await readFile(path.join(ROOT, 'tools/content-manifest.json'), 'utf8'),
  );
  const emit = async (file, output) => {
    const target = path.join(ROOT, file);
    if (check) {
      if ((await readFile(target, 'utf8')) !== output)
        throw Error(`stale generated ${file}`);
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, output);
    }
  };
  const config = mapping.diagnosticConfig,
    thresholds = JSON.parse(
      await readFile(path.join(ROOT, config.source), 'utf8'),
    );
  const diagnostic = {
    schema_version: thresholds.schema_version,
    ...Object.fromEntries(
      config.keys.map((key) => [key, requiredThreshold(thresholds, key)]),
    ),
  };
  await emit(config.target, JSON.stringify(diagnostic, null, 2) + '\n');
  for (const [skill, names] of Object.entries(mapping.resources)) {
    await retireReferences(
      path.join(ROOT, 'skills', skill, 'references'),
      names,
      { check },
    );
    const file = `skills/${skill}/SKILL.md`,
      input = await readFile(path.join(ROOT, file), 'utf8');
    if (!input.includes('<!-- aer:shared-safety:start -->'))
      throw Error(`missing shared fragment marker: ${file}`);
    const body = input
      .replace(
        /(?<=<!-- aer:shared-safety:start -->\n)[\s\S]*?(?=\n<!-- aer:shared-safety:end -->)/,
        safety,
      )
      .replace(
        /(?<=<!-- aer:ui:start -->\n)[\s\S]*?(?=\n<!-- aer:ui:end -->)/,
        ui,
      );
    await emit(file, body);
    for (const name of names) {
      const text = await readFile(
        path.join(ROOT, 'source/shared', name),
        'utf8',
      );
      await emit(
        `skills/${skill}/references/${name}`,
        `<!-- Generated from source/shared/${name} by tools/render-v6.mjs -->\n${text.replace('{{ui-interaction}}', ui)}`,
      );
    }
  }
  const pkg = await readPackage(ROOT, { inventory: false });
  const bytes = JSON.stringify(pkg.manifest, null, 2) + '\n';
  if (check) {
    if (
      (await readFile(path.join(ROOT, 'payload-manifest.json'), 'utf8')) !==
      bytes
    )
      throw Error('stale payload-manifest.json');
  } else await writeFile(path.join(ROOT, 'payload-manifest.json'), bytes);
}
if (process.argv[1]?.endsWith('render-v6.mjs'))
  render({ check: process.argv.includes('--check') }).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
