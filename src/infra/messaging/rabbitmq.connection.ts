import amqplib, { Channel, ChannelModel } from 'amqplib';
import { env } from '../config/env';

export class RabbitMQConnection {
  private static instance: RabbitMQConnection | null = null;
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private isConnecting = false;

  private constructor() {}

  public static getInstance(): RabbitMQConnection {
    if (!RabbitMQConnection.instance) {
      RabbitMQConnection.instance = new RabbitMQConnection();
    }
    return RabbitMQConnection.instance;
  }

  public async connect(): Promise<Channel> {
    if (this.channel) {
      return this.channel;
    }

    if (this.isConnecting) {
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (this.channel) return this.channel;
    }

    this.isConnecting = true;

    try {
      const url = `amqp://${env.RABBITMQ_USER}:${env.RABBITMQ_PASSWORD}@${env.RABBITMQ_HOST}:${env.RABBITMQ_PORT}`;
      const conn = await amqplib.connect(url);
      const ch = await conn.createChannel();

      conn.on('error', (err: unknown) => {
        console.error('[RabbitMQConnection] Erro na conexão RabbitMQ:', err);
      });

      conn.on('close', () => {
        console.warn('[RabbitMQConnection] Conexão com RabbitMQ fechada.');
        this.connection = null;
        this.channel = null;
      });

      ch.on('error', (err: unknown) => {
        console.error('[RabbitMQConnection] Erro no canal RabbitMQ:', err);
      });

      ch.on('close', () => {
        console.warn('[RabbitMQConnection] Canal com RabbitMQ fechado.');
        this.channel = null;
      });

      this.connection = conn;
      this.channel = ch;

      return ch;
    } finally {
      this.isConnecting = false;
    }
  }

  public getChannel(): Channel {
    if (!this.channel) {
      throw new Error('Canal RabbitMQ não foi inicializado. Chame connect() primeiro.');
    }
    return this.channel;
  }

  public isHealthy(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  public async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (err) {
      console.error('[RabbitMQConnection] Erro ao fechar RabbitMQ:', err);
    } finally {
      this.channel = null;
      this.connection = null;
      RabbitMQConnection.instance = null;
    }
  }
}
