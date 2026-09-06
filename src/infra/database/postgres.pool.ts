import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

export class PostgresPool {
  private static instance: PostgresPool | null = null;
  private readonly pool: Pool;

  private constructor() {
    this.pool = new Pool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      console.error('[PostgresPool] Erro inesperado no cliente do pool idle:', err);
    });
  }

  public static getInstance(): PostgresPool {
    if (!PostgresPool.instance) {
      PostgresPool.instance = new PostgresPool();
    }
    return PostgresPool.instance;
  }

  public async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  public async query<R extends QueryResultRow = any, I extends any[] = any[]>(
    text: string,
    params?: I
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params);
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rowCount === 1;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
    PostgresPool.instance = null;
  }

  public getRawPool(): Pool {
    return this.pool;
  }
}
