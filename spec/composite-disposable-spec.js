const CompositeDisposable = require("../lib/composite-disposable");
const Disposable = require("../lib/disposable");

describe("CompositeDisposable", function () {
  let disposable1, disposable2, disposable3;

  beforeEach(function () {
    disposable1 = new Disposable();
    disposable2 = new Disposable();
    disposable3 = new Disposable();
  });

  it("can be constructed with multiple disposables", function () {
    const composite = new CompositeDisposable(disposable1, disposable2);
    composite.dispose();

    expect(composite.disposed).toBe(true);
    expect(disposable1.disposed).toBe(true);
    expect(disposable2.disposed).toBe(true);
  });

  it("allows disposables to be added and removed", function () {
    const composite = new CompositeDisposable();
    composite.add(disposable1);
    composite.add(disposable2, disposable3);
    composite.delete(disposable1);
    composite.remove(disposable3);

    composite.dispose();

    expect(composite.disposed).toBe(true);
    expect(disposable1.disposed).toBe(false);
    expect(disposable2.disposed).toBe(true);
    expect(disposable3.disposed).toBe(false);
  });

  it("clears disposables without disposing them", function () {
    const composite = new CompositeDisposable(disposable1, disposable2);
    composite.clear();
    composite.dispose();

    expect(composite.disposed).toBe(true);
    expect(disposable1.disposed).toBe(false);
    expect(disposable2.disposed).toBe(false);
  });

  it("has no effect once disposed", function () {
    const composite = new CompositeDisposable(disposable1);
    composite.dispose();

    // add/remove/clear must not throw on a disposed composite, and must not
    // resurrect the null disposables set.
    composite.add(disposable2);
    composite.remove(disposable1);
    composite.clear();

    expect(composite.disposables).toBe(null);
    expect(disposable2.disposed).toBe(false);
  });

  it("attempts every disposable and preserves one frozen failure unchanged", function () {
    const failure = Object.freeze(new Error("First resource failed"));
    const first = jasmine.createSpy("first disposal").and.throwError(failure);
    const second = jasmine.createSpy("second disposal");
    const composite = new CompositeDisposable({ dispose: first }, { dispose: second });

    let actual;
    try {
      composite.dispose();
    } catch (error) {
      actual = error;
    }
    expect(actual).toBe(failure);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(composite.disposed).toBe(true);
    expect(composite.disposables).toBe(null);
    expect(() => composite.dispose()).not.toThrow();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("collects multiple failures in disposal order after attempting successful resources too", function () {
    const firstFailure = Object.freeze(new Error("First resource failed"));
    const lastFailure = new Error("Last resource failed");
    const disposed = [];
    const composite = new CompositeDisposable(
      {
        dispose() {
          disposed.push("first");
          throw firstFailure;
        },
      },
      { dispose: () => disposed.push("middle") },
      {
        dispose() {
          disposed.push("last");
          throw lastFailure;
        },
      },
    );
    let failure;
    try {
      composite.dispose();
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof AggregateError).toBe(true);
    expect(failure.errors).toEqual([firstFailure, lastFailure]);
    expect(failure.cause).toBe(firstFailure);
    expect(disposed).toEqual(["first", "middle", "last"]);
    expect(composite.disposables).toBe(null);
    expect(() => composite.dispose()).not.toThrow();
    expect(disposed).toEqual(["first", "middle", "last"]);
  });

  it("detaches the owned group before callbacks and remains inert during reentrant disposal", function () {
    const failure = new Error("Reentrant resource failed");
    const addedDuringCleanup = new Disposable();
    const disposed = [];
    let previousGroup;
    const first = new Disposable(() => {
      disposed.push("first");
      expect(composite.disposed).toBe(true);
      expect(composite.disposables).toBe(null);
      expect(previousGroup.size).toBe(0);
      composite.dispose();
      composite.add(addedDuringCleanup);
      composite.remove(second);
      composite.clear();
      throw failure;
    });
    const second = new Disposable(() => disposed.push("second"));
    const composite = new CompositeDisposable(first, second);
    previousGroup = composite.disposables;

    let actual;
    try {
      composite.dispose();
    } catch (error) {
      actual = error;
    }
    expect(actual).toBe(failure);

    expect(disposed).toEqual(["first", "second"]);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
    expect(addedDuringCleanup.disposed).toBe(false);
    expect(composite.disposables).toBe(null);
  });

  it("preserves a nested aggregate while still disposing the parent's remaining resources", function () {
    const firstFailure = new Error("Nested first failed");
    const secondFailure = new Error("Nested second failed");
    const parentFailure = new Error("Parent resource failed");
    const nested = new CompositeDisposable(
      {
        dispose: () => {
          throw firstFailure;
        },
      },
      {
        dispose: () => {
          throw secondFailure;
        },
      },
    );
    const disposed = jasmine.createSpy("parent final resource");
    const parent = new CompositeDisposable(
      nested,
      {
        dispose: () => {
          throw parentFailure;
        },
      },
      { dispose: disposed },
    );
    let failure;
    try {
      parent.dispose();
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof AggregateError).toBe(true);
    expect(failure.errors[0] instanceof AggregateError).toBe(true);
    expect(failure.errors[0].errors).toEqual([firstFailure, secondFailure]);
    expect(failure.errors[0].cause).toBe(firstFailure);
    expect(failure.errors[1]).toBe(parentFailure);
    expect(failure.cause).toBe(failure.errors[0]);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(nested.disposables).toBe(null);
    expect(parent.disposables).toBe(null);
  });

  for (const failure of [undefined, null, false]) {
    it(`preserves a single ${String(failure)} exception without skipping cleanup`, function () {
      const disposed = jasmine.createSpy("remaining resource");
      const composite = new CompositeDisposable(
        {
          dispose: () => {
            throw failure;
          },
        },
        { dispose: disposed },
      );
      let thrown = false;
      let actual;
      try {
        composite.dispose();
      } catch (error) {
        thrown = true;
        actual = error;
      }

      expect(thrown).toBe(true);
      expect(actual).toBe(failure);
      expect(disposed).toHaveBeenCalledTimes(1);
      expect(composite.disposables).toBe(null);
    });
  }

  describe("Adding non disposables", function () {
    it("throws a TypeError when undefined", function () {
      const composite = new CompositeDisposable();
      const nonDisposable = undefined;
      expect(() => composite.add(nonDisposable)).toThrowError(TypeError);
    });

    it("throws a TypeError when object missing .dispose()", function () {
      const composite = new CompositeDisposable();
      const nonDisposable = {};
      expect(() => composite.add(nonDisposable)).toThrowError(TypeError);
    });

    it("throws a TypeError when object with non-function dispose", function () {
      const composite = new CompositeDisposable();
      const nonDisposable = { dispose: "not a function" };
      expect(() => composite.add(nonDisposable)).toThrowError(TypeError);
    });

    it("throws a TypeError when constructed with one", function () {
      expect(() => new CompositeDisposable({})).toThrowError(TypeError);
    });
  });
});
