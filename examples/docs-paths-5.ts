import { set, update } from 'shape-toolbox';

type User = { address?: { city: string; zip: string } };
const user: User = {};

set(user, 'address', { city: 'Columbia', zip: '65201' });
//=> { address: { city: 'Columbia', zip: '65201' } }

update(user, 'address', address => (address ? { ...address, city: 'Columbia' } : address));
//=> {}: there is no address, so nothing is written
