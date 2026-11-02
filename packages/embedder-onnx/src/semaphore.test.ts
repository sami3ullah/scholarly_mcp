import { describe, expect, it } from 'vitest';
import { createSemaphore } from './semaphore.js';

const signal = new AbortController().signal;

/** A task that stays running until the test lets it finish. */
function deferred() {
  let finish = (): void => undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    task: () => done,
    finish: () => {
      finish();
    },
  };
}

describe('createSemaphore', () => {
  it('runs at most `limit` tasks at once and starts waiters in order', async () => {
    const semaphore = createSemaphore(2);
    const started: number[] = [];
    const tasks = [0, 1, 2, 3].map(() => deferred());
    const runs = tasks.map((deferredTask, index) =>
      semaphore.run(async () => {
        started.push(index);
        await deferredTask.task();
        return index;
      }, signal),
    );
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    tasks[1]?.finish();
    await runs[1];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    for (const deferredTask of tasks) deferredTask.finish();
    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3]);
  });

  it('frees the slot when a task fails', async () => {
    const semaphore = createSemaphore(1);
    await expect(semaphore.run(() => Promise.reject(new Error('boom')), signal)).rejects.toThrow(
      'boom',
    );
    expect(await semaphore.run(() => Promise.resolve('next'), signal)).toBe('next');
  });

  it('rejects at once when the caller has already aborted', async () => {
    const semaphore = createSemaphore(1);
    let ran = false;
    const run = semaphore.run(
      () => {
        ran = true;
        return Promise.resolve();
      },
      AbortSignal.abort(new Error('gone')),
    );
    await expect(run).rejects.toThrow('gone');
    expect(ran).toBe(false);
  });

  it('drops a waiter that aborts and never runs its task', async () => {
    const semaphore = createSemaphore(1);
    const blocker = deferred();
    const first = semaphore.run(blocker.task, signal);
    const controller = new AbortController();
    let ran = false;
    const waiting = semaphore.run(() => {
      ran = true;
      return Promise.resolve();
    }, controller.signal);
    const third = semaphore.run(() => Promise.resolve('third'), signal);
    controller.abort(new Error('timed out'));
    await expect(waiting).rejects.toThrow('timed out');
    blocker.finish();
    await first;
    expect(await third).toBe('third');
    expect(ran).toBe(false);
  });
});
