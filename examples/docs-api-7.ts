import { applySpecAsync } from 'shape-toolbox';
import type {
  DeepAwaited,
  DeepSettled,
  Spec,
  SpecArgs,
  SpecResult,
  SpecSettled,
} from 'shape-toolbox';

const specification = { value: (id: number) => Promise.resolve(String(id)) } satisfies Spec;
type Input = SpecArgs<typeof specification>;
type Output = SpecResult<typeof specification>;
type SettledOutput = SpecSettled<typeof specification>;
type DeepOutput = DeepAwaited<{ value: Promise<number> }>;
type DeepSettledOutput = DeepSettled<{ value: Promise<number> }>;

const args: Input = [1];
const result: Output = await applySpecAsync(specification)(...args);
result; //=> { value: '1' }

// A value of each remaining type:
const settled: SettledOutput = { value: { status: 'fulfilled', value: '1' } };
const deep: DeepOutput = { value: 1 };
const deepSettled: DeepSettledOutput = { value: { status: 'fulfilled', value: 1 } };
