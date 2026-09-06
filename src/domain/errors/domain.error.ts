export abstract class DomainError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class DomainValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN_VALIDATION_ERROR');
  }
}

export class DomainStateViolationError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN_STATE_VIOLATION');
  }
}

export class PaymentAlreadyFinalizedError extends DomainError {
  constructor(paymentId: string, currentStatus: string) {
    super(
      `O pagamento '${paymentId}' já se encontra finalizado no estado '${currentStatus}' e não pode sofrer nova transição.`,
      'PAYMENT_ALREADY_FINALIZED'
    );
  }
}
