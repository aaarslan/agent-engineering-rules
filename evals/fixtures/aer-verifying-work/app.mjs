export function classifyCheck(result) {
  return result.exitCode === 0 ? 'pass' : 'fail';
}
export function summarizeChecks(results) {
  return results.every((result) => result.exitCode === 0) ? 'done' : 'failed';
}
