import Disposable from "./disposable.mjs";

// Essential: An object that aggregates multiple {Disposable} instances together
// into a single disposable, so they can all be disposed as a group.
export default class CompositeDisposable {
  /*
  Section: Construction and Destruction
  */

  // Public: Construct an instance, optionally with one or more disposables
  constructor(...disposables) {
    this.disposed = false;
    this.disposables = new Set();
    this.add(...disposables);
  }

  // Public: Dispose all disposables added to this composite disposable.
  //
  // If this object has already been disposed, this method has no effect.
  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      for (const disposable of this.disposables) {
        disposable.dispose();
      }
      this.disposables = null;
    }
  }

  /*
  Section: Managing Disposables
  */

  // Public: Add disposables to be disposed when the composite is disposed.
  //
  // If this object has already been disposed, this method has no effect.
  add(...disposables) {
    if (!this.disposed) {
      for (const disposable of disposables) {
        assertDisposable(disposable);
        this.disposables.add(disposable);
      }
    }
  }

  // Public: Remove a previously added disposable.
  remove(disposable) {
    if (!this.disposed) {
      this.disposables.delete(disposable);
    }
  }

  // Public: Alias to {CompositeDisposable::remove}
  delete(disposable) {
    this.remove(disposable);
  }

  // Public: Clear all disposables. They will not be disposed by the next call
  // to dispose.
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
