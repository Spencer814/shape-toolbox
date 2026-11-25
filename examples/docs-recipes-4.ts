import { allDeep } from 'shape-toolbox';

class Box {
  value = Promise.resolve(1);
}

const box = new Box();
const result = await allDeep({ box });

Object.is(result.box, box); //=> true: the instance is returned untouched
result.box.value; //=> Promise { 1 }, still a promise at runtime
