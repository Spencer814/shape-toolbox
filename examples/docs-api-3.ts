import { allKeyed, allSettledKeyed } from 'shape-toolbox';

await allKeyed({ count: Promise.resolve(2), label: 'ready' });
//=> { count: 2, label: 'ready' }

await allSettledKeyed({ ok: Promise.resolve(2), bad: Promise.reject('unavailable') });
//=> {
//     ok: { status: 'fulfilled', value: 2 },
//     bad: { status: 'rejected', reason: 'unavailable' },
//   }
