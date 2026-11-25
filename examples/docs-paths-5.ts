import { set, update } from 'shape-toolbox';

type User = { address?: { city: string; zip: string } };
const user: User = {};
const created = set(user, 'address', { city: 'Columbia', zip: '65201' });
const ifPresent = update(user, 'address', address =>
  address ? { ...address, city: 'Columbia' } : address,
);
void [created, ifPresent];
