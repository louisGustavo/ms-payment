import { randomUUID } from 'node:crypto';
import Redis, { RedisOptions } from 'ioredis';
import { DistributedLockService } from '@application/ports/distributed-lock.service';

/**
 * Script Lua executado atomicamente no Redis para liberação segura do lock.
 * Avalia se o valor atualmente armazenado na chave é idêntico ao token fornecido.
 * Apenas deleta a chave se a posse for confirmada, prevenindo que um processo
 * cujo TTL expirou delete o lock adquirido subsequentemente por outro processo.
 */
const RELEASE_LOCK_LUA_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export class RedisDistributedLockService implements DistributedLockService {
  private readonly redis: Redis;

  /**
   * Inicializa o serviço de lock distribuído.
   * @param redisOrOptions Instância pré-existente de Redis (útil para testes/injeção) ou opções de configuração de conexão.
   */
  constructor(redisOrOptions?: Redis | RedisOptions) {
    if (redisOrOptions && typeof (redisOrOptions as any).set === 'function') {
      this.redis = redisOrOptions as Redis;
    } else {
      this.redis = new Redis((redisOrOptions as RedisOptions) ?? {});
    }

    this.redis.on('error', (err) => {
      console.error('[RedisDistributedLockService] Erro na conexão com o Redis:', err);
    });
  }

  /**
   * Tenta adquirir o lock exclusivo através do comando atômico SET ... NX PX ttlMs.
   *
   * @param resource Identificador do recurso a ser bloqueado (ex: lock:payment:order:<orderId>)
   * @param ttlMs Tempo de vida do lock em milissegundos
   * @returns O token identificador da posse do lock ou null caso já esteja retido por outra instância.
   */
  public async acquire(resource: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();

    try {
      // SET resource token PX ttlMs NX: define a chave apenas se ela NÃO existir (NX) com expiração em ms (PX)
      const result = await this.redis.set(resource, token, 'PX', ttlMs, 'NX');

      if (result === 'OK') {
        return token;
      }

      return null;
    } catch (err) {
      console.error(`[RedisDistributedLockService] Erro ao tentar adquirir lock para o recurso '${resource}':`, err);
      throw err;
    }
  }

  /**
   * Libera o lock atrelado ao recurso e valida atomicamente se o token confere com o detentor.
   *
   * @param resource Identificador do recurso bloqueado
   * @param token Token recebido durante a aquisição do lock
   * @returns true se o lock foi liberado com sucesso, false caso contrário (expirado ou token diferente).
   */
  public async release(resource: string, token: string): Promise<boolean> {
    try {
      const result = await this.redis.eval(RELEASE_LOCK_LUA_SCRIPT, 1, resource, token);
      return result === 1;
    } catch (err) {
      console.error(`[RedisDistributedLockService] Erro ao liberar lock para o recurso '${resource}':`, err);
      return false;
    }
  }

  /**
   * Encerra a conexão com o Redis (usado durante Graceful Shutdown).
   */
  public async close(): Promise<void> {
    try {
      if (this.redis.status === 'ready' || this.redis.status === 'connect') {
        await this.redis.quit();
      } else {
        this.redis.disconnect();
      }
    } catch (err) {
      console.error('[RedisDistributedLockService] Erro ao fechar conexão com o Redis:', err);
    }
  }

  /**
   * Retorna o cliente Redis subjacente (para fins de verificação de integridade/healthcheck).
   */
  public getClient(): Redis {
    return this.redis;
  }
}
