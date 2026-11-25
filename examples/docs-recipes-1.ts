import { applySpecAsync } from 'shape-toolbox';

const load = async (id: number): Promise<{ profile: unknown }> => {
  const signal = AbortSignal.timeout(5_000);
  return applySpecAsync(
    {
      profile: async (userId: number) => {
        const response = await fetch(
          `https://example.com/users/${userId}`,
          { signal },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      },
    },
    { signal },
  )(id);
};
void load;
