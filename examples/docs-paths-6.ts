import { get, getOr, set, update } from 'shape-toolbox';

const users = [
  { profile: { name: 'Andre', visits: 1 } },
  { profile: { name: 'Sam', visits: 2 } },
];

users.map(get('profile.name')); //=> ['Andre', 'Sam']
users.map(getOr('profile.name', 'Unknown')); //=> ['Andre', 'Sam']

users.map(set('profile.name', 'Pat'));
//=> [{ profile: { visits: 1, name: 'Pat' } }, { profile: { visits: 2, name: 'Pat' } }]

users.map(update('profile.visits', (visits: number) => visits + 1));
//=> [{ profile: { name: 'Andre', visits: 2 } }, { profile: { name: 'Sam', visits: 3 } }]
