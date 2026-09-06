import { RabbitMQConnection } from './rabbitmq.connection';
import amqplib from 'amqplib';

jest.mock('amqplib');

describe('RabbitMQConnection', () => {
  let mockConnection: any;
  let mockChannel: any;
  let connListeners: Record<string, Function>;
  let chanListeners: Record<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();
    connListeners = {};
    chanListeners = {};

    mockChannel = {
      on: jest.fn((event: string, cb: Function) => {
        chanListeners[event] = cb;
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      on: jest.fn((event: string, cb: Function) => {
        connListeners[event] = cb;
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (amqplib.connect as jest.Mock).mockResolvedValue(mockConnection);
  });

  afterEach(async () => {
    const conn = RabbitMQConnection.getInstance();
    await conn.close();
  });

  it('deve conectar com sucesso e retornar o canal', async () => {
    const rmq = RabbitMQConnection.getInstance();
    const channel = await rmq.connect();

    expect(amqplib.connect).toHaveBeenCalled();
    expect(mockConnection.createChannel).toHaveBeenCalled();
    expect(channel).toBe(mockChannel);
    expect(rmq.isHealthy()).toBe(true);
  });

  it('deve reutilizar o canal já conectado', async () => {
    const rmq = RabbitMQConnection.getInstance();
    await rmq.connect();
    const channel2 = await rmq.connect();

    expect(amqplib.connect).toHaveBeenCalledTimes(1);
    expect(channel2).toBe(mockChannel);
  });

  it('deve lidar com chamadas concorrentes simultâneas a connect()', async () => {
    const rmq = RabbitMQConnection.getInstance();
    const [ch1, ch2] = await Promise.all([rmq.connect(), rmq.connect()]);

    expect(ch1).toBe(mockChannel);
    expect(ch2).toBe(mockChannel);
  });

  it('deve lidar com callbacks de erro e fechamento da conexão e canal', async () => {
    const rmq = RabbitMQConnection.getInstance();
    await rmq.connect();

    // Dispara listeners registrados
    connListeners['error']?.(new Error('Connection error'));
    chanListeners['error']?.(new Error('Channel error'));
    chanListeners['close']?.();
    connListeners['close']?.();

    expect(rmq.isHealthy()).toBe(false);
  });

  it('deve lançar erro em getChannel se não estiver conectado', async () => {
    const rmq = RabbitMQConnection.getInstance();
    await rmq.close();
    expect(() => rmq.getChannel()).toThrow('Canal RabbitMQ não foi inicializado');
  });

  it('deve fechar conexão e canal no close() e tratar erros silenciosamente', async () => {
    const rmq = RabbitMQConnection.getInstance();
    await rmq.connect();
    mockChannel.close.mockRejectedValueOnce(new Error('Close error'));

    await rmq.close();

    expect(rmq.isHealthy()).toBe(false);
  });
});
