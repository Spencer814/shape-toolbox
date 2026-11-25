import { get, getOr, getWith, set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', visits: 1 } };
const name = get(original, 'profile.name');
const label = getWith(original, 'profile.name', value => value.toUpperCase());
const fallback = getOr({ name: null }, 'name', 'Unknown');
const changed = set(original, 'profile.name', 'Sam');
const incremented = update(original, 'profile.visits', value => value + 1);
const names = [original, changed].map(get('profile.name'));
void [name, label, fallback, incremented, names];
