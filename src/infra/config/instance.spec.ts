import { INSTANCE_ID } from './instance';

describe('INSTANCE_ID', () => {
  it('deve exportar uma string não vazia representando a identificação da instância', () => {
    expect(INSTANCE_ID).toBeDefined();
    expect(typeof INSTANCE_ID).toBe('string');
    expect(INSTANCE_ID.length).toBeGreaterThan(0);
  });
});
