import { allSettledDeep } from 'shape-toolbox';

await allSettledDeep({
  plain: 1,
  ok: Promise.resolve('ready'),
  bad: Promise.reject('unavailable'),
  nested: Promise.resolve({ count: Promise.resolve(2) }),
});
//=> {
//     plain: 1,
//     ok: { status: 'fulfilled', value: 'ready' },
//     bad: { status: 'rejected', reason: 'unavailable' },
//     nested: { status: 'fulfilled', value: { count: { status: 'fulfilled', value: 2 } } },
//   }
