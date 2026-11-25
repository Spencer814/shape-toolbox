# Go equivalents

shape-toolbox is a TypeScript library. A Go consumer should use Go's existing concurrency tools rather than reproduce JavaScript promises or currying.

| Need | Go building block | Difference to account for |
| --- | --- | --- |
| Run tasks and fail on an error | `errgroup.WithContext` | Cancellation is cooperative, and `Wait` waits for started tasks to return. |
| Limit active tasks | `Group.SetLimit` | Configure the limit before starting tasks. Registering another task can block until capacity is available. |
| Apply a deadline | `context.WithTimeout` | Pass the derived context into I/O and call the returned cancel function to release resources. |
| Wait for independent tasks | `sync.WaitGroup.Go` | Collect each result and error yourself. A WaitGroup does not propagate task failures or cancel siblings. |
| Assemble a nested response | Typed structs and explicit assignments | Heterogeneous dynamic specifications are usually clearer as ordinary Go code. |
| Preserve snapshots | Copy-on-write data or a suitable persistent collection | Immutability of a container does not make mutable values inside it safe. |

For a fail-fast task collection, create the group and derived context with `errgroup.WithContext(ctx)`, call `SetLimit`, and start tasks with `Go`. Each task receives the derived context through its closure. Store each result in its own preallocated slot, then check `Wait` before using the aggregate.

For settled results, do not return individual task failures to a fail-fast errgroup unless canceling siblings is intended. A `WaitGroup` plus indexed result records can wait for every task and preserve its error. An external context can still request cancellation.

`sync.WaitGroup.Go` requires Go 1.25 or newer. Its function must not panic. Calling it is not a substitute for defining error handling.

A JavaScript rejection may be any value; a Go failure is normally an `error`. JSON fixtures represent failures with stable strings or structured data rather than language-specific error objects or stacks. Numeric precision, missing versus null, and cancellation mechanics need an explicit contract before sharing fixtures across implementations.

The fixtures in `fixtures/` describe a nested task tree, task definitions, arguments, and expected results. A future Go implementation can interpret the task descriptions without loading JavaScript code.

## Sources

- [errgroup.WithContext, Go, SetLimit, and Wait](https://pkg.go.dev/golang.org/x/sync/errgroup)
- [context.WithTimeout](https://pkg.go.dev/context#WithTimeout)
- [sync.WaitGroup.Go](https://pkg.go.dev/sync#WaitGroup.Go)
