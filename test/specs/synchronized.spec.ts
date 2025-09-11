import { Synchronized, SimpleLock } from '@/synchronized';
import fs from 'fs';

const waitFunction = (type: 'resolve' | 'reject', msec: number) => {
  return new Promise<number>((resolve, reject) =>
    setTimeout(() => {
      switch (type) {
        case 'resolve':
          resolve(msec);
          break;
        case 'reject':
          reject(msec);
        break;
          default:
      }
    }, msec)
  );
};

// ファイルがあれば '\n + 数値' を書き込み、ファイルがなければ数値のみ書き込みする関数
const appendNumberToFile = async (filepath: string, num: number): Promise<void> => {
  try {
    await fs.promises.access(filepath);
    await fs.promises.appendFile(filepath, `\n${num}`);
  } catch (error) {
    await fs.promises.writeFile(filepath, String(num));
  }
}

describe('@/synchronized.ts', () => {
  describe('execute', () => {
    it('execute.001.01', async () => {
      // Synchronizedを使わない場合
      // 1, 2, 3, 4, 5 と順番にファイルに書き込み処理を行う
      // ファイルが存在しない場合は自身の数値のみ書き込み
      // ファイルが存在する場合は'\n'に続けて自身の数値を書き込み
      // 結果として 1\n2\n3\n4\n5 となることを期待するが、Synchronizedを使わないと期待通りにならないことを確認
      const FILE_PATH = 'output-without-sync.log';

      try {
        await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

        const tasks = [];
        for (let i = 1; i <= 5; i++) {
          tasks.push(appendNumberToFile(FILE_PATH, i));
        }

        // 追加した関数を非同期実行
        await Promise.all(tasks);

        const finalContent = await fs.promises.readFile(FILE_PATH, 'utf-8');
        expect(finalContent).not.toBe('1\n2\n3\n4\n5');
      } finally {
        await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });
      }
    });
    it('execute.001.02', async () => {
      // Synchronizedを使う場合
      // 1, 2, 3, 4, 5 と順番にファイルに書き込み処理を行う
      // ファイルが存在しない場合は自身の数値のみ書き込み
      // ファイルが存在する場合は'\n'に続けて自身の数値を書き込み
      // 結果として 1\n2\n3\n4\n5 となることを期待するが、Synchronizedを使うことで期待通りになることを確認
      const FILE_PATH = 'output-with-sync.log';
      const synchronized = new Synchronized();

      await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

      const tasks = [];
      for (let i = 1; i <= 5; i++) {
        // synchronized.executeでラップ
        tasks.push(synchronized.execute(async () => appendNumberToFile(FILE_PATH, i)));
      }

      // 追加した関数を非同期実行
      await Promise.all(tasks);

      const finalContent = await fs.promises.readFile(FILE_PATH, 'utf-8');

      await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

      expect(finalContent).toBe('1\n2\n3\n4\n5');
    });

    it('execute.002.01', async () => {
      // ロックオブジェクトをコンストラクタに渡すケース
      let isRunning = false;
      let currentIndex = 0;

      const lock = new SimpleLock();
      const synchronizedA = new Synchronized(lock);
      const synchronizedB = new Synchronized(lock);

      const functions = [...Array(100)].map((_, i) => async () => {
        const syncInstance = i % 2 === 0 ? synchronizedA : synchronizedB;
        await syncInstance.execute(async () => {
          // executeが実行されたとき、逐次実行のため必ずisRunningはfalseになっている
          expect(isRunning).toBe(false);
          // 順番が保証されていることの確認: 現在の処理インデックスがループで渡されたインデックスと同じ
          expect(currentIndex).toBe(i);
          try {
            isRunning = true;
            currentIndex++;
            await waitFunction('resolve', 10);
          } finally {
            isRunning = false;
          }
        });
      });
      await Promise.allSettled(functions.map(fn => fn()));
    });

    it('execute.002.02', async () => {
      // executeの引数としてロックオブジェクトを渡すケース
      let isRunning = false;
      let currentIndex = 0;

      const lock = new SimpleLock();
      const synchronizedA = new Synchronized();
      const synchronizedB = new Synchronized();

      const functions = [...Array(100)].map((_, i) => async () => {
        const syncInstance = i % 2 === 0 ? synchronizedA : synchronizedB;
        await syncInstance.execute(async () => {
          // executeが実行されたとき、逐次実行のため必ずisRunningはfalseになっている
          expect(isRunning).toBe(false);
          // 順番が保証されていることの確認: 現在の処理インデックスがループで渡されたインデックスと同じ
          expect(currentIndex).toBe(i);
          try {
            isRunning = true;
            currentIndex++;
            await waitFunction('resolve', 10);
          } finally {
            isRunning = false;
          }
        }, lock);
      });
      await Promise.allSettled(functions.map(fn => fn()));
    });

    it('execute.003.01', async () => {
      // ロックオブジェクトを指定せずにexecuteのネストをするとデッドロックになる確認
      // async_hooksパッケージが提供する'AsyncLocalStorage'はNodeJSでのみ動作がサポートされており
      // ブラウザでは動作しないため、このライブラリなしでは非同期のコンテキストを追跡することができない
      // そのため、同じロックオブジェクトでネストの呼び出しを行うとデッドロックになる
      const synchronized = new Synchronized();
      let result;
      const fn = jest.fn(async () => {
        await waitFunction('resolve', 10);
        result = true;
      });

      try {
        synchronized.execute(async () => {
          await synchronized.execute(fn);
        });
      } catch (error: any) {
        fail(`Jest detected error: ${error.message}`);
      }
      expect(result).toBeUndefined();
    }, 100); // デッドロックのテストなので100msでタイムアウトさせる

    it('execute.003.02', async () => {
      // 同一ロックオブジェクトを渡した場合にexecuteのネストをするとデッドロックになる確認
      const synchronized = new Synchronized(new SimpleLock());
      let result;
      const fn = jest.fn(async () => {
        await waitFunction('resolve', 10);
        result = true;
      });

      try {
        synchronized.execute(async () => {
          await synchronized.execute(fn);
        });
      } catch (error: any) {
        fail(`Jest detected error: ${error.message}`);
      }
      expect(result).toBeUndefined();
    }, 100); // デッドロックのテストなので100msでタイムアウトさせる

    it('execute.003.03', async () => {
      // executeに異なるロックオブジェクトを渡した場合にexecuteのネストでデッドロックにならない確認
      const lock1 = new SimpleLock();
      const lock2 = new SimpleLock();
      const synchronized = new Synchronized();
      let result;
      await synchronized.execute(async () => {
        await synchronized.execute(async () => {
          await waitFunction('resolve', 10);
          result = true;
        }, lock2);
      }, lock1);
      expect(result).toBe(true);
    });

    it('execute.099.01', async () => {
      const synchronized = new Synchronized();
      const promise = synchronized.execute(async () => {
        throw new Error('synchronized threw error');
      });
      await expect(promise).rejects.toThrow('synchronized threw error');
    });
  });
});
