import Disposable from "./disposable.mjs";

/**
 * @public
 * @status essential
 *
 * An object that aggregates multiple {@link Disposable} instances into a
 * single disposable, so they can all be disposed as a group.
 *
 * These are very useful when subscribing to multiple events.
 *
 * ## Examples
 *
 * ```js
 * import CompositeDisposable from "./composite-disposable.mjs";
 *
 * class Something {
 *   constructor() {
 *     this.disposables = new CompositeDisposable();
 *     const editor = lumine.workspace.getActiveTextEditor();
 *     this.disposables.add(editor.onDidChange(() => {}));
 *     this.disposables.add(editor.onDidChangePath(() => {}));
 *   }
 *
 *   destroy() {
 *     this.disposables.dispose();
 *   }
 * }
 * ```
 */
export default class CompositeDisposable {
  /**
   * @category Construction and Destruction
   */

  /**
   * @public
   * @status public
   *
   * Construct an instance, optionally with one or more disposables.
   *
   * @param {...Disposable} disposables - Disposables to add to the instance.
   */
  constructor(...disposables) {
    this.disposed = false;
    this.disposables = new Set();
    this.add(...disposables);
  }

  /**
   * @public
   * @status public
   *
   * Dispose all disposables added to this composite disposable.
   *
   * Every disposable is attempted before errors are reported. A single failure
   * is rethrown unchanged; multiple failures produce an `AggregateError` whose
   * `errors` follow disposal order and whose `cause` is the first failure.
   *
   * If this object has already been disposed, this method has no effect.
   */
  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      const disposables = [...this.disposables];
      this.disposables.clear();
      this.disposables = null;
      const failures = [];
      for (const disposable of disposables) {
        try {
          disposable.dispose();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          "Unable to dispose all resources in CompositeDisposable",
          {
            cause: failures[0],
          },
        );
      }
    }
  }

  /**
   * @category Managing Disposables
   */

  /**
   * @public
   * @status public
   *
   * Add disposables to be disposed when the composite is disposed.
   *
   * If this object has already been disposed, this method has no effect.
   *
   * @param {...Disposable} disposables - {@link Disposable} instances or any
   *   objects with `.dispose()` methods.
   */
  add(...disposables) {
    if (!this.disposed) {
      for (const disposable of disposables) {
        assertDisposable(disposable);
        this.disposables.add(disposable);
      }
    }
  }

  /**
   * @public
   * @status public
   *
   * Remove a previously added disposable.
   *
   * @param {Disposable} disposable - A {@link Disposable} instance or any
   *   object with a `.dispose()` method.
   */
  remove(disposable) {
    if (!this.disposed) {
      this.disposables.delete(disposable);
    }
  }

  /**
   * @public
   * @status public
   *
   * Alias for {@link CompositeDisposable#remove}.
   *
   * @param {Disposable} disposable - A {@link Disposable} instance or any
   *   object with a `.dispose()` method.
   */
  delete(disposable) {
    this.remove(disposable);
  }

  /**
   * @public
   * @status public
   *
   * Clear all disposables. They will not be disposed by the next call to
   * {@link CompositeDisposable#dispose}.
   */
  clear() {
    if (!this.disposed) {
      this.disposables.clear();
    }
  }
}

function assertDisposable(disposable) {
  if (!Disposable.isDisposable(disposable)) {
    throw new TypeError("Arguments to CompositeDisposable.add must have a .dispose() method");
  }
}
