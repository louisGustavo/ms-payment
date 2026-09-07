import Redis from 'ioredis';
import { RedisDistributedLockService } from './redis-distributed-lock.service';

jest.mock('ioredis');

describe('RedisDistributedLockService', () => {
  let mockRedis: jest.Mocked<Redis>;
  let lockService: RedisDistributedLockService;

  beforeEach(() => {
    mockRedis = {
      set: jest.fn(),
      eval: jest.fn(),
      quit: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      status: 'ready',
    } as unknown as jest.Mocked<Redis>;

    lockService = new RedisDistributedLockService(mockRedis);
  });

  describe('Instanciação', () => {
    it('deve registrar handler de erro no cliente Redis e registrar logs quando disparado', () => {
      let errorHandler: ((err: Error) => void) | undefined;
      (mockRedis.on as jest.Mock).mockImplementation((event, handler) => {
        if (event === 'error') errorHandler = handler;
        return mockRedis;
      });

      new RedisDistributedLockService(mockRedis);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      errorHandler?.(new Error('Connection dropped'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RedisDistributedLockService] Erro na conexão com o Redis:'),
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('deve instanciar cliente interno se nenhum for fornecido', () => {
      new RedisDistributedLockService({ host: 'localhost', port: 6379 });
      expect(Redis).toHaveBeenCalledWith({ host: 'localhost', port: 6379 });
    });

    it('deve expor o cliente subjacente através de getClient()', () => {
      expect(lockService.getClient()).toBe(mockRedis);
    });
  });

  describe('acquire', () => {
    it('deve adquirir o lock e retornar o token quando Redis responder OK', async () => {
      (mockRedis.set as jest.Mock).mockResolvedValue('OK');

      const token = await lockService.acquire('lock:test:order:123', 5000);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:test:order:123',
        token,
        'PX',
        5000,
        'NX'
      );
    });

    it('deve retornar null se o lock já estiver ocupado (Redis responder null)', async () => {
      (mockRedis.set as jest.Mock).mockResolvedValue(null);

      const token = await lockService.acquire('lock:test:order:123', 5000);

      expect(token).toBeNull();
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('deve propagar o erro se o Redis lançar uma exceção', async () => {
      const redisError = new Error('Connection refused');
      (mockRedis.set as jest.Mock).mockRejectedValue(redisError);

      await expect(lockService.acquire('lock:test:order:123', 5000)).rejects.toThrow('Connection refused');
    });
  });

  describe('release', () => {
    it('deve retornar true quando o script Lua retornar 1 (lock liberado pelo detentor)', async () => {
      (mockRedis.eval as jest.Mock).mockResolvedValue(1);

      const released = await lockService.release('lock:test:order:123', 'mock-token-uuid');

      expect(released).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("del", KEYS[1])'),
        1,
        'lock:test:order:123',
        'mock-token-uuid'
      );
    });

    it('deve retornar false quando o script Lua retornar 0 (token inválido ou expirado)', async () => {
      (mockRedis.eval as jest.Mock).mockResolvedValue(0);

      const released = await lockService.release('lock:test:order:123', 'wrong-token');

      expect(released).toBe(false);
    });

    it('deve retornar false se o comando eval lançar erro', async () => {
      (mockRedis.eval as jest.Mock).mockRejectedValue(new Error('Redis timeout'));

      const released = await lockService.release('lock:test:order:123', 'mock-token');

      expect(released).toBe(false);
    });
  });

  describe('close', () => {
    it('deve chamar quit() quando status for ready', async () => {
      mockRedis.status = 'ready';
      (mockRedis.quit as jest.Mock).mockResolvedValue('OK');

      await lockService.close();

      expect(mockRedis.quit).toHaveBeenCalled();
      expect(mockRedis.disconnect).not.toHaveBeenCalled();
    });

    it('deve chamar quit() quando status for connect', async () => {
      mockRedis.status = 'connect';
      (mockRedis.quit as jest.Mock).mockResolvedValue('OK');

      await lockService.close();

      expect(mockRedis.quit).toHaveBeenCalled();
      expect(mockRedis.disconnect).not.toHaveBeenCalled();
    });

    it('deve chamar disconnect() quando status não for ready/connect', async () => {
      mockRedis.status = 'close';

      await lockService.close();

      expect(mockRedis.disconnect).toHaveBeenCalled();
      expect(mockRedis.quit).not.toHaveBeenCalled();
    });

    it('deve tratar exceção silenciosamente se quit() falhar', async () => {
      mockRedis.status = 'ready';
      (mockRedis.quit as jest.Mock).mockRejectedValue(new Error('Error quitting'));

      await expect(lockService.close()).resolves.toBeUndefined();
    });
  });
});
