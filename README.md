# Synchronized

[![NPM Version](https://img.shields.io/npm/v/%40digitalwalletcorp%2Fsynchronized)](https://www.npmjs.com/package/@digitalwalletcorp/synchronized) [![License](https://img.shields.io/npm/l/%40digitalwalletcorp%2Fsynchronized)](https://opensource.org/licenses/MIT) ![Environment](https://img.shields.io/badge/environment-Node.js%20%7C%20Browser-blue) [![Build Status](https://img.shields.io/github/actions/workflow/status/digitalwalletcorp/synchronized/ci.yml?branch=main)](https://github.com/digitalwalletcorp/synchronized/actions) [![Test Coverage](https://img.shields.io/codecov/c/github/digitalwalletcorp/synchronized.svg)](https://codecov.io/gh/digitalwalletcorp/synchronized)

A lightweight TypeScript/JavaScript library that provides a simple way to ensure mutual exclusion for asynchronous operations. It mimics the behavior of `synchronized` blocks in languages like Java, preventing race conditions by ensuring that only one piece of code within a "critical section" executes at a time.

This is ideal for managing access to shared resources, controlling state changes in UI components, or ensuring sequential execution of database or API calls without complex locking mechanisms.

### ✨ Features

* Mutual Exclusion: Guarantees that only one `execute` block runs at a time for a given `Synchronized` instance or for a set of calls that share a common lock object.
* Sequential Execution: Queues up concurrent requests and executes them sequentially in the order they were called.
* Promise-Based: Works seamlessly with `async/await`, preserving the natural flow of your asynchronous code.
* Simple API: Extremely easy to use with zero dependencies. Just instantiate `Synchronized` class and wrap your async function with `execute`.

### ✅ Compatibility

This library is Isomorphic / Universal, meaning it is designed to run in multiple JavaScript environments. It has no dependencies on platform-specific APIs.

- ✅ **Node.js**: Fully supported on all modern Node.js versions.
- ✅ **Browsers**: Fully supported on all modern browsers that support ES2020 (Promises, async/await).

### 📦 Installation

```bash
npm install @digitalwalletcorp/synchronized
# or
yarn add @digitalwalletcorp/synchronized
```

### 📖 Usage

Simply create an instance of the `Synchronized` class and pass your asynchronous function to the `execute` method.

1. Synchronizeation with a Single Instance

When you call `execute` multiple times on the same instance, the library automatically queues and manages the calls to run one after another.

```typescript
import { Synchronized } from '@digitalwalletcorp/synchronized';

const synchronized = new Synchronized();

async function doSomething() {
  await synchronized.execute(async () => {
    // This block will run exclusively, one at a time.
    console.log('Starting process...');
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('Process complete.');
  });
}

// Even though called concurrently, they will execute sequentially.
doSomething(); // Runs first
doSomething(); // Waits
doSomething(); // Waits
```

2. Synchronization with a Shared Lock Object

By passing a common lock object to the `constructor` or `execute` method, you can ensure mutual exclusion even across different instances of `Synchronized` or different functions. This is useful for managing access to globally shared resources.

```typescript
import { Synchronized, SimpleLock } from '@digitalwalletcorp/synchronized';

// A unique lock object for our shared database.
const databaseLock = new SimpleLock();

// Different functions that access the same shared resource.
async function updateUser() {
  const sync = new Synchronized();
  await sync.execute(async () => {
    // Database write operations
    console.log('Updating user data...');
  }, databaseLock); // Pass the common lock object.
}

async function logTransaction() {
  const sync = new Synchronized();
  await sync.execute(async () => {
    // Transaction logging
    console.log('Logging transaction...');
  }, databaseLock); // Pass the same lock object.
}

// Calling the functions concurrently is safe, as the lock controls access.
updateUser();
logTransaction();
```

### ⚠️ Important Usage Notes

Due to the nature of JavaScript's asynchronous execution model, nesting `execute` calls with the same lock object **will result in a deadlock**. To avoid this, please do not call `synchronized.execute` from within another `synchronized.execute` call that uses the same or no lock object.

##### ❌ Example of Deadlock

In this example, the nested `execute` calls use the same lock object, causing a deadlock. The inner call waits for the outer call to release the lock, but the outer call is waiting for the inner call to complete.

```typescript
// This code will cause a deadlock.
import { Synchronized, SimpleLock } from '@digitalwalletcorp/synchronized';

const synchronized = new Synchronized(new SimpleLock());

async function runWithDeadlock() {
  await synchronized.execute(async () => {
    // Outer call holds the lock.
    console.log('Outer block has the lock.');

    // Inner call tries to acquire the same lock, causing a deadlock.
    await synchronized.execute(async () => {
      console.log('Inner block has acquired the lock.');
      // This line will never be reached.
    });
  });
}

runWithDeadlock(); // This will not complete and will time out.
```

##### ✅ Example of Correct Nesting

This example demonstrates how to correctly nest `execute` calls by using different lock objects, which prevents a deadlock from occurring.

```typescript
// This code will run correctly.
import { Synchronized, SimpleLock } from '@digitalwalletcorp/synchronized';

const lock1 = new SimpleLock();
const lock2 = new SimpleLock();
const synchronized = new Synchronized();

async function runWithoutDeadlock() {
  await synchronized.execute(async () => {
    // Outer call acquires lock1.
    console.log('Outer block has lock1.');

    // Inner call acquires a different lock, lock2.
    // This allows the inner block to run without waiting for lock1 to be released.
    await synchronized.execute(async () => {
      console.log('Inner block has acquired lock2.');
    }, lock2);

    console.log('Outer block has completed.');
  }, lock1);
}

runWithoutDeadlock(); // This will complete successfully.
```

### 📚 API Reference

##### `new Synchronized(lock?: Lock)`

Creates a new instance of the `Synchronized` class. By passing a lock object to the constructor, this instance will be bound to that lock, ensuring synchronization with any other `Synchronized` instance or `execute` call that uses the same lock. Each instance maintains its own independent execution queue if no lock is provided.

* `lock` (Optional): A common object used for cross-instance synchronization.

##### `execute<T>(asyncFunction: () => Promise<T>, lock?: Lock): Promise<T>`

Wraps and executes an asynchronous function, ensuring mutual exclusion.

* `asyncFunction`: A function that returns a `Promise`. This is the "critical section" of your code that needs to be protected from concurrent execution.
* `lock` (Optional): A common object used for synchronization. If provided, this lock takes precedence over any lock passed to the constructor.
* Returns: A `Promise<T>` that resolves or rejects with the result of the `asyncFunction`.

### 📜 License

This project is licensed under the MIT License. See the [LICENSE](https://opensource.org/licenses/MIT) file for details.
