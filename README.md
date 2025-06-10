# Synchronized

[![NPM Version](https://img.shields.io/npm/v/%40digitalwalletcorp%2Fsynchronized)](https://www.npmjs.com/package/@digitalwalletcorp/synchronized) [![License](https://img.shields.io/npm/l/%40digitalwalletcorp%2Fsynchronized)](https://opensource.org/licenses/MIT) ![Environment](https://img.shields.io/badge/environment-Node.js%20%7C%20Browser-blue) [![Build Status](https://img.shields.io/github/actions/workflow/status/digitalwalletcorp/synchronized/ci.yml?branch=main)](https://github.com/digitalwalletcorp/synchronized/actions) [![Test Coverage](https://img.shields.io/codecov/c/github/digitalwalletcorp/synchronized.svg)](https://codecov.io/gh/digitalwalletcorp/synchronized)

A lightweight TypeScript/JavaScript library that provides a simple way to ensure mutual exclusion for asynchronous operations. It mimics the behavior of `synchronized` blocks in languages like Java, preventing race conditions by ensuring that only one piece of code within a "critical section" executes at a time.

This is ideal for managing access to shared resources, controlling state changes in UI components, or ensuring sequential execution of database or API calls without complex locking mechanisms.

## ✨ Features

* Mutual Exclusion: Guarantees that only one `execute` block runs at a time for a given `Synchronized` instance.
* Sequential Execution: Queues up concurrent requests and executes them sequentially in the order they were called.
* Promise-Based: Works seamlessly with `async/await`, preserving the natural flow of your asynchronous code.
* Simple API: Extremely easy to use with zero dependencies. Just instantiate Synchronized class and wrap your async function with `execute`.

## ✅ Compatibility

This library is Isomorphic / Universal, meaning it is designed to run in multiple JavaScript environments. It has no dependencies on platform-specific APIs.

- ✅ **Node.js**: Fully supported on all modern Node.js versions.
- ✅ **Browsers**: Fully supported on all modern browsers that support ES2020 (Promises, async/await).

## 📦 Installation

```bash
npm install @digitalwalletcorp/synchronized
# or
yarn add @digitalwalletcorp/synchronized
```

## 📖 Usage

The core of this library is the `Synchronized` class. You create an instance of it and then use the `execute` method to wrap any asynchronous function you want to protect from concurrent access.

When multiple calls to `execute` are made on the same instance, they are queued up and run one after another, ensuring no overlap.

#### Practical Example: Preventing Race Conditions in File I/O

This example demonstrates a practical scenario where a `synchronized` block is essential for preventing data corruption caused by race conditions.

The goal is to write numbers 1 through 5 to an output file, each on a new line. The logic for each operation is:

1. Check if the file exists.
2. If it does not exist, create it and write the number.
3. If it does exist, append a newline character (`\n`) followed by the number.

This "check-then-write" operation is a classic critical section that must be protected from concurrent access.

**The Problem:** Race Condition without `synchronized`

First, let's see what happens when we run five asynchronous file-writing tasks concurrently without any synchronization.

```typescript
import fs from 'fs';

const FILE_PATH = 'output-without-syncronized.log';

/**
 * Checks for a file's existence and appends a number.
 * This function is vulnerable to race conditions.
 */
async function appendNumberToFile(num: number): Promise<void> {
  try {
    // 1. Check if the file exists (this is async)
    await fs.promises.access(FILE_PATH);

    // If it exists, append with a newline.
    console.log(`[Run ${num}] File exists. Appending '${'\\n'}${num}'.`);
    await fs.promises.appendFile(FILE_PATH, `\n${num}`);

  } catch (error) {
    // If access fails, the file doesn't exist.
    // Multiple tasks might enter this block concurrently!
    console.log(`[Run ${num}] File does NOT exist. Creating with '${num}'.`);
    await fs.promises.writeFile(FILE_PATH, String(num));
  }
}

async function main() {
  // Ensure the file doesn't exist before starting
  await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

  console.log('Starting 5 concurrent file operations WITHOUT synchronized...');

  const tasks = [];
  for (let i = 1; i <= 5; i++) {
    tasks.push(appendNumberToFile(i));
  }

  // Run all tasks concurrently to simulate simultaneous requests.
  await Promise.all(tasks);

  const finalContent = await fs.promises.readFile(FILE_PATH, 'utf-8');
  console.log('\n--- Final File Content (without synchronized) ---');
  console.log(finalContent);
  console.log('-----------------------------------------');
}

main();
```

**Problematic Output:**

When you run this code, multiple tasks will check for the existence of the file, and none of them will be able to check for the existence of the file. Because they will all assume they are the first task, the output will be unpredictable and not the multi-line output that is desired.

```
// Console Log (Example)
Starting 5 concurrent file operations WITHOUT synchronized...
[Run 1] File does NOT exist. Creating with '1'.
[Run 2] File does NOT exist. Creating with '2'.
[Run 3] File does NOT exist. Creating with '3'.
[Run 4] File does NOT exist. Creating with '4'.
[Run 5] File does NOT exist. Creating with '5'.

--- Final File Content (without synchronized) ---
5
-----------------------------------------
```

**The Solution:** Mutual Exclusion with `synchronized`

Now, let's wrap the critical "check-then-write" logic in `synchronized.execute()` to ensure that only one file operation can run at a time.

```typescript
import fs from 'fs';
import { Synchronized } from '@digitalwalletcorp/synchronized';

const FILE_PATH = 'output-with-syncronized.log';
const synchronized = new Synchronized();

/**
 * The same logic as before, but designed to be wrapped by `synchronized`.
 */
async function appendNumberToFile(num: number): Promise<void> {
  return synchronized.execute(async () => {
    try {
      await fs.promises.access(FILE_PATH);
      console.log(`[Run ${num}] File exists. Appending '${'\\n'}${num}'.`);
      await fs.promises.appendFile(FILE_PATH, `\n${num}`);
    } catch (error) {
      console.log(`[Run ${num}] File does NOT exist. Creating with '${num}'.`);
      await fs.promises.writeFile(FILE_PATH, String(num));
    }
  });
}

async function main() {
  // Ensure the file doesn't exist before starting
  await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

  console.log('Starting 5 concurrent file operations WITH synchronized...');

  const tasks = [];
  for (let i = 1; i <= 5; i++) {
    tasks.push(appendNumberToFile(i));
  }

  // Run all tasks concurrently to simulate simultaneous requests.
  await Promise.all(tasks);

  const finalContent = await fs.promises.readFile(FILE_PATH, 'utf-8');
  console.log('\n--- Final File Content (with synchronized) ---');
  console.log(finalContent);
  console.log('--------------------------------------');
}

main();
```

**Correct and Expected Output:**

Even though the tasks are initiated concurrently, `synchronized` ensures they execute one by one. The first task creates the file, and all subsequent tasks correctly identify that it exists and append to it.

```
// Console Log
Starting 5 concurrent file operations WITH synchronized...
[Run 1] File does NOT exist. Creating with '1'.
[Run 2] File exists. Appending '\n2'.
[Run 3] File exists. Appending '\n3'.
[Run 4] File exists. Appending '\n4'.
[Run 5] File exists. Appending '\n5'.

--- Final File Content (with synchronized) ---
1
2
3
4
5
--------------------------------------
```

## 📚 API Reference

##### `new Synchronized()`

Creates a new instance of the `Synchronized` class. Each instance maintains its own independent execution queue.

##### `execute<T>(asyncFunction: () => Promise<T>): Promise<T>`

Wraps and executes an asynchronous function, ensuring mutual exclusion.

* `asyncFunction`: A function that returns a `Promise`. This is the "critical section" of your code that needs to be protected from concurrent execution.
* Returns: A `Promise<T>` that resolves or rejects with the result of the `asyncFunction`.

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](https://opensource.org/licenses/MIT) file for details.
