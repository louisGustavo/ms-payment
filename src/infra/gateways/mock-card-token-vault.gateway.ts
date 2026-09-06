import { CardDetails, CardTokenVaultGateway } from '@application/ports/card-token-vault.gateway.interface';

export class MockCardTokenVaultGateway implements CardTokenVaultGateway {
  public async getCardDataByToken(paymentMethodId: string): Promise<CardDetails> {
    const normalizedToken = paymentMethodId.toLowerCase();

    let brand = 'VISA';
    let last4 = '4242';

    if (normalizedToken.includes('master')) {
      brand = 'MASTERCARD';
      last4 = '5555';
    } else if (normalizedToken.includes('elo')) {
      brand = 'ELO';
      last4 = '6363';
    } else if (normalizedToken.includes('amex')) {
      brand = 'AMEX';
      last4 = '0005';
    }

    return {
      brand,
      last4,
      cardholderName: 'CLIENTE FICTICIO MOCK',
    };
  }
}
