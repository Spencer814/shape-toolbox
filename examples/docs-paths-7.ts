import { lens } from 'shape-toolbox';

type User = { profile: { name: string } };
const name = lens<User>()('profile.name');
const user: User = { profile: { name: 'Andre' } };

name.get(user); //=> 'Andre'
name.getOr('Unknown')(user); //=> 'Andre'
name.getWith(value => value.toUpperCase())(user); //=> 'ANDRE'
name.getEq('Andre')(user); //=> true
name.set('Sam')(user); //=> { profile: { name: 'Sam' } }
name.update(value => value.toUpperCase())(user); //=> { profile: { name: 'ANDRE' } }
