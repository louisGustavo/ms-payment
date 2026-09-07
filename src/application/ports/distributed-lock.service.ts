/**
 * Porta de saída da camada de aplicação para controle de Lock Distribuído.
 * Permite coordenar o acesso a recursos compartilhados entre múltiplas instâncias
 * de microsserviços sem acoplar a aplicação ao Redis ou outro motor de concorrência.
 */
export interface DistributedLockService {
  /**
   * Tenta adquirir o lock exclusivo para o recurso especificado.
   *
   * @param resource Identificador único do recurso a ser travado (ex: 'lock:payment:order:123')
   * @param ttlMs Tempo de vida do lock em milissegundos (Time-to-Live de segurança contra deadlocks)
   * @returns O token identificador único da posse do lock se adquirido com sucesso, ou `null` se o recurso já estiver bloqueado.
   */
  acquire(resource: string, ttlMs: number): Promise<string | null>;

  /**
   * Libera com segurança o lock detido pelo token informado.
   *
   * @param resource Identificador do recurso previamente travado
   * @param token Token de posse fornecido na aquisição (garante que apenas o detentor do lock pode liberá-lo)
   * @returns `true` se o lock foi liberado com sucesso, ou `false` caso o token não confira ou o lock já tenha expirado.
   */
  release(resource: string, token: string): Promise<boolean>;
}
