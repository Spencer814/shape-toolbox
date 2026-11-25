import { mapLimit } from 'shape-toolbox';

await mapLimit(
  [3, 1, 2],
  (value, index, signal) => {
    signal.throwIfAborted();
    return Promise.resolve({ index, doubled: value * 2 });
  },
  { concurrency: 2 },
);
//=> [{ index: 0, doubled: 6 }, { index: 1, doubled: 2 }, { index: 2, doubled: 4 }]
