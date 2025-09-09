import { ReentrantLock, Synchronized } from '@/synchronized';
import fs from 'fs';

const waitFunction = (type: 'resolve' | 'reject', msec: number) => {
  console.log('waitFunction start', type, msec);
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
      console.log('waitFunction end', type, msec);
    }, msec)
  );
};

describe('@/synchronized.ts', () => {
  describe('execute', () => {
    it('execute.001.01', async () => {
      const FILE_PATH = 'output-without-sync.log';

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

      // Ensure the file doesn't exist before starting
      await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

      console.log('Starting 5 concurrent file operations WITHOUT synchronization...');

      const tasks = [];
      for (let i = 1; i <= 5; i++) {
        tasks.push(appendNumberToFile(i));
      }

      // Run all tasks concurrently to simulate simultaneous requests.
      await Promise.all(tasks);

      const finalContent = await fs.promises.readFile(FILE_PATH, 'utf-8');
      console.log('\n--- Final File Content (without sync) ---');
      console.log(finalContent);
      console.log('-----------------------------------------');

      // Clearing
      await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

      expect(finalContent).not.toBe('1\n2\n3\n4\n5');
    });
    it('execute.001.02', async () => {
      const FILE_PATH = 'output-with-sync.log';
      const synchronized = new Synchronized();

      /**
       * This function is now internally synchronized.
       * Callers can use it concurrently without worrying about race conditions.
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

      // Ensure the file doesn't exist before starting
      await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

      console.log('Starting 5 concurrent file operations WITH synchronization...');

      const tasks = [];
      for (let i = 1; i <= 5; i++) {
        tasks.push(appendNumberToFile(i));
      }

      // Run all tasks concurrently to simulate simultaneous requests.
      await Promise.all(tasks);

      const finalContent = await fs.promises.readFile(FILE_PATH, 'utf-8');
      console.log('\n--- Final File Content (with sync) ---');
      console.log(finalContent);
      console.log('--------------------------------------');

      // Clearing
      await fs.promises.unlink(FILE_PATH).catch(() => { /* Ignore error if file doesn't exist */ });

      expect(finalContent).toBe('1\n2\n3\n4\n5');
    });

    it('execute.002.01', async () => {
      // ロックオブジェクトをコンストラクタに渡すケース
      let isRunning = false;
      let currentIndex = 0;

      const lock = new ReentrantLock();
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

      const lock = new ReentrantLock();
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
      // ロックオブジェクトを渡した場合にexecuteのネストでデッドロックにならない確認
      const lock = new ReentrantLock();
      const synchronized = new Synchronized(lock);
      let result;
      await synchronized.execute(async () => {
        await synchronized.execute(async () => {
          await waitFunction('resolve', 10);
          result = true;
        });
      });
      expect(result).toBe(true);
    });

    it('execute.003.02', async () => {
      // ロックオブジェクトを渡さない場合にexecuteのネストでデッドロックにならない確認
      const synchronized = new Synchronized();
      let result;
      await synchronized.execute(async () => {
        await synchronized.execute(async () => {
          await waitFunction('resolve', 10);
          result = true;
        });
      });
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
