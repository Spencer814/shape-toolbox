import { applySpecAsync } from 'shape-toolbox';

const load = applySpecAsync(
  {
    profile: async (id: number) => ({ id, name: 'Andre' }),
    nested: {
      orders: async (id: number) => [{ ownerId: id, total: 42 }],
    },
    labels: [(id: number) => `user-${id}`],
  },
  { concurrency: 2 },
);

await load(1);
//=> {
//     profile: { id: 1, name: 'Andre' },
//     nested: { orders: [{ ownerId: 1, total: 42 }] },
//     labels: ['user-1'],
//   }
