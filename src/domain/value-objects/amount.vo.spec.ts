import { Amount } from './amount.vo';
import { DomainValidationError } from '../errors/domain.error';

describe('Amount Value Object', () => {
  it('deve instanciar um Amount com sucesso para valor válido positivo', () => {
    // Arrange & Act
    const amount = new Amount(149.9);

    // Assert
    expect(amount.value).toBe(149.9);
  });

  it('deve arredondar o valor para duas casas decimais', () => {
    // Arrange & Act
    const amount = new Amount(149.905);

    // Assert
    expect(amount.value).toBe(149.91);
  });

  it('deve lançar DomainValidationError ao passar valor menor ou igual a zero', () => {
    // Arrange & Act & Assert
    expect(() => new Amount(0)).toThrow(DomainValidationError);
    expect(() => new Amount(-10)).toThrow('O valor do pagamento deve ser estritamente positivo (> 0).');
  });

  it('deve lançar DomainValidationError ao passar valor não numérico ou NaN', () => {
    // Arrange & Act & Assert
    expect(() => new Amount(NaN)).toThrow('O valor do pagamento deve ser um número válido.');
    expect(() => new Amount(Infinity)).toThrow('O valor do pagamento deve ser um número válido.');
    // @ts-expect-error teste com tipo inválido em tempo de execução
    expect(() => new Amount('100')).toThrow('O valor do pagamento deve ser um número válido.');
  });

  it('deve comparar a igualdade entre dois Amounts corretamente', () => {
    // Arrange
    const amount1 = new Amount(99.5);
    const amount2 = new Amount(99.5);
    const amount3 = new Amount(100.0);

    // Assert
    expect(amount1.equals(amount2)).toBe(true);
    expect(amount1.equals(amount3)).toBe(false);
  });

  it('deve ser imutável com Object.freeze', () => {
    // Arrange
    const amount = new Amount(50);

    // Act & Assert
    expect(Object.isFrozen(amount)).toBe(true);
  });
});
