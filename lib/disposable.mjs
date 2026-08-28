/**
 * @public
 * @status essential
 *
 * A handle to a resource that can be disposed. For example,
 * {@link Emitter#on} returns disposables representing subscriptions.
 */
export default class Disposable {
  /**
   * @public
   * @status public
   *
   * Ensure that `object` correctly implements the {@link Disposable} contract.
   *
   * @param {Object} object - The object to check.
   * @returns {Boolean} Whether `object` is a valid {@link Disposable}.
   */
  static isDisposable(object) {
    return typeof object?.dispose === "function";
  }

  /**
   * @category Construction and Destruction
   */

  /**
   * @public
   * @status public
   *
   * Construct a {@link Disposable}.
   *
   * @param {Function} [disposalAction] - A function to call when
   *   {@link Disposable#dispose} is called for the first time.
   */
  constructor(disposalAction) {
    this.disposed = false;
    this.disposalAction = disposalAction;
  }

  /**
   * @public
   * @status public
   *
   * Perform the disposal action, indicating that the resource associated with
   * this disposable is no longer needed.
   *
   * You can call this method more than once, but the disposal action will only
   * be performed the first time.
   */
  dispose() {
    if (!this.disposed) {
      this.disposed = true;

      if (typeof this.disposalAction === "function") {
        this.disposalAction();
      }

      this.disposalAction = null;
    }
  }
}
