import { get, getEq, getOr, getWith, set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', count: 1 } };
const readName = get('profile.name');

readName(original); //=> 'Andre'
getOr('profile.name', 'Unknown')(original); //=> 'Andre'
getWith('profile.name', (name: string) => name.toUpperCase())(original); //=> 'ANDRE'
getEq('profile.name', 'Andre')(original); //=> true
set('profile.name', 'Sam')(original); //=> { profile: { count: 1, name: 'Sam' } }
update('profile.count', (count: number) => count + 1)(original); //=> { profile: { name: 'Andre', count: 2 } }
