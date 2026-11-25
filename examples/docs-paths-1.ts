import { get } from 'shape-toolbox';

const data = { items: [{ name: 'first' }, { name: 'last' }] };

get(data, 'items.0.name'); //=> 'first'
get(data, ['items', -1, 'name'] as const); //=> 'last'
get({ 'a.b': { value: 3 } }, ['a.b', 'value'] as const); //=> 3
get(['first', 'last'], -1); //=> 'last'
