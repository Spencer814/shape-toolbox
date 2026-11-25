import { get, getEq, lens, set } from 'shape-toolbox';

type User = { address: { city: string; zip: string }; active: boolean };
const user: User = {
  address: { city: 'St. Louis', zip: '63101' },
  active: true,
};
const focus = lens<User>()('address.city');

get(user, focus); //=> 'St. Louis'

const changed = set(user, focus, 'Columbia');
changed.address; //=> { zip: '63101', city: 'Columbia' }

const readCity = get(focus);
readCity(user); //=> 'St. Louis'

const users: User[] = [user, changed];
users.map(readCity); //=> ['St. Louis', 'Columbia']
users.filter(getEq('active', true)).length; //=> 2
