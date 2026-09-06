import dotenv from 'dotenv';

dotenv.config();

export interface Environment {
  readonly NODE_ENV: string;
  readonly PORT: number;
  readonly HOST: string;

  // PostgreSQL
  readonly DB_HOST: string;
  readonly DB_PORT: number;
  readonly DB_USER: string;
  readonly DB_PASSWORD: string;
  readonly DB_NAME: string;
  readonly DB_POOL_MAX: number;

  // RabbitMQ
  readonly RABBITMQ_HOST: string;
  readonly RABBITMQ_PORT: number;
  readonly RABBITMQ_USER: string;
  readonly RABBITMQ_PASSWORD: string;

  // Topologia de Mensageria
  readonly RABBITMQ_ORDER_EVENTS_EXCHANGE: string;
  readonly RABBITMQ_ORDER_CREATED_ROUTING_KEY: string;
  readonly RABBITMQ_PAYMENT_QUEUE: string;
  readonly RABBITMQ_DLX: string;
  readonly RABBITMQ_DLQ: string;
  readonly RABBITMQ_PAYMENT_EVENTS_EXCHANGE: string;

  // Latência do Gateway Mock
  readonly GATEWAY_MIN_DELAY_MS: number;
  readonly GATEWAY_MAX_DELAY_MS: number;
}

export const env: Environment = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3001', 10),
  HOST: process.env['HOST'] || '0.0.0.0',

  DB_HOST: process.env['DB_HOST'] || 'localhost',
  DB_PORT: parseInt(process.env['DB_PORT'] || '5432', 10),
  DB_USER: process.env['DB_USER'] || 'postgres',
  DB_PASSWORD: process.env['DB_PASSWORD'] || 'postgres',
  DB_NAME: process.env['DB_NAME'] || 'payment_db',
  DB_POOL_MAX: parseInt(process.env['DB_POOL_MAX'] || '10', 10),

  RABBITMQ_HOST: process.env['RABBITMQ_HOST'] || 'localhost',
  RABBITMQ_PORT: parseInt(process.env['RABBITMQ_PORT'] || '5672', 10),
  RABBITMQ_USER: process.env['RABBITMQ_USER'] || 'guest',
  RABBITMQ_PASSWORD: process.env['RABBITMQ_PASSWORD'] || 'guest',

  RABBITMQ_ORDER_EVENTS_EXCHANGE: process.env['RABBITMQ_ORDER_EVENTS_EXCHANGE'] || 'order.events',
  RABBITMQ_ORDER_CREATED_ROUTING_KEY: process.env['RABBITMQ_ORDER_CREATED_ROUTING_KEY'] || 'order.created',
  RABBITMQ_PAYMENT_QUEUE: process.env['RABBITMQ_PAYMENT_QUEUE'] || 'payment-service.order-created',
  RABBITMQ_DLX: process.env['RABBITMQ_DLX'] || 'ecommerce.dlx',
  RABBITMQ_DLQ: process.env['RABBITMQ_DLQ'] || 'payment-service.order-created.dlq',
  RABBITMQ_PAYMENT_EVENTS_EXCHANGE: process.env['RABBITMQ_PAYMENT_EVENTS_EXCHANGE'] || 'payment.events',

  GATEWAY_MIN_DELAY_MS: parseInt(process.env['GATEWAY_MIN_DELAY_MS'] || '300', 10),
  GATEWAY_MAX_DELAY_MS: parseInt(process.env['GATEWAY_MAX_DELAY_MS'] || '1800', 10),
};
