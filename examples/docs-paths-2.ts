import { getOr, getWith } from 'shape-toolbox';

const data = { score: Number.NaN, active: false, count: 0, label: '' };

getOr(data, 'score', 10); //=> 10
getOr(data, 'active', true); //=> false
getOr(data, 'count', 10); //=> 0
getOr(data, 'label', 'Unknown'); //=> ''
getWith({ profile: { name: 'Andre' } }, 'profile.name', name => name.toUpperCase()); //=> 'ANDRE'
