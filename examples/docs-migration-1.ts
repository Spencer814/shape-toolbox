import { get, getEq, getOr, getWith, set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', count: 1 } };
const readName = get('profile.name');
const name = readName(original);
const fallback = getOr('profile.name', 'Unknown')(original);
const label = getWith('profile.name', (name: string) => name.toUpperCase())(original);
const matches = getEq('profile.name', 'Andre')(original);
const renamed = set('profile.name', 'Sam')(original);
const incremented = update('profile.count', (count: number) => count + 1)(original);
void [name, fallback, label, matches, renamed, incremented];
