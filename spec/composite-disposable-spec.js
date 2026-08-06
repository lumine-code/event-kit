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
