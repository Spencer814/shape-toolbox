import { getEq } from 'shape-toolbox';

const user = { profile: { id: 1 }, score: Number.NaN };
const sameScore = getEq(user, 'score', Number.NaN);
const sameProfile = getEq(
  user,
  'profile',
  { id: 1 },
  (actual, expected) => actual.id === expected.id,
);
const hasProfile = getEq('profile', { id: 1 });
const reusableComparison = hasProfile(
  user,
  (actual, expected) => actual.id === expected.id,
);
void [sameScore, sameProfile, reusableComparison];
