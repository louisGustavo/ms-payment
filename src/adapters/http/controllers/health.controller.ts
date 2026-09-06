import { FastifyReply, FastifyRequest } from 'fastify';
import { PostgresPool } from '@infra/database/postgres.pool';
import { RabbitMQConnection } from '@infra/messaging/rabbitmq.connection';

export class HealthController {
  constructor(
    private readonly pool: PostgresPool = PostgresPool.getInstance(),
    private readonly rmq: RabbitMQConnection = RabbitMQConnection.getInstance()
  ) {}

  public async getHealth(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const isDbHealthy = await this.pool.isHealthy();
    const isRmqHealthy = this.rmq.isHealthy();

    const isHealthy = isDbHealthy && isRmqHealthy;
    const statusCode = isHealthy ? 200 : 503;

    await reply.status(statusCode).send({
      status: isHealthy ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      services: {
        database: isDbHealthy ? 'UP' : 'DOWN',
        rabbitmq: isRmqHealthy ? 'UP' : 'DOWN',
      },
    });
  }
}
