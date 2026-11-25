import { allKeyed, allSettledKeyed } from 'shape-toolbox';

const values = await allKeyed({ count: Promise.resolve(2), label: 'ready' });
const results = await allSettledKeyed({
  ok: Promise.resolve(2),
  bad: Promise.reject('unavailable'),
});
const count: number = values.count;
if (results.ok.status === 'fulfilled') {
  const value: number = results.ok.value;
  void value;
}
void count;
