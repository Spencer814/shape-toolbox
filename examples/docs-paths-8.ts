import { get, getEq, lens, set } from 'shape-toolbox';

type User = { address: { city: string; zip: string }; active: boolean };
const user: User = {
  address: { city: 'St. Louis', zip: '63101' },
  active: true,
};
const focus = lens<User>()('address.city');
const city = get(user, focus);
const changed = set(user, focus, 'Columbia');
const readCity = get(focus);
const reusable = readCity(user);
const users: User[] = [user, changed];
const cities = users.map(readCity);
const activeUsers = users.filter(getEq('active', true));
void [city, reusable, cities, activeUsers];
