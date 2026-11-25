import { set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', count: 1 }, unchanged: { id: 2 } };

const renamed = set(original, 'profile.name', 'Sam');
renamed.profile; //=> { count: 1, name: 'Sam' }

update(original, 'profile.count', count => count + 1).profile; //=> { name: 'Andre', count: 2 }

renamed.unchanged === original.unchanged; //=> true: untouched branches are shared
set(original, 'profile.name', 'Andre') === original; //=> true: nothing changed
