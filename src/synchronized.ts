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
export class Synchronized {

  private queue: (() => Promise<any>)[];
  private isRunning: boolean;

  constructor() {
    this.queue = [];
    this.isRunning = false;
  }

  /**
   * 排他制御が必要な処理を実行する
   *
   * @param {() => Promise<T>} asyncFunction
   * @returns {Promise<T>}
   */
  public async execute<T>(asyncFunction: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await asyncFunction();
          resolve(result);
        } catch (error) {
          reject(error);
        }
        this.processQueue();
      });
      if (!this.isRunning) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.queue.length && (this.isRunning = true) != null) {
      const fn = this.queue.shift();
      if (fn) {
        await fn();
      }
    } else {
      this.isRunning = false;
    }
  }
}
