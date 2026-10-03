import { install } from '../../src/install.mjs';

// Execute fixed failure-injection code; paths and modes arrive only as argv data.
const [mode, target] = process.argv.slice(2);
if (!target || !['payload', 'commit', 'pending', 'initialize'].includes(mode)) {
  throw Error('invalid installer child fixture arguments');
}
let stateWrites = 0;
await install({target, skills: mode === 'payload' || mode === 'commit'
  ? ['aer-implementing-features'] : 'none'}, {
  boundary: async name => {
    if (mode === 'pending' && name === 'pending') {
      console.log('READY');
      await new Promise(resolve => process.stdin.once('data', resolve));
    }
  },
  atomicBoundary: (name, file) => {
    if (name !== 'temporary-synced') return;
    if (file === 'aer.lock.json') stateWrites++;
    if ((mode === 'payload' && file !== 'aer.lock.json') ||
        (mode === 'commit' && stateWrites === 2) ||
        (mode === 'initialize' && file === 'aer.lock.json')) {
      process.kill(process.pid, 'SIGKILL');
    }
  },
});
