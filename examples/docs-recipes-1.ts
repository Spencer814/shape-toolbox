import { applySpecAsync } from 'shape-toolbox';

const loadUser = applySpecAsync(
  { profile: (id: number) => Promise.resolve({ id }) },
  { signal: () => AbortSignal.timeout(5_000) },
);

await loadUser(7);
//=> { profile: { id: 7 } }
