import { applySpecAsync, failedPath } from 'shape-toolbox';

const failure = new Error('Orders unavailable');
const load = applySpecAsync({
  nested: { orders: () => Promise.reject(failure) },
});

try {
  await load();
} catch (error) {
  failedPath(error); //=> ['nested', 'orders']
  error === failure; //=> true
}
