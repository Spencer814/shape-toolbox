import { getOr, getWith } from 'shape-toolbox';

const data = { score: Number.NaN, active: false, count: 0, label: '' };
const score = getOr(data, 'score', 10);
const active = getOr(data, 'active', true);
const count = getOr(data, 'count', 10);
const label = getOr(data, 'label', 'Unknown');
const display = getWith({ profile: { name: 'Andre' } }, 'profile.name', name => name.toUpperCase());
void [score, active, count, label, display];
