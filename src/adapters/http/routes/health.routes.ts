import { FastifyInstance } from 'fastify';
import { HealthController } from '../controllers/health.controller';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  const controller = new HealthController();

  fastify.get(
    '/health',
    {
      schema: {
        description: 'Healthcheck do serviço e dependências (PostgreSQL, RabbitMQ)',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              services: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  rabbitmq: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              services: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  rabbitmq: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => controller.getHealth(request, reply)
  );
}
