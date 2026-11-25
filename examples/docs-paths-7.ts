import { lens } from 'shape-toolbox';

type User = { profile: { name: string } };
const name = lens<User>()('profile.name');
const user: User = { profile: { name: 'Andre' } };
const value = name.get(user);
const fallback = name.getOr('Unknown')(user);
const uppercase = name.getWith(value => value.toUpperCase())(user);
const matches = name.getEq('Andre')(user);
const changed = name.set('Sam')(user);
const updated = name.update(value => value.toUpperCase())(user);
void [value, fallback, uppercase, matches, changed, updated];
