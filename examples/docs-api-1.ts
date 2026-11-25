import { allDeep } from 'shape-toolbox';

const result = await allDeep({
  id: Promise.resolve(1),
  nested: [Promise.resolve({ name: Promise.resolve('Andre') })],
});
const id: number = result.id;
const name: string | undefined = result.nested[0]?.name;
void [id, name];
