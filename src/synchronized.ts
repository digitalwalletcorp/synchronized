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

export class SimpleLock implements Lock {
  public readonly _lockBrand: symbol = Symbol('SimpleLock');
}

interface LockState {
  queue: (() => Promise<void>)[];
  isRunning: boolean;
}

export class Synchronized {

  private lock?: Lock;
  private lockMap: WeakMap<Lock, LockState> = new WeakMap();

  constructor(lock?: Lock) {
    this.lock = lock;
  }

  /**
   * 排他制御が必要な処理を実行する
   *
   * * 第二引数で渡したロックオブジェクトがあれば最優先
   * * 第二引数のロックオブジェクトが渡されない場合、コンストラクタで渡したロックオブジェクトがあればそのロックオブジェクトを利用する
   * * コンストラクタでも第二引数でもロックオブジェクトを渡さない場合は自インスタンスをロックオブジェクトとして利用する
   *
   * @param {() => Promise<T>} asyncFunction
   * @param {Lock} [lock] 同じロックオブジェクトを渡すと同一ロックオブジェクト間で同期される。未指定の場合はすべて同期される。
   * @returns {Promise<T>}
   */
  public async execute<T>(asyncFunction: () => Promise<T>, lock?: Lock): Promise<T> {
    const actualLock = lock || this.lock || this as unknown as Lock;
    return this.enqueue(asyncFunction, actualLock);
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
    const lockState = this.getLockState(lock);
    return new Promise<T>((resolve, reject) => {
      lockState.queue.push(async () => {
        try {
          const result = await asyncFunction();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.processQueue(lock);
        }
      });
      if (!lockState.isRunning) {
        this.processQueue(lock);
      }
    });
  }

  private getLockState(lock: Lock): LockState {
    let lockState = this.lockMap.get(lock);
    if (!lockState) {
      lockState = {
        queue: [],
        isRunning: false
      };
      this.lockMap.set(lock, lockState);
    }
    return lockState;
  }

  private async processQueue(lock: Lock) {
    const lockState = this.lockMap.get(lock);
    if (!lockState) {
      return;
    }

    if (!lockState.queue.length) {
      lockState.isRunning = false;
      return;
    }

    lockState.isRunning = true;
    const fn = lockState.queue.shift();
    if (fn) {
      await fn();
    }
  }
}
