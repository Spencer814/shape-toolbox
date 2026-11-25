import { allDeep } from 'shape-toolbox';

class Box {
  value = Promise.resolve(1);
}

const box = new Box();
const result = await allDeep({ box });
// result.box is the original Box at runtime, with its promise still present.
const unchanged = Object.is(result.box, box);
void unchanged;
