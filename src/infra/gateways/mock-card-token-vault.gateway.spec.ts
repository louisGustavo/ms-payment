import { MockCardTokenVaultGateway } from './mock-card-token-vault.gateway';

describe('MockCardTokenVaultGateway', () => {
  let gateway: MockCardTokenVaultGateway;

  beforeEach(() => {
    gateway = new MockCardTokenVaultGateway();
  });

  it('deve identificar bandeira VISA para token comum', async () => {
    const details = await gateway.getCardDataByToken('tok_visa_123');
    expect(details.brand).toBe('VISA');
    expect(details.last4).toBe('4242');
    expect(details.cardholderName).toBe('CLIENTE FICTICIO MOCK');
  });

  it('deve identificar bandeira MASTERCARD para token master', async () => {
    const details = await gateway.getCardDataByToken('tok_mastercard_456');
    expect(details.brand).toBe('MASTERCARD');
    expect(details.last4).toBe('5555');
  });

  it('deve identificar bandeira ELO para token elo', async () => {
    const details = await gateway.getCardDataByToken('tok_elo_789');
    expect(details.brand).toBe('ELO');
    expect(details.last4).toBe('6363');
  });

  it('deve identificar bandeira AMEX para token amex', async () => {
    const details = await gateway.getCardDataByToken('tok_amex_012');
    expect(details.brand).toBe('AMEX');
    expect(details.last4).toBe('0005');
  });
});
