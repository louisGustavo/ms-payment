import {
  ExternalIntegrationError,
  PaymentAlreadyProcessedError,
  ResourceNotFoundError,
} from './application.error';

describe('Application Errors', () => {
  it('deve instanciar ResourceNotFoundError com mensagem e código corretos', () => {
    const error = new ResourceNotFoundError('id-123');
    expect(error.message).toContain('id-123');
    expect(error.code).toBe('RESOURCE_NOT_FOUND');
    expect(error.name).toBe('ResourceNotFoundError');
  });

  it('deve instanciar ExternalIntegrationError com serviço, detalhes e erro original', () => {
    const original = new Error('Network timeout');
    const error = new ExternalIntegrationError('GatewayX', 'Tempo limite esgotado', original);
    expect(error.message).toContain('GatewayX');
    expect(error.message).toContain('Tempo limite esgotado');
    expect(error.code).toBe('EXTERNAL_INTEGRATION_ERROR');
    expect(error.originalError).toBe(original);
  });

  it('deve instanciar PaymentAlreadyProcessedError', () => {
    const error = new PaymentAlreadyProcessedError('order-999');
    expect(error.message).toContain('order-999');
    expect(error.code).toBe('PAYMENT_ALREADY_PROCESSED');
  });
});
