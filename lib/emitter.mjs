import CompositeDisposable from "./composite-disposable.mjs";
import Disposable from "./disposable.mjs";

/**
 * @public
 * @status essential
 *
 * Utility class to be used when implementing event-based APIs that allows
 * handlers registered via {@link Emitter#on} to be invoked with calls to
 * {@link Emitter#emit}. Instances of this class are intended to be used
 * internally by classes that expose an event-based API.
 *
 * For example:
 *
 * ```js
 * class User {
 *   constructor() {
 *     this.emitter = new Emitter();
 *   }
 *
 *   onDidChangeName(callback) {
 *     return this.emitter.on("did-change-name", callback);
 *   }
 *
 *   setName(name) {
 *     if (name !== this.name) {
 *       this.name = name;
 *       this.emitter.emit("did-change-name", name);
 *     }
 *
 *     return this.name;
 *   }
 * }
 * ```
 */
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

  /**
   * @category Construction and Destruction
   */

  /**
   * @public
   * @status public
   *
   * Construct an emitter.
   *
   * ```js
   * this.emitter = new Emitter();
   * ```
   */
  constructor() {
    this.disposed = false;
    this.clear();
  }

  /**
   * @public
   * @status public
   *
   * Clear out any existing subscribers.
   */
  clear() {
    if (this.subscriptions != null) {
      this.subscriptions.dispose();
    }

    this.subscriptions = new CompositeDisposable();
    this.handlersByEventName = {};
  }

  /**
   * @public
   * @status public
   *
   * Unsubscribe all handlers.
   */
  dispose() {
    this.subscriptions.dispose();
    this.handlersByEventName = null;
    this.disposed = true;
  }

  /**
   * @category Event Subscription
   */

  /**
   * @public
   * @status public
   *
   * Register the given handler function to be invoked whenever events by the
   * given name are emitted via {@link Emitter#emit}.
   *
   * @param {String} eventName - The name of the event that invokes the handler.
   * @param {Function} handler - The function to invoke when
   *   {@link Emitter#emit} is called with the given event name.
   * @param {Boolean} [unshift=false] - Whether to add the handler before the
   *   existing handlers.
   * @returns {Disposable} A subscription on which
   *   {@link Disposable#dispose} can be called to unsubscribe.
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

  /**
   * @public
   * @status public
   *
   * Register the given handler function to be invoked the next time an event
   * with the given name is emitted via {@link Emitter#emit}.
   *
   * @param {String} eventName - The name of the event that invokes the handler.
   * @param {Function} handler - The function to invoke when
   *   {@link Emitter#emit} is called with the given event name.
   * @param {Boolean} [unshift=false] - Whether to add the handler before the
   *   existing handlers.
   * @returns {Disposable} A subscription on which
   *   {@link Disposable#dispose} can be called to unsubscribe.
   */
  once(eventName, handler, unshift = false) {
    const wrapped = (value) => {
      disposable.dispose();
      return handler(value);
    };

    const disposable = this.on(eventName, wrapped, unshift);
    return disposable;
  }

  /**
   * @public
   * @status public
   *
   * Register the given handler function to be invoked *before* all other
   * handlers existing at the time of subscription whenever events by the given
   * name are emitted via {@link Emitter#emit}.
   *
   * Use this method when you need to be the first to handle a given event. This
   * could be required when a data structure in a parent object needs to be
   * updated before third-party event handlers registered on a child object via
   * a public API are invoked. Your handler could itself be preempted via
   * subsequent calls to this method, but this can be controlled by keeping
   * methods based on {@link Emitter#preempt} private.
   *
   * @param {String} eventName - The name of the event that invokes the handler.
   * @param {Function} handler - The function to invoke when
   *   {@link Emitter#emit} is called with the given event name.
   * @returns {Disposable} A subscription on which
   *   {@link Disposable#dispose} can be called to unsubscribe.
   */
  preempt(eventName, handler) {
    return this.on(eventName, handler, true);
  }

  /**
   * @private
   *
   * Used by the disposable.
   */
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

  /**
   * @category Event Emission
   */

  /**
   * @public
   * @status public
   *
   * Invoke handlers registered via {@link Emitter#on} for the given event name.
   *
   * @param {String} eventName - The name of the event to emit. Handlers
   *   registered with {@link Emitter#on} for the same name will be invoked.
   * @param {*} value - The value passed to each handler.
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
