const fs = require("node:fs");
const path = require("node:path");

const manifest = require("../package.json");
const packageName = manifest.name;
const commonjs = require(packageName);

describe("module compatibility", () => {
  let esm;

  beforeAll(async () => {
    esm = await import(packageName);
  });

  it("routes CommonJS to the established implementation", () => {
    expect(manifest.main).toBe("./lib/event-kit.js");
    expect(manifest.exports["."].require).toBe("./lib/event-kit.js");
    expect(manifest.exports["."].default).toBe("./lib/event-kit.js");
    expect(commonjs.Disposable).toBe(require("../lib/disposable"));
    expect(commonjs.CompositeDisposable).toBe(require("../lib/composite-disposable"));
    expect(commonjs.Emitter).toBe(require("../lib/emitter"));
  });

  it("exposes equivalent named and default ES module exports", () => {
    expect(esm.default).toEqual({
      CompositeDisposable: esm.CompositeDisposable,
      Disposable: esm.Disposable,
      Emitter: esm.Emitter,
    });
  });

  it("exposes the same class surface in both formats", () => {
    for (const name of ["Disposable", "CompositeDisposable", "Emitter"]) {
      expect(ownNames(esm[name])).toEqual(ownNames(commonjs[name]));
      expect(ownNames(esm[name].prototype)).toEqual(ownNames(commonjs[name].prototype));
    }
  });

  it("routes extensionless subpaths by module format", async () => {
    expect(require(`${packageName}/lib/disposable`)).toBe(commonjs.Disposable);
    expect((await import(`${packageName}/lib/disposable`)).default).toBe(esm.Disposable);
  });

  for (const [format, load] of [
    ["CommonJS", async () => commonjs],
    ["ES modules", async () => esm],
  ]) {
    describe(format, () => {
      let eventKit;

      beforeAll(async () => {
        eventKit = await load();
      });

      afterEach(() => {
        eventKit.Emitter.exceptionHandlers.length = 0;
        eventKit.Emitter.dispatch = eventKit.Emitter.simpleDispatch;
      });

      it("provides idempotent duck-typed disposables", () => {
        let disposalCount = 0;
        const disposable = new eventKit.Disposable(() => disposalCount++);

        expect(eventKit.Disposable.isDisposable(disposable)).toBeTrue();
        expect(eventKit.Disposable.isDisposable({ dispose() {} })).toBeTrue();
        expect(eventKit.Disposable.isDisposable({})).toBeFalse();

        disposable.dispose();
        disposable.dispose();

        expect(disposalCount).toBe(1);
        expect(disposable.disposed).toBeTrue();
        expect(disposable.disposalAction).toBeNull();
      });

      it("groups, removes, clears, and disposes subscriptions", () => {
        const disposed = [];
        const first = new eventKit.Disposable(() => disposed.push("first"));
        const second = new eventKit.Disposable(() => disposed.push("second"));
        const third = new eventKit.Disposable(() => disposed.push("third"));
        const subscriptions = new eventKit.CompositeDisposable(first, second);

        subscriptions.remove(first);
        subscriptions.add(third);
        subscriptions.dispose();
        subscriptions.dispose();

        expect(disposed).toEqual(["second", "third"]);
        expect(first.disposed).toBeFalse();
        expect(subscriptions.disposed).toBeTrue();
      });

      it("rejects invalid subscriptions and remains inert after disposal", () => {
        const subscriptions = new eventKit.CompositeDisposable();
        expect(() => subscriptions.add({})).toThrowError(TypeError);

        subscriptions.dispose();
        expect(() => subscriptions.add(new eventKit.Disposable())).not.toThrow();
        expect(() => subscriptions.remove({})).not.toThrow();
        expect(() => subscriptions.clear()).not.toThrow();
        expect(subscriptions.disposables).toBeNull();
      });

      it("delivers ordered synchronous events and disposable subscriptions", () => {
        const emitter = new eventKit.Emitter();
        const received = [];
        const regular = emitter.on("change", (value) => received.push(`regular:${value}`));
        emitter.preempt("change", (value) => received.push(`preempt:${value}`));
        emitter.once("change", (value) => received.push(`once:${value}`));

        emitter.emit("change", 1);
        regular.dispose();
        emitter.emit("change", 2);

        expect(received).toEqual(["preempt:1", "regular:1", "once:1", "preempt:2"]);
        expect(emitter.listenerCountForEventName("change")).toBe(1);
        expect(emitter.getEventNames()).toEqual(["change"]);
      });

      it("uses an emission snapshot and rejects subscriptions after disposal", () => {
        const emitter = new eventKit.Emitter();
        const received = [];
        emitter.on("change", () => {
          received.push("existing");
          emitter.on("change", () => received.push("added"));
        });

        emitter.emit("change");
        expect(received).toEqual(["existing"]);

        emitter.dispose();
        expect(() => emitter.on("change", () => {})).toThrowError("Emitter has been disposed");
      });

      it("routes handler exceptions only while an exception observer is present", () => {
        const emitter = new eventKit.Emitter();
        const errors = [];
        let continued = false;
        emitter.on("change", () => {
          throw new Error("broken handler");
        });
        emitter.on("change", () => {
          continued = true;
        });

        const subscription = eventKit.Emitter.onEventHandlerException((error) => {
          errors.push(error.message);
        });
        emitter.emit("change");

        expect(errors).toEqual(["broken handler"]);
        expect(continued).toBeTrue();

        subscription.dispose();
        expect(() => emitter.emit("change")).toThrowError("broken handler");
      });

      it("waits for asynchronous handlers", async () => {
        const emitter = new eventKit.Emitter();
        const received = [];
        emitter.on("change", async (value) => {
          await Promise.resolve();
          received.push(value);
        });

        await emitter.emitAsync("change", "complete");

        expect(received).toEqual(["complete"]);
      });

      it("propagates asynchronous handler rejection", async () => {
        const emitter = new eventKit.Emitter();
        emitter.on("change", async () => {
          throw new Error("async failure");
        });

        await expectAsync(emitter.emitAsync("change")).toBeRejectedWithError("async failure");
      });
    });
  }

  it("keeps every ES module browser-safe", () => {
    const modulePaths = [
      "disposable.mjs",
      "composite-disposable.mjs",
      "emitter.mjs",
      "event-kit.mjs",
    ];

    for (const modulePath of modulePaths) {
      const source = fs.readFileSync(path.join(__dirname, "..", "lib", modulePath), "utf8");
      expect(source).not.toMatch(/\brequire\s*\(/);
      expect(source).not.toMatch(/\bmodule\.exports\b/);
      expect(source).not.toMatch(/(?:from|import)\s+["']node:/);
      for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
        expect(match[1]).toMatch(/^\.\/.+\.mjs$/);
      }
    }
  });
});

function ownNames(value) {
  return Object.getOwnPropertyNames(value).sort();
}
