import { get, getOr, getWith, set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', visits: 1 } };

get(original, 'profile.name'); //=> 'Andre'
getWith(original, 'profile.name', value => value.toUpperCase()); //=> 'ANDRE'
getOr({ name: null }, 'name', 'Unknown'); //=> 'Unknown'

const changed = set(original, 'profile.name', 'Sam'); //=> { profile: { visits: 1, name: 'Sam' } }
update(original, 'profile.visits', value => value + 1); //=> { profile: { name: 'Andre', visits: 2 } }

[original, changed].map(get('profile.name')); //=> ['Andre', 'Sam']
get(original, 'profile.name'); //=> still 'Andre': writes never change the original
