import { mapLimit } from 'shape-toolbox';

const result = await mapLimit(
  [3, 1, 2],
  async (value, index, signal) => {
    signal.throwIfAborted();
    return { index, doubled: value * 2 };
  },
  { concurrency: 2 },
);
void result;
