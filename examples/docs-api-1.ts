import { allDeep } from 'shape-toolbox';

const result = await allDeep({
  id: Promise.resolve(1),
  nested: [Promise.resolve({ name: Promise.resolve('Andre') })],
});
//=> { id: 1, nested: [{ name: 'Andre' }] }

result.id; //=> 1, typed number
result.nested[0]?.name; //=> 'Andre', typed string | undefined
