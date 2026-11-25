import { applySpecAsync } from 'shape-toolbox';

const build = applySpecAsync(
  {
    total: async (amount: number, tax = 0) => amount + tax,
    nested: { label: (amount: number) => String(amount) },
    list: [async (amount: number) => amount * 2],
  },
  { concurrency: 2 },
);
const result = await build(10, 2);

const collect = applySpecAsync(
  { ok: () => 1, bad: () => Promise.reject('unavailable') },
  { mode: 'settled' },
);
const settled = await collect();
void [result, settled];
