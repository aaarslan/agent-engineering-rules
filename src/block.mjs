import { AerError, utf8, ownedHash } from './fs-safe.mjs';
export const START = '<!-- aer:v6:start -->';
export const END = '<!-- aer:v6:end -->';
export function findBlock(bytes, label) {
  if (bytes === null) return null;
  const text = utf8(bytes, label),
    starts = [...text.matchAll(/<!-- aer:v6:start -->/g)],
    ends = [...text.matchAll(/<!-- aer:v6:end -->/g)];
  if (!starts.length && !ends.length) return null;
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0].index >= ends[0].index
  )
    throw new AerError(`${label}: malformed managed markers`);
  const start = starts[0].index,
    end = ends[0].index + END.length;
  if (
    (start && !['\n', '\uFEFF'].includes(text[start - 1])) ||
    (end < text.length &&
      text[end] !== '\n' &&
      !text.slice(end).startsWith('\r\n'))
  )
    throw new AerError(`${label}: markers must occupy complete lines`);
  return {
    text,
    start,
    end,
    bytes: Buffer.from(text.slice(start, end)),
    hash: ownedHash(Buffer.from(text.slice(start, end))),
  };
}
export function compose(body, newline = '\n') {
  return `${START}\n${body.trimEnd()}\n${END}`.replace(/\n/g, newline);
}
export function insert(bytes, body) {
  const text = bytes === null ? '' : utf8(bytes, 'instructions'),
    newline = text.includes('\r\n') ? '\r\n' : '\n';
  const separator =
    text && text !== '\uFEFF' && !text.endsWith('\n') ? newline : '';
  const tail = bytes === null ? newline : '';
  return {
    bytes: Buffer.from(text + separator + compose(body, newline) + tail),
    ownership: { createdFile: bytes === null, separator, tail },
  };
}
export function change(bytes, body, ownership) {
  const b = findBlock(bytes, 'instructions');
  if (!b) throw new AerError('owned instructions block is missing');
  const newline = b.bytes.includes(Buffer.from('\r\n')) ? '\r\n' : '\n';
  return Buffer.from(
    b.text.slice(0, b.start) + compose(body, newline) + b.text.slice(b.end),
  );
}
export function remove(bytes, ownership) {
  const b = findBlock(bytes, 'instructions');
  if (!b) return bytes;
  let start = b.start,
    end = b.end;
  if (
    ownership.separator &&
    b.text.slice(0, start).endsWith(ownership.separator)
  )
    start -= ownership.separator.length;
  if (ownership.tail && b.text.slice(end).startsWith(ownership.tail))
    end += ownership.tail.length;
  const text = b.text.slice(0, start) + b.text.slice(end);
  return ownership.createdFile && text === '' ? null : Buffer.from(text);
}
