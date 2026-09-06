import {
  DomainValidationError,
  DomainStateViolationError,
  PaymentAlreadyFinalizedError,
} from './domain.error';

describe('Domain Errors', () => {
  it('deve instanciar DomainValidationError', () => {
    const error = new DomainValidationError('Validação falhou');
    expect(error.code).toBe('DOMAIN_VALIDATION_ERROR');
    expect(error.message).toBe('Validação falhou');
  });

  it('deve instanciar DomainStateViolationError', () => {
    const error = new DomainStateViolationError('Estado inválido');
    expect(error.code).toBe('DOMAIN_STATE_VIOLATION');
    expect(error.message).toBe('Estado inválido');
  });

  it('deve instanciar PaymentAlreadyFinalizedError', () => {
    const error = new PaymentAlreadyFinalizedError('pay-1', 'SUCCEEDED');
    expect(error.code).toBe('PAYMENT_ALREADY_FINALIZED');
    expect(error.message).toContain('pay-1');
  });
});
