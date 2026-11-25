import { allDeep, allKeyed, allSettledDeep, allSettledKeyed, failedPath, mapLimit } from 'shape-toolbox';

await allDeep({ user: Promise.resolve({ id: 7 }), tags: [Promise.resolve('vip'), 'new'] });
//=> { user: { id: 7 }, tags: ['vip', 'new'] }

await allSettledDeep({ credit: Promise.reject(new Error('timeout')), income: Promise.resolve(5200) });
//=> { credit: { status: 'rejected', reason: Error('timeout') },
//     income: { status: 'fulfilled', value: 5200 } }

await allKeyed({ name: Promise.resolve('Andre'), visits: 1 });
//=> { name: 'Andre', visits: 1 }

await allSettledKeyed({ income: Promise.resolve(5200), assets: Promise.reject(new Error('none')) });
//=> { income: { status: 'fulfilled', value: 5200 },
//     assets: { status: 'rejected', reason: Error('none') } }

await mapLimit([1, 2, 3], id => Promise.resolve(id * 10), { concurrency: 2 });
//=> [10, 20, 30]

try {
  await allDeep({ user: { orders: Promise.reject(new Error('orders down')) } });
} catch (error) {
  failedPath(error); //=> ['user', 'orders']
}
