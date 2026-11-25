import { applySpecAsync } from 'shape-toolbox';

const build = applySpecAsync(
  {
    total: (amount: number, tax = 0) => amount + tax,
    nested: { label: (amount: number) => String(amount) },
    list: [(amount: number) => Promise.resolve(amount * 2)],
  },
  { concurrency: 2 },
);

await build(10, 2);
//=> { total: 12, nested: { label: '10' }, list: [20] }

const collect = applySpecAsync(
  { ok: () => 1, bad: () => Promise.reject('unavailable') },
  { mode: 'settled' },
);

await collect();
//=> {
//     ok: { status: 'fulfilled', value: 1 },
//     bad: { status: 'rejected', reason: 'unavailable' },
//   }
