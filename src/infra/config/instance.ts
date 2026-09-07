import os from 'node:os';
import crypto from 'node:crypto';

/**
 * Identificador único da instância em execução.
 * Pode ser definido explicitamente via INSTANCE_ID ou derivado
 * do hostname do container (ID do container Docker) ou gerado aleatoriamente.
 */
export const INSTANCE_ID: string =
  process.env['INSTANCE_ID'] ||
  os.hostname() ||
  crypto.randomUUID().slice(0, 8);
