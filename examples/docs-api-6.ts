import { applySpecAsync, failedPath } from 'shape-toolbox';

const failure = new Error('Orders unavailable');
const load = applySpecAsync({
  nested: { orders: async () => { throw failure; } },
});
try {
  await load();
} catch (error) {
  const path = failedPath(error); // ['nested', 'orders']
  const sameError = error === failure; // true
  void [path, sameError];
}
