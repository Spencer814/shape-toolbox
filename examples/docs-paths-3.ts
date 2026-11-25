import { getEq } from 'shape-toolbox';

const user = { profile: { id: 1 }, score: Number.NaN };

getEq(user, 'score', Number.NaN); //=> true
getEq(user, 'profile', { id: 1 }); //=> false: a different object
getEq(user, 'profile', { id: 1 }, (actual, expected) => actual.id === expected.id); //=> true

const hasProfile = getEq('profile', { id: 1 });
hasProfile(user, (actual, expected) => actual.id === expected.id); //=> true
