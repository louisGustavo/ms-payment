export abstract class ApplicationError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'APPLICATION_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ResourceNotFoundError extends ApplicationError {
  constructor(identifier: string) {
    super(`Recurso com identificador '${identifier}' não foi encontrado.`, 'RESOURCE_NOT_FOUND');
  }
}

export class ExternalIntegrationError extends ApplicationError {
  constructor(service: string, details: string, public readonly originalError?: unknown) {
    super(`Falha na integração com serviço externo '${service}': ${details}`, 'EXTERNAL_INTEGRATION_ERROR');
  }
}

export class PaymentAlreadyProcessedError extends ApplicationError {
  constructor(orderId: string) {
    super(`O pedido '${orderId}' já possui um pagamento processado previamente.`, 'PAYMENT_ALREADY_PROCESSED');
  }
}
