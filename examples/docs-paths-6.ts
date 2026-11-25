import { get, getOr, set, update } from 'shape-toolbox';

const users = [
  { profile: { name: 'Andre', visits: 1 } },
  { profile: { name: 'Sam', visits: 2 } },
];
const names = users.map(get('profile.name'));
const defaults = users.map(getOr('profile.name', 'Unknown'));
const renamed = users.map(set('profile.name', 'Pat'));
const visited = users.map(update('profile.visits', (visits: number) => visits + 1));
void [names, defaults, renamed, visited];
