# event-kit

Provides Emitter, Disposable, and CompositeDisposable event primitives.

These are the building blocks the editor and its packages use to expose evented
APIs: a subscription hands back a `Disposable`, related subscriptions are grouped
into a `CompositeDisposable`, and a class that wants to notify observers keeps an
`Emitter`. Packages normally reach them through `require('lumine')`, which
re-exports all three.

## Features

- **Disposable**: wraps a disposal action that runs at most once, and dereferences it afterward.
- **Composite disposal**: aggregates any number of disposables so a whole subscription group tears down together.
- **Duck-typed contract**: `Disposable.isDisposable()` accepts any object with a `dispose()` method, so disposables cross package boundaries without sharing a class.
- **Emitter**: registers handlers by event name and returns a disposable for each subscription.
- **Ordered delivery**: `preempt()` puts a handler ahead of the ones already registered, and `once()` unsubscribes after the first call.
- **Async emission**: `emitAsync()` resolves once every handler's returned promise has settled.
- **Exception handling**: `Emitter.onEventHandlerException()` routes handler exceptions to registered observers instead of aborting the remaining handlers.

## Installation

```sh
npm install @lumine-code/event-kit
```

## Usage

```js
const { Emitter, CompositeDisposable } = require("@lumine-code/event-kit");

class User {
  constructor() {
    this.emitter = new Emitter();
  }

  onDidChangeName(callback) {
    return this.emitter.on("did-change-name", callback);
  }

  setName(name) {
    if (name !== this.name) {
      this.name = name;
      this.emitter.emit("did-change-name", name);
    }
    return this.name;
  }

  destroy() {
    this.emitter.dispose();
  }
}

const subscriptions = new CompositeDisposable();
const user = new User();
subscriptions.add(user.onDidChangeName((name) => console.log(name)));

// Unsubscribes every handler added to the composite.
subscriptions.dispose();
```

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
