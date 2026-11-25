import { mapLimit } from 'shape-toolbox';

const controller = new AbortController();
const pending = mapLimit(
  [1, 2, 3],
  async (id, _index, signal) => {
    const response = await fetch(`https://example.com/users/${id}`, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  },
  { concurrency: 2, signal: controller.signal },
);

controller.abort(new Error('Canceled'));
try {
  await pending;
} catch (error) {
  const canceled = error === controller.signal.reason;
  void canceled;
}
