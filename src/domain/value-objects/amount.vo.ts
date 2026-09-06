import { DomainValidationError } from '../errors/domain.error';

export class Amount {
  private readonly _value: number;

  constructor(value: number) {
    if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
      throw new DomainValidationError('O valor do pagamento deve ser um número válido.');
    }

    if (value <= 0) {
      throw new DomainValidationError('O valor do pagamento deve ser estritamente positivo (> 0).');
    }

    // Normaliza para 2 casas decimais para evitar imprecisões de ponto flutuante
    this._value = Math.round(value * 100) / 100;
    Object.freeze(this);
  }

  public get value(): number {
    return this._value;
  }

  public equals(other: Amount): boolean {
    return this._value === other.value;
  }
}
