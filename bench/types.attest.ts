import { bench } from '@ark/attest';
import { allDeep, applySpecAsync, get, lens, mapLimit, set, update } from 'shape-toolbox';

/** The shape the path benchmarks read and write. */
interface Order {
  /** The customer. */
  readonly customer: { readonly name: string; readonly address: { readonly city: string; readonly zip?: string } };
  /** The line items. */
  readonly lines: readonly { readonly sku: string; readonly qty: number }[];
}

/** A sample order. */
const order: Order = { customer: { name: 'Ada', address: { city: 'Leeds' } }, lines: [{ sku: 'a', qty: 1 }] };

bench.baseline(() => {
  void get(order, 'customer.name');
  void allDeep({ a: Promise.resolve(1) });
});

bench('get, dot path four levels deep', () => get(order, 'customer.address.city')).types([308, 'instantiations']);

bench('get, tuple path into an array', () => get(order, ['lines', 0, 'qty'])).types([354, 'instantiations']);

bench('set, dot path', () => set(order, 'customer.address.city', 'York')).types([954, 'instantiations']);

bench('update, optional leaf', () => update(order, 'customer.address.zip', (zip?: string) => zip ?? 'none')).types([1042, 'instantiations']);

bench('lens, built and used', () => {
  /** A lens on the city. */
  const city = lens<Order>()('customer.address.city');
  return city.set('York')(order);
}).types([1004, 'instantiations']);

bench('allDeep, nested promises', () => allDeep({ a: Promise.resolve(1), b: [Promise.resolve('x'), { c: Promise.resolve(true) }] })).types([56, 'instantiations']);

bench('mapLimit, async mapper', () => mapLimit([1, 2, 3], n => Promise.resolve(String(n)), { concurrency: 2 })).types([457, 'instantiations']);

bench('applySpecAsync, nested spec with arguments', () => applySpecAsync({
  total: (o: Order) => Promise.resolve(o.lines.length),
  who: { name: (o: Order) => o.customer.name, city: (o: Order) => Promise.resolve(o.customer.address.city) },
})(order)).types([6345, 'instantiations']);
