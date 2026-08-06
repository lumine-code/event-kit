const Emitter = require("../lib/emitter");

describe("Emitter", function () {
  afterEach(function () {
    // The exception handlers and the dispatch they select live on the class, so
    // a spec that leaves one registered would change how every later spec
    // dispatches.
    Emitter.exceptionHandlers.length = 0;
    Emitter.dispatch = Emitter.simpleDispatch;
  });

  it("invokes the observer when the named event is emitted until disposed", function () {
    const emitter = new Emitter();

    const fooEvents = [];
    const barEvents = [];

    const sub1 = emitter.on("foo", (value) => fooEvents.push(["a", value]));
    const sub2 = emitter.on("bar", (value) => barEvents.push(["b", value]));
    emitter.preempt("bar", (value) => barEvents.push(["c", value]));

    emitter.emit("foo", 1);
    emitter.emit("foo", 2);
    emitter.emit("bar", 3);

    sub1.dispose();

    emitter.emit("foo", 4);
    emitter.emit("bar", 5);

    sub2.dispose();

    emitter.emit("bar", 6);

    expect(fooEvents).toEqual([
      ["a", 1],
      ["a", 2],
    ]);
    expect(barEvents).toEqual([
      ["c", 3],
      ["b", 3],
      ["c", 5],
      ["b", 5],
      ["c", 6],
    ]);
  });

  it("throws an exception when subscribing with a callback that isn't a function", function () {
    const emitter = new Emitter();
    expect(() => emitter.on("foo", null)).toThrow();
    expect(() => emitter.on("foo", "a")).toThrow();
  });

  it("throws an exception when subscribing on a disposed emitter", function () {
    const emitter = new Emitter();
    emitter.dispose();
    expect(() => emitter.on("foo", function () {})).toThrowError("Emitter has been disposed");
  });

  it("can register a function more than once, and therefore will call it multiple times", function () {
    const emitter = new Emitter();
    let callCount = 0;
    const fn = () => callCount++;

    emitter.on("foo", fn);
    emitter.on("foo", fn);
    emitter.emit("foo");

    expect(callCount).toEqual(2);
  });

  it("allows all subscribers to be cleared out at once", function () {
    const emitter = new Emitter();
    const events = [];

    emitter.on("foo", (value) => events.push(["a", value]));
    emitter.preempt("foo", (value) => events.push(["b", value]));
    emitter.clear();

    emitter.emit("foo", 1);
    emitter.emit("foo", 2);
    expect(events).toEqual([]);
  });

  it("does not call handlers added during an emit for that same emit", function () {
    const emitter = new Emitter();
    const events = [];
    let added = false;

    emitter.on("foo", function () {
      events.push("first");
      if (!added) {
        added = true;
        emitter.on("foo", () => events.push("added-during-emit"));
      }
    });

    // The handler registered above joins the list, but not the copy this emit
    // is already iterating.
    emitter.emit("foo");
    expect(events).toEqual(["first"]);

    emitter.emit("foo");
    expect(events).toEqual(["first", "first", "added-during-emit"]);
  });

  it("allows the listeners to be inspected", function () {
    const emitter = new Emitter();

    const disposable1 = emitter.on("foo", function () {});
    expect(emitter.getEventNames()).toEqual(["foo"]);
    expect(emitter.listenerCountForEventName("foo")).toBe(1);
    expect(emitter.listenerCountForEventName("bar")).toBe(0);
    expect(emitter.getTotalListenerCount()).toBe(1);

    const disposable2 = emitter.on("bar", function () {});
    expect(emitter.getEventNames()).toEqual(["foo", "bar"]);
    expect(emitter.listenerCountForEventName("foo")).toBe(1);
    expect(emitter.listenerCountForEventName("bar")).toBe(1);
    expect(emitter.getTotalListenerCount()).toBe(2);

    emitter.preempt("foo", function () {});
    expect(emitter.getEventNames()).toEqual(["foo", "bar"]);
    expect(emitter.listenerCountForEventName("foo")).toBe(2);
    expect(emitter.listenerCountForEventName("bar")).toBe(1);
    expect(emitter.getTotalListenerCount()).toBe(3);

    disposable1.dispose();
    expect(emitter.getEventNames()).toEqual(["foo", "bar"]);
    expect(emitter.listenerCountForEventName("foo")).toBe(1);
    expect(emitter.listenerCountForEventName("bar")).toBe(1);
    expect(emitter.getTotalListenerCount()).toBe(2);

    disposable2.dispose();
    expect(emitter.getEventNames()).toEqual(["foo"]);
    expect(emitter.listenerCountForEventName("foo")).toBe(1);
    expect(emitter.listenerCountForEventName("bar")).toBe(0);
    expect(emitter.getTotalListenerCount()).toBe(1);

    emitter.clear();
    expect(emitter.getTotalListenerCount()).toBe(0);
  });

  describe("::once", function () {
    it("only invokes the handler once", function () {
      const emitter = new Emitter();
      let firedCount = 0;
      emitter.once("foo", () => (firedCount += 1));
      emitter.emit("foo");
      emitter.emit("foo");
      expect(firedCount).toBe(1);
    });

    it("invokes the handler with the emitted value", function () {
      const emitter = new Emitter();
      let emittedValue = null;
      emitter.once("foo", (value) => (emittedValue = value));
      emitter.emit("foo", "bar");
      expect(emittedValue).toBe("bar");
    });
  });

  describe("dispose", function () {
    it("disposes of all listeners", function () {
      const emitter = new Emitter();
      const disposable1 = emitter.on("foo", function () {});
      const disposable2 = emitter.once("foo", function () {});
      emitter.dispose();
      expect(disposable1.disposed).toBe(true);
      expect(disposable2.disposed).toBe(true);
    });

    it("doesn't keep track of disposed disposables", function () {
      const emitter = new Emitter();
      const disposable = emitter.on("foo", function () {});
      expect(emitter.subscriptions.disposables.size).toBe(1);
      disposable.dispose();
      expect(emitter.subscriptions.disposables.size).toBe(0);
    });
  });

  describe("when a handler throws an exception", function () {
    describe("when no exception handlers are registered on Emitter", function () {
      it("throws exceptions as normal, stopping subsequent handlers from firing", function () {
        const emitter = new Emitter();
        let handler2Fired = false;

        emitter.on("foo", function () {
          throw new Error();
        });
        emitter.on("foo", () => (handler2Fired = true));

        expect(() => emitter.emit("foo")).toThrow();
        expect(handler2Fired).toBe(false);
      });
    });

    describe("when exception handlers are registered on Emitter", function () {
      it("invokes the exception handlers in the order they were registered and continues to fire subsequent event handlers", function () {
        const emitter = new Emitter();
        let handler2Fired = false;

        emitter.on("foo", function () {
          throw new Error("bar");
        });
        emitter.on("foo", () => (handler2Fired = true));

        let errorHandlerInvocations = [];
        const disposable1 = Emitter.onEventHandlerException(function (error) {
          expect(error.message).toBe("bar");
          errorHandlerInvocations.push(1);
        });

        const disposable2 = Emitter.onEventHandlerException(function (error) {
          expect(error.message).toBe("bar");
          errorHandlerInvocations.push(2);
        });

        emitter.emit("foo");

        expect(errorHandlerInvocations).toEqual([1, 2]);
        expect(handler2Fired).toBe(true);

        errorHandlerInvocations = [];
        handler2Fired = false;

        disposable1.dispose();
        emitter.emit("foo");
        expect(errorHandlerInvocations).toEqual([2]);
        expect(handler2Fired).toBe(true);

        errorHandlerInvocations = [];
        handler2Fired = false;

        disposable2.dispose();
        expect(() => emitter.emit("foo")).toThrow();
        expect(errorHandlerInvocations).toEqual([]);
        expect(handler2Fired).toBe(false);
      });
    });
  });

  describe("::emitAsync", function () {
    it("resolves when all of the promises returned by handlers have resolved", async function () {
      const emitter = new Emitter();

      let resolveHandler1 = null;
      let resolveHandler3 = null;
      emitter.on("foo", () => new Promise((resolve) => (resolveHandler1 = resolve)));
      emitter.on("foo", function () {});
      emitter.on("foo", () => new Promise((resolve) => (resolveHandler3 = resolve)));

      const promise = emitter.emitAsync("foo");

      resolveHandler3();
      resolveHandler1();

      await expectAsync(promise).toBeResolvedTo(undefined);
    });

    it("rejects when any of the promises returned by handlers reject", async function () {
      const emitter = new Emitter();

      let rejectHandler1 = null;
      emitter.on("foo", () => new Promise((resolve, reject) => (rejectHandler1 = reject)));
      emitter.on("foo", function () {});
      emitter.on("foo", () => new Promise(function () {}));

      const promise = emitter.emitAsync("foo");

      rejectHandler1(new Error("Something bad happened"));

      await expectAsync(promise).toBeRejectedWithError("Something bad happened");
    });

    it("resolves when the event has no handlers", async function () {
      const emitter = new Emitter();
      await expectAsync(emitter.emitAsync("nobody-listening")).toBeResolvedTo(undefined);
    });
  });
});
