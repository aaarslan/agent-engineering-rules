#!/usr/bin/env node
// WCAG AA contrast for selected opaque hex, rgb(), and oklch() pairs.
// Exit: 0 all pairs pass, 1 one or more accessibility failures, 2 input error.

import { readFile } from 'node:fs/promises';

class InputError extends Error {}

function range(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new InputError(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function rejectUnsupportedInput(input) {
  if (/\.(?:css|scss|sass|less)(?:$|[?#])/i.test(input)) {
    throw new InputError(`stylesheet paths are not accepted: ${input}; provide selected opaque color pairs or documented JSON batch input`);
  }
  if (/gradient\s*\(/i.test(input)) {
    throw new InputError(`gradients are unsupported: ${input}; resolve the actual opaque foreground/background pair first`);
  }
  if (/^(?:transparent|rgba\s*\()/i.test(input) || /\//.test(input) || /^#[0-9a-f]{4}(?:[0-9a-f]{4})?$/i.test(input)) {
    throw new InputError(`alpha or transparent colors are unsupported: ${input}; resolve the composited opaque color first`);
  }
}

function hex(input) {
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) throw new InputError(`invalid hex color: ${input}`);
  const short = input.slice(1);
  const full = short.length === 3 ? [...short].map((part) => part.repeat(2)).join('') : short;
  const value = Number.parseInt(full, 16);
  return [value >> 16, (value >> 8) & 255, value & 255].map((part) => part / 255);
}

function rgb(input) {
  const match = input.match(/^rgb\((.*)\)$/i);
  if (!match) throw new InputError(`invalid rgb color: ${input}`);
  const body = match[1].trim();
  const parts = body.includes(',')
    ? body.split(',').map((part) => part.trim())
    : body.split(/\s+/);
  if (parts.length !== 3) throw new InputError(`rgb() requires three opaque components: ${input}`);
  return parts.map((part, index) => {
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(part)) throw new InputError(`invalid rgb component: ${part}`);
    const max = part.endsWith('%') ? 100 : 255;
    return range(Number.parseFloat(part), 0, max, `rgb component ${index + 1}`) / max;
  });
}

function oklch(input) {
  const match = input.match(/^oklch\(\s*(\d+(?:\.\d+)?%?)\s+(\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (!match) throw new InputError(`invalid or unsupported oklch color: ${input}`);
  const lightness = match[1].endsWith('%') ? Number.parseFloat(match[1]) / 100 : Number.parseFloat(match[1]);
  const chroma = Number.parseFloat(match[2]);
  const hue = Number.parseFloat(match[3]);
  range(lightness, 0, 1, 'oklch lightness');
  if (!Number.isFinite(chroma) || chroma < 0) throw new InputError('oklch chroma must be non-negative');
  if (!Number.isFinite(hue)) throw new InputError('oklch hue must be finite');
  const radians = hue * Math.PI / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((part) => Math.min(1, Math.max(0, part)));
  return linear.map((part) => part <= 0.0031308 ? part * 12.92 : 1.055 * part ** (1 / 2.4) - 0.055);
}

function color(input) {
  if (typeof input !== 'string' || !input.trim()) throw new InputError('color values must be non-empty strings');
  const value = input.trim().toLowerCase();
  rejectUnsupportedInput(value);
  if (value.startsWith('#')) return hex(value);
  if (value.startsWith('rgb(')) return rgb(value);
  if (value.startsWith('oklch(')) return oklch(value);
  throw new InputError(`unsupported color format: ${input}`);
}

function luminance(value) {
  const [red, green, blue] = value.map((part) => part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function fontSize(value) {
  if (value === undefined) return 16;
  const candidate = typeof value === 'number' ? value : (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) ? Number(value) : Number.NaN);
  return range(candidate, Number.MIN_VALUE, Number.MAX_VALUE, 'font-size');
}

function fontWeight(value) {
  if (value === undefined || value === 'normal') return 400;
  if (value === 'bold') return 700;
  const candidate = typeof value === 'number' ? value : (/^\d+$/.test(value) ? Number(value) : Number.NaN);
  if (!Number.isInteger(candidate)) throw new InputError(`font-weight must be normal, bold, or an integer from 1 to 1000: ${value}`);
  return range(candidate, 1, 1000, 'font-weight');
}

function normalizePair(value, index, { requireName }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`pair ${index + 1} must be a JSON object`);
  const allowed = new Set(['name', 'foreground', 'background', 'fontSize', 'fontWeight']);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) throw new InputError(`pair ${index + 1} has unsupported field(s): ${extra.join(', ')}`);
  const name = value.name ?? (requireName ? undefined : 'single');
  if (typeof name !== 'string' || !name.trim()) throw new InputError(`pair ${index + 1} requires a non-empty name`);
  if (typeof value.foreground !== 'string' || typeof value.background !== 'string') {
    throw new InputError(`pair ${JSON.stringify(name)} requires string foreground and background values`);
  }
  return {
    name: name.trim(),
    foreground: value.foreground,
    background: value.background,
    fontSize: fontSize(value.fontSize),
    fontWeight: fontWeight(value.fontWeight),
  };
}

function evaluate(pair) {
  const [one, two] = [luminance(color(pair.foreground)), luminance(color(pair.background))];
  const ratio = (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  const large = pair.fontSize >= 24 || (pair.fontWeight >= 700 && pair.fontSize >= 18.66);
  const threshold = large ? 3 : 4.5;
  return { ...pair, ratio, threshold, large, pass: ratio >= threshold };
}

function pairOutput(result) {
  const status = result.pass ? 'PASS' : 'ACCESSIBILITY-FAIL';
  const fields = [
    `pair=${JSON.stringify(result.name)}`,
    `foreground=${JSON.stringify(result.foreground)}`,
    `background=${JSON.stringify(result.background)}`,
    `font-size=${result.fontSize}px`,
    `font-weight=${result.fontWeight}`,
    `ratio=${result.ratio.toFixed(2)}:1`,
    `threshold=${result.threshold}:1`,
    `text-size=${result.large ? 'large' : 'normal'}`,
  ];
  if (!result.pass) fields.push('guidance="Edit the colors, then rerun this exact named pair."');
  return `${status} ${fields.join(' ')}`;
}

function helpText() {
  return `HELP contrast-check (no pair checked)
Usage:
  node agent-rules/tools/contrast-check.mjs <foreground> <background> [font-px] [font-weight]
  node agent-rules/tools/contrast-check.mjs --batch PAIRS.json
  node agent-rules/tools/contrast-check.mjs --batch -
  node agent-rules/tools/contrast-check.mjs --help

Canonical invocation:
  node agent-rules/tools/contrast-check.mjs --batch contrast-pairs.json

Alternate APIs:
  node agent-rules/tools/contrast-check.mjs '#667085' '#ffffff' 14 400
  node agent-rules/tools/contrast-check.mjs 'oklch(48% 0.03 260)' 'rgb(255 255 255)' 18 bold
  node agent-rules/tools/contrast-check.mjs --batch -

Batch input is a non-empty JSON array of named objects:
  [{"name":"muted label","foreground":"#667085","background":"#fff","fontSize":14,"fontWeight":400}]

Exit 0 means every selected pair passes AA; exit 1 means at least one valid
pair fails accessibility contrast; exit 2 means input error. Stylesheet paths,
alpha/transparency, gradients, and compositing are not parsed. Supply selected
opaque foreground/background pairs only. A pass does not establish whole-page
accessibility, computed backgrounds, alpha compositing, gradients, hover/focus
states, or general WCAG conformance. Rerun every failed named pair after edits.
Unchanged retries add no evidence; rerun after an edit or a changed hypothesis.`;
}

async function readStandardInput() {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function parseArguments(arguments_) {
  if (arguments_.length === 1 && arguments_[0] === '--help') return { help: true };
  if (arguments_[0] === '--batch') {
    if (arguments_.length !== 2) throw new InputError('--batch requires exactly one JSON file path or - for stdin');
    const source = arguments_[1];
    if (/\.(?:css|scss|sass|less)$/i.test(source)) {
      throw new InputError('stylesheet paths are not accepted by --batch; provide a documented JSON pair file');
    }
    let text;
    try {
      text = source === '-' ? await readStandardInput() : await readFile(source, 'utf8');
    } catch (error) {
      throw new InputError(`cannot read batch input ${source}: ${error.message}`);
    }
    let values;
    try {
      values = JSON.parse(text);
    } catch (error) {
      throw new InputError(`batch input must be valid JSON: ${error.message}`);
    }
    if (!Array.isArray(values) || !values.length) throw new InputError('batch input must be a non-empty JSON array');
    const pairs = values.map((value, index) => normalizePair(value, index, { requireName: true }));
    const duplicates = pairs.map((pair) => pair.name).filter((name, index, names) => names.indexOf(name) !== index);
    if (duplicates.length) throw new InputError(`batch pair names must be unique: ${[...new Set(duplicates)].join(', ')}`);
    return { pairs };
  }
  if (arguments_.some((argument) => argument.startsWith('--'))) {
    throw new InputError(`unknown option: ${arguments_.find((argument) => argument.startsWith('--'))}`);
  }
  const [foreground, background, size, weight, ...extra] = arguments_;
  if (!foreground || !background || extra.length) {
    throw new InputError('expected <foreground> <background> [font-px] [font-weight], --batch FILE, or --help');
  }
  return {
    pairs: [normalizePair({ name: 'single', foreground, background, fontSize: size, fontWeight: weight }, 0, { requireName: false })],
  };
}

async function main() {
  try {
    const parsed = await parseArguments(process.argv.slice(2));
    if (parsed.help) {
      console.log(helpText());
      return 0;
    }
    const results = parsed.pairs.map(evaluate);
    for (const result of results) console.log(pairOutput(result));
    const failures = results.filter((result) => !result.pass).length;
    const status = failures ? 'ACCESSIBILITY-FAIL' : 'PASS';
    console.log(`${status} summary checked=${results.length} passed=${results.length - failures} failed=${failures}${failures ? ' guidance="Rerun failed named pairs after editing."' : ''}`);
    return failures ? 1 : 0;
  } catch (error) {
    console.error(`INPUT-ERROR: ${error.message}`);
    return 2;
  }
}

main().then((code) => { process.exitCode = code; });
