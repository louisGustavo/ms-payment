import { PostgresPool } from './postgres.pool';
import { Pool } from 'pg';

jest.mock('pg');

describe('PostgresPool', () => {
  let mockPoolInstance: {
    connect: jest.Mock;
    query: jest.Mock;
    end: jest.Mock;
    on: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolInstance = {
      connect: jest.fn().mockResolvedValue({} as any),
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
    (Pool as unknown as jest.Mock).mockImplementation(() => mockPoolInstance);
  });

  afterEach(async () => {
    const pool = PostgresPool.getInstance();
    await pool.close();
  });

  it('deve retornar a mesma instância singleton', () => {
    const instance1 = PostgresPool.getInstance();
    const instance2 = PostgresPool.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('deve executar connect() delegando para o pool interno', async () => {
    const pool = PostgresPool.getInstance();
    await pool.connect();
    expect(mockPoolInstance.connect).toHaveBeenCalled();
  });

  it('deve executar query() delegando para o pool interno', async () => {
    const pool = PostgresPool.getInstance();
    await pool.query('SELECT NOW()');
    expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT NOW()', undefined);
  });

  it('deve retornar isHealthy true quando SELECT 1 responder 1 linha', async () => {
    const pool = PostgresPool.getInstance();
    const healthy = await pool.isHealthy();
    expect(healthy).toBe(true);
  });

  it('deve retornar isHealthy false quando query falhar', async () => {
    const pool = PostgresPool.getInstance();
    mockPoolInstance.query.mockRejectedValueOnce(new Error('DB unreachable'));
    const healthy = await pool.isHealthy();
    expect(healthy).toBe(false);
  });

  it('deve encerrar o pool com close()', async () => {
    const pool = PostgresPool.getInstance();
    await pool.close();
    expect(mockPoolInstance.end).toHaveBeenCalled();
  });

  it('deve expor o pool bruto através de getRawPool()', () => {
    const pool = PostgresPool.getInstance();
    expect(pool.getRawPool()).toBeDefined();
  });
});
