import { set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', count: 1 }, unchanged: { id: 2 } };
const renamed = set(original, 'profile.name', 'Sam');
const incremented = update(original, 'profile.count', count => count + 1);
const same = set(original, 'profile.name', 'Andre');
const sharedBranch = renamed.unchanged === original.unchanged;
const sameRoot = same === original;
void [incremented, sharedBranch, sameRoot];
