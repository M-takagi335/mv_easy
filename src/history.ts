export function createHistory<T>(initial: T, equal: (a: T, b: T) => boolean, limit = 150) {
  let current = initial;
  let transaction: { before: T } | undefined;
  const past: T[] = [];
  const future: T[] = [];

  function record(before: T) {
    if (equal(before, current)) return;
    past.push(before);
    if (past.length > limit) past.shift();
    future.length = 0;
  }

  return {
    get current() { return current; },
    reset(value: T) {
      current = value;
      transaction = undefined;
      past.length = future.length = 0;
    },
    update(update: (value: T) => T) {
      const before = current;
      current = update(current);
      if (!transaction) record(before);
      return current;
    },
    begin() { transaction ??= { before: current }; },
    finish(cancel = false) {
      if (transaction) {
        if (cancel) current = transaction.before;
        else record(transaction.before);
        transaction = undefined;
      }
      return current;
    },
    step(redo: boolean) {
      if (transaction) return current;
      const from = redo ? future : past;
      const to = redo ? past : future;
      if (from.length) {
        to.push(current);
        current = from.pop()!;
      }
      return current;
    },
  };
}
