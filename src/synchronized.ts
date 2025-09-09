import { AsyncLocalStorage } from 'async_hooks';

/**
 * 排他制御処理クラス
 * Javaのsynchronizedブロックと同等の機能を提供する
 *
 * 例
 * const synchronized = new Synchronized();
 * await synchronized.execute(() => {
 *   ・・・何かの処理
 * });
 *
 * execute内部の処理が行われている間、他の処理はexecute内部の処理がブロックされ、前の処理が完了するまで待機する
 */

export interface Lock {
  // ダミーのプロパティ
  // WeakMapで実装しているため、string型などを受け付けると予期しない動作になるため
  // Lockインターフェースを持つオブジェクトしかロックオブジェクトとして受け付けないようにする
  _lockBrand: symbol;
}

export class ReentrantLock implements Lock {
  public readonly _lockBrand: symbol = Symbol('SynchronizedLock');
}

interface LockState {
  lockQueue: (() => Promise<void>)[];
  isRunning: boolean;
  owner?: any;
  depth: number; // 再入回数
}

export class Synchronized {

  private lock?: Lock;
  private lockMap: WeakMap<Lock, LockState> = new WeakMap();
  private static context = new AsyncLocalStorage<{ id: symbol }>();

  constructor(lock?: Lock) {
    this.lock = lock;
  }

  /**
   * 排他制御が必要な処理を実行する
   * * 第二引数で渡したロックオブジェクトがあれば最優先
   * * 第二引数のロックオブジェクトが渡されない場合、コンストラクタで渡したロックオブジェクトがあればそのロックオブジェクトを利用する
   * * コンストラクタでも第二引数でもロックオブジェクトを渡さない場合はロックオブジェクトを利用しない同期を行う
   *
   * @param {() => Promise<T>} asyncFunction
   * @param {Lock} [lock] 同じロックオブジェクトを渡すと異なる処理でも同期される
   * @returns {Promise<T>}
   */
  public async execute<T>(asyncFunction: () => Promise<T>, lock?: Lock): Promise<T> {
    let availableLock = lock || this.lock;
    if (!availableLock) {
      availableLock = (this as unknown) as Lock;
    }
      return this.enqueue(asyncFunction, availableLock);
  }

  /**
   * キューに登録
   * デッドロックを回避するため、かならずロックオブジェクトを使用する
   *
   * @param {() => Promise<T>} asyncFunction
   * @param {Lock} lock
   * @returns {Promise<T>}
   */
  private async enqueue<T>(asyncFunction: () => Promise<T>, lock: Lock): Promise<T> {
    let store = Synchronized.context.getStore();
    if (!store) {
      store = { id: Symbol('context') };
      return Synchronized.context.run(store, () => this.enqueue(asyncFunction, lock));
    }

    return new Promise<T>(async (resolve, reject) => {
      let lockState = this.lockMap.get(lock);
      if (!lockState) {
        lockState = { lockQueue: [], isRunning: false, depth: 0 };
        this.lockMap.set(lock, lockState);
      }

      // 再入チェック
      if (lockState.isRunning && lockState.owner === store.id) {
        // 同じコンテキストの場合は即時実行
        lockState.depth++;
        (async () => {
          try {
            const result = await asyncFunction();
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            lockState.depth--;
            if (lockState.depth === 0) {
              lockState.owner = undefined;
              this.processQueue(lock);
            }
          }
        })();
        return;
      }

      // キューに関数を追加
      lockState.lockQueue.push(async () => {
        try {
          lockState.owner = store.id;
          lockState.depth = 1;
          const result = await asyncFunction();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          lockState.depth--;
          if (lockState.depth === 0) {
            lockState.owner = undefined;
            this.processQueue(lock);
          }
        }
      });
      if (!lockState.isRunning) {
        this.processQueue(lock);
      }
    });
  }

  private async processQueue(lock: Lock) {
    const lockState = this.lockMap.get(lock);
    if (!lockState) {
      return;
    }

    if (!lockState.lockQueue.length) {
      lockState.isRunning = false;
      return;
    }

    lockState.isRunning = true;
    const fn = lockState.lockQueue.shift();
    if (fn) {
      await fn();
    }
  }
}
