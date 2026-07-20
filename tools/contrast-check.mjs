#!/usr/bin/env node
// WCAG AA contrast for opaque hex, rgb(), and oklch(). Exit: 0 pass, 1 fail, 2 input error.

function range(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function hex(input) {
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) throw new Error(`invalid hex color: ${input}`);
  const short = input.slice(1);
  const full = short.length === 3 ? [...short].map((part) => part.repeat(2)).join('') : short;
  const value = Number.parseInt(full, 16);
  return [value >> 16, (value >> 8) & 255, value & 255].map((part) => part / 255);
}

function rgb(input) {
  const match = input.match(/^rgb\((.*)\)$/i);
  if (!match || match[1].includes('/')) throw new Error(`invalid or non-opaque rgb color: ${input}`);
  const parts = match[1].replaceAll(',', ' ').trim().split(/\s+/);
  if (parts.length !== 3) throw new Error(`rgb() requires three components: ${input}`);
  return parts.map((part, index) => {
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(part)) throw new Error(`invalid rgb component: ${part}`);
    const max = part.endsWith('%') ? 100 : 255;
    return range(Number.parseFloat(part), 0, max, `rgb component ${index + 1}`) / max;
  });
}

function oklch(input) {
  const match = input.match(/^oklch\(\s*(\d+(?:\.\d+)?%?)\s+(\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (!match) throw new Error(`invalid or unsupported oklch color: ${input}`);
  const lightness = match[1].endsWith('%') ? Number.parseFloat(match[1]) / 100 : Number.parseFloat(match[1]);
  const chroma = Number.parseFloat(match[2]);
  const hue = Number.parseFloat(match[3]);
  range(lightness, 0, 1, 'oklch lightness');
  if (!Number.isFinite(chroma) || chroma < 0) throw new Error('oklch chroma must be non-negative');
  if (!Number.isFinite(hue)) throw new Error('oklch hue must be finite');
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
  const value = input.trim().toLowerCase();
  if (value.startsWith('#')) return hex(value);
  if (value.startsWith('rgb(')) return rgb(value);
  if (value.startsWith('oklch(')) return oklch(value);
  throw new Error(`unsupported color format: ${input}`);
}

function luminance(value) {
  const [red, green, blue] = value.map((part) => part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

try {
  const [foreground, background, fontInput, weight, ...extra] = process.argv.slice(2);
  if (!foreground || !background || extra.length) throw new Error('usage: contrast-check.mjs <fg> <bg> [font-px] [bold]');
  if (weight && weight !== 'bold') throw new Error('the fourth argument must be "bold"');
  if (fontInput && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(fontInput)) throw new Error(`invalid font-px: ${fontInput}`);
  const font = fontInput === undefined ? 16 : range(Number(fontInput), Number.MIN_VALUE, Infinity, 'font-px');
  const [one, two] = [luminance(color(foreground)), luminance(color(background))];
  const ratio = (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  const large = font >= 24 || (weight === 'bold' && font >= 18.66);
  const threshold = large ? 3 : 4.5;
  const pass = ratio >= threshold;
  console.log(`${ratio.toFixed(2)}:1  ${pass ? 'PASS' : 'FAIL'} AA (needs ${threshold}:1 for ${large ? 'large' : 'normal'} text at ${font}px${weight ? ' bold' : ''})`);
  process.exit(pass ? 0 : 1);
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(2);
}
