import { getEq, lens } from 'shape-toolbox';

type User = { name: string; stats: { visits: number } };
const user: User = { name: 'Andre', stats: { visits: 1 } };
const visits = lens<User>()('stats.visits');

getEq(user, 'name', 'Andre'); //=> true
visits.get(user); //=> 1
visits.set(5)(user); //=> { name: 'Andre', stats: { visits: 5 } }
visits.update(count => count + 1)(user); //=> { name: 'Andre', stats: { visits: 2 } }
