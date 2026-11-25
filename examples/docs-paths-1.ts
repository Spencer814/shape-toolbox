import { get } from 'shape-toolbox';

const data = { items: [{ name: 'first' }, { name: 'last' }] };
const first = get(data, 'items.0.name');
const last = get(data, ['items', -1, 'name'] as const);
const literal = get({ 'a.b': { value: 3 } }, ['a.b', 'value'] as const);
const finalItem = get(['first', 'last'], -1);
void [first, last, literal, finalItem];
