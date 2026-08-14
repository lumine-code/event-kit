import CompositeDisposable from "./composite-disposable.mjs";
import Disposable from "./disposable.mjs";

// Essential: Utility class to be used when implementing event-based APIs that
// allows for handlers registered via `::on` to be invoked with calls to
// `::emit`. Instances of this class are intended to be used internally by
// classes that expose an event-based API.
class Emitter {
  static onEventHandlerException(exceptionHandler) {
    if (this.exceptionHandlers.length === 0) {
      this.dispatch = this.exceptionHandlingDispatch;
    }

    this.exceptionHandlers.push(exceptionHandler);

    return new Disposable(() => {
      this.exceptionHandlers.splice(this.exceptionHandlers.indexOf(exceptionHandler), 1);

      if (this.exceptionHandlers.length === 0) {
        this.dispatch = this.simpleDispatch;
      }
    });
  }

  static simpleDispatch(handler, value) {
    return handler(value);
  }

  static exceptionHandlingDispatch(handler, value) {
    try {
      return handler(value);
    } catch (exception) {
      return this.exceptionHandlers.map((exceptionHandler) => exceptionHandler(exception));
    }
  }

  /*
  Section: Construction and Destruction
  */

  constructor() {
    this.disposed = false;
    this.clear();
  }

  clear() {
    if (this.subscriptions != null) {
      this.subscriptions.dispose();
    }

    this.subscriptions = new CompositeDisposable();
    this.handlersByEventName = {};
  }

  dispose() {
    this.subscriptions.dispose();
    this.handlersByEventName = null;
    this.disposed = true;
  }

  /*
  Section: Event Subscription
  */

  on(eventName, handler, unshift = false) {
    if (this.disposed) {
      throw new Error("Emitter has been disposed");
    }

    if (typeof handler !== "function") {
      throw new Error("Handler must be a function");
    }

    const currentHandlers = this.handlersByEventName[eventName];

    if (currentHandlers) {
      if (unshift) {
        currentHandlers.unshift(handler);
      } else {
        currentHandlers.push(handler);
      }
    } else {
      this.handlersByEventName[eventName] = [handler];
    }

    const cleanup = new Disposable(() => {
      this.subscriptions.remove(cleanup);
      return this.off(eventName, handler);
    });

    this.subscriptions.add(cleanup);
    return cleanup;
  }

  once(eventName, handler, unshift = false) {
    const wrapped = (value) => {
      disposable.dispose();
      return handler(value);
    };

    const disposable = this.on(eventName, wrapped, unshift);
    return disposable;
  }

  preempt(eventName, handler) {
    return this.on(eventName, handler, true);
  }

  off(eventName, handlerToRemove) {
    if (this.disposed) {
      return;
    }

    const handlers = this.handlersByEventName[eventName];

    if (handlers) {
      const handlerIndex = handlers.indexOf(handlerToRemove);

      if (handlerIndex >= 0) {
        handlers.splice(handlerIndex, 1);
      }

      if (handlers.length === 0) {
        delete this.handlersByEventName[eventName];
      }
    }
  }

  /*
  Section: Event Emission
  */

  emit(eventName, value) {
    const handlers = this.handlersByEventName && this.handlersByEventName[eventName];

    if (handlers) {
      const handlersCopy = handlers.slice();

      for (let i = 0; i < handlersCopy.length; i++) {
        this.constructor.dispatch(handlersCopy[i], value);
      }
    }
  }

  emitAsync(eventName, value) {
    const handlers = this.handlersByEventName && this.handlersByEventName[eventName];

    if (handlers) {
      const promises = handlers.map((handler) => this.constructor.dispatch(handler, value));
      return Promise.all(promises).then(() => {});
    }

    return Promise.resolve();
  }

  getEventNames() {
    return Object.keys(this.handlersByEventName);
  }

  listenerCountForEventName(eventName) {
    const handlers = this.handlersByEventName[eventName];
    return handlers == null ? 0 : handlers.length;
  }

  getTotalListenerCount() {
    let result = 0;

    for (const eventName of Object.keys(this.handlersByEventName)) {
      result += this.handlersByEventName[eventName].length;
    }

    return result;
  }
}

// Assigned after the class body so both stay writable: `onEventHandlerException`
// swaps `dispatch` between the two implementations, and specs replace them.
Emitter.dispatch = Emitter.simpleDispatch;
Emitter.exceptionHandlers = [];

export default Emitter;
