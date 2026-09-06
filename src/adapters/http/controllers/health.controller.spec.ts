import { HealthController } from './health.controller';
import { PostgresPool } from '@infra/database/postgres.pool';
import { RabbitMQConnection } from '@infra/messaging/rabbitmq.connection';
import { FastifyReply, FastifyRequest } from 'fastify';

describe('HealthController', () => {
  let pool: jest.Mocked<Partial<PostgresPool>>;
  let rmq: jest.Mocked<Partial<RabbitMQConnection>>;
  let controller: HealthController;
  let mockReply: {
    status: jest.Mock;
    send: jest.Mock;
  };

  beforeEach(() => {
    pool = {
      isHealthy: jest.fn(),
    };
    rmq = {
      isHealthy: jest.fn(),
    };
    controller = new HealthController(
      pool as unknown as PostgresPool,
      rmq as unknown as RabbitMQConnection
    );

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('deve retornar 200 UP quando postgres e rabbitmq estiverem saudáveis', async () => {
    (pool.isHealthy as jest.Mock).mockResolvedValueOnce(true);
    (rmq.isHealthy as jest.Mock).mockReturnValueOnce(true);

    await controller.getHealth({} as FastifyRequest, mockReply as unknown as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(200);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'UP',
        services: {
          database: 'UP',
          rabbitmq: 'UP',
        },
      })
    );
  });

  it('deve retornar 503 DOWN quando postgres estiver fora', async () => {
    (pool.isHealthy as jest.Mock).mockResolvedValueOnce(false);
    (rmq.isHealthy as jest.Mock).mockReturnValueOnce(true);

    await controller.getHealth({} as FastifyRequest, mockReply as unknown as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(503);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DOWN',
        services: {
          database: 'DOWN',
          rabbitmq: 'UP',
        },
      })
    );
  });

  it('deve retornar 503 DOWN quando rabbitmq estiver fora', async () => {
    (pool.isHealthy as jest.Mock).mockResolvedValueOnce(true);
    (rmq.isHealthy as jest.Mock).mockReturnValueOnce(false);

    await controller.getHealth({} as FastifyRequest, mockReply as unknown as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(503);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DOWN',
        services: {
          database: 'UP',
          rabbitmq: 'DOWN',
        },
      })
    );
  });
});
