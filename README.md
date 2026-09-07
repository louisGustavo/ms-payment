# 💳 Microsserviço de Pagamentos (`payment-ms`)

> **Laboratório de Engenharia de Software:** Microsserviço assíncrono e orientando a eventos para processamento financeiro, construído com **Clean Architecture**, **Domain-Driven Design (DDD)**, **Transactional Outbox com Change Data Capture (CDC)**, **RabbitMQ**, **PostgreSQL** e **Docker**.

---

![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5.x-000000?style=for-the-badge&logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7_Alpine-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.x-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white)
![Debezium](https://img.shields.io/badge/Debezium-CDC_Outbox-red?style=for-the-badge&logo=apache-kafka&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Multi--stage-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Jest](https://img.shields.io/badge/Coverage-99%25-C21325?style=for-the-badge&logo=jest&logoColor=white)

---

## 1. Visão Geral e Objetivo do Laboratório

O **`payment-ms`** é um microsserviço de processamento de pagamentos integrante de um ecossistema distribuído de e-commerce. Ele atua como um **consumidor assíncrono** orientado a eventos, orquestrando a cobrança financeira gerada no momento em que um pedido é criado no `order-ms`.

### Principais Responsabilidades:
1. **Consumo Confiável:** Consumir eventos `order.created` emitidos pelo ecossistema na exchange `order.events`.
2. **Lock Distribuído & Concorrência (Redis):** Prevenir *Race Conditions* e cobranças duplicadas em réplicas simultâneas de consumidores via lock atômico por recurso (`lock:payment:order:<orderId>`).
3. **Garantia de Idempotência:** Prevenir cobranças duplicadas para o mesmo `orderId`, garantindo processamento atômico e seguro.
4. **Isolamento de Negócio (DDD):** Modelar o ciclo de vida do pagamento (`Payment` Aggregate Root) com regras invariantes estritas e transições de estado ricas (`PENDING` $\rightarrow$ `SUCCEEDED` ou `FAILED`).
5. **Resiliência Transacional (Transactional Outbox Pattern):** Persistir o estado do pagamento e os eventos de saída de forma atômica no PostgreSQL (`BEGIN ... COMMIT`), delegando o despacho ao RabbitMQ para o **Debezium Server (CDC)** via WAL (`pgoutput`).
6. **Notificação do Ecossistema:** Publicar os eventos de resultado `payment.succeeded` ou `payment.failed` na exchange dedicada `payment.events`.

---

## 2. Arquitetura e Princípios de Design

A aplicação segue rigorosamente os preceitos da **Clean Architecture** (Robert C. Martin) e do **Hexagonal Architecture (Ports & Adapters)**, com regra de dependência unidirecional voltada para o centro:

```
                      +-------------------------------------------------+
                      |              Adapters (Driving)                 |
                      |   RabbitMQ Consumer | Fastify HTTP Controllers  |
                      |                       |                         |
                      |                       v                         |
                      |  +-------------------------------------------+  |
                      |  |               Application                 |  |
                      |  |   Use Cases | Pure DTOs | Ports (Outbound)|  |
                      |  |                    |                      |  |
                      |  |                    v                      |  |
                      |  |  +-------------------------------------+  |  |
                      |  |  |               Domain                |  |  |
                      |  |  | Aggregates | Value Objects | Events |  |  |
                      |  |  |        [100% Puro TypeScript]       |  |  |
                      |  |  +-------------------------------------+  |  |
                      |  +-------------------------------------------+  |
                      |                       ^                         |
                      |                       |                         |
                      |            Infrastructure (Driven)              |
                      |   PostgreSQL Pool | Gateways | Debezium CDC     |
                      +-------------------------------------------------+
```

### 2.1. Segregação de Camadas

* **`Domain` (`src/domain/`):**
  * Núcleo agnóstico sem qualquer dependência externa (zero frameworks ou bibliotecas de runtime).
  * **Aggregate Root (`Payment`):** Controla o acesso às mutações de estado, invariantes (`amount > 0`, `installments >= 1`) e emite eventos de domínio em memória (`PaymentSucceededEvent`, `PaymentFailedEvent`).
  * **Value Object (`Amount`):** Encapsula validação monetária e imutabilidade via `Object.freeze`.
  * **Domain Errors:** Hierarquia de exceções de negócio tipadas (`DomainValidationError`, `PaymentAlreadyFinalizedError`).

* **`Application` (`src/application/`):**
  * Orquestra as operações de negócio sem conhecer detalhes de banco de dados, Redis ou mensageria.
  * **Casos de Uso:** `ProcessPaymentUseCase`, `GetPaymentByIdUseCase`, `GetPaymentByOrderIdUseCase`.
  * **Portas de Saída (Ports):** Interfaces abstratas `PaymentRepository`, `PaymentGateway`, `CardTokenVaultGateway` e `DistributedLockService`.
  * **Princípio da Inversão de Dependência (DIP):** O caso de uso depende apenas das portas, não de classes concretas.

* **`Adapters` (`src/adapters/`):**
  * Adaptadores primários (driving):
    * **RabbitMQ Consumer (`order-created.consumer.ts`):** Escuta a fila `payment-service.order-created`, desempacota envelopes CDC, adquire lock distribuído exclusivo e encaminha ao caso de uso.
    * **Controladores HTTP (`payment.controller.ts`, `health.controller.ts`):** Exposição REST e healthcheck liveness/readiness.

* **`Infrastructure` (`src/infra/`):**
  * Adaptadores secundários (driven):
    * **`RedisDistributedLockService` (`src/infra/concurrency/`):** Implementação de lock atômico (`SET NX PX`) e liberação segura via script Lua com `ioredis`.
    * **`PostgresPaymentRepository`:** Persistência relacional atômica da entidade e escrita dos eventos na tabela `outbox`.
    * **`MockPaymentGateway`:** Simulação financeira com latência realista (300ms a 1800ms) e regra de falha determinística para testes (`customerId === "teste-123"`).
    * **`MockCardTokenVaultGateway`:** Simulação de cofre de cartões por token.
    * **Debezium Server:** Leitor de log transacional (WAL) que despacha os eventos da tabela `outbox` diretamente para o RabbitMQ sem polling.

---

## 3. Ciclo de Vida do Processamento de Pagamento

```
[ ms-order ] 
     |
     | (Emite evento OrderCreated via CDC)
     v
[ RabbitMQ: Exchange order.events (Routing Key: order.created) ]
     |
     v
[ Queue: payment-service.order-created ]
     |
     v
[ payment-ms: OrderCreatedConsumer ]
     |
     +---> Desempacota envelope Debezium (schema + payload)
     |
     +---> Adquire Lock Distribuído no Redis: 'lock:payment:order:<orderId>'
     |     - Se Ocupado (Concorrência detectada) -> Log informativo + ACK (descarte seguro)
     |     - Se Adquirido -> Segue para execução em bloco try/finally
     |
     +---> ProcessPaymentUseCase
              |
              +-- (1) Checa Idempotência por orderId no repositório.
              |       Se já processado -> Log informativo + ACK silencioso.
              |
              +-- (2) Se método for CREDIT_CARD -> Consulta CardTokenVaultGateway.
              |       Se PIX / BOLETO -> Segue direto para Gateway.
              |
              +-- (3) Criação da Entidade Payment em estado PENDING.
              |
              +-- (4) Executa transação via PaymentGateway:
              |       - Se aprovado -> payment.markAsSucceeded(txnId)
              |       - Se recusado -> payment.markAsFailed(reason)
              |
              +-- (5) Persistência Atômica no PostgreSQL (BEGIN ... COMMIT):
              |       - INSERT/UPDATE em payments
              |       - INSERT dos eventos acumulados na tabela outbox
              |
              v
[ Finally: Libera Lock Distribuído no Redis (Script Lua atômico checando token) ]
     |
     v
[ PostgreSQL: WAL (Write-Ahead Log) ]
     |
     v
[ Debezium Server: Outbox Event Router ]
     |
     v
[ RabbitMQ: Exchange payment.events ]
     |
     +---> payment.succeeded  (Em caso de aprovação)
     +---> payment.failed     (Em caso de recusa)
```

---

## 4. Contratos de Dados e Especificação de Eventos

### 4.1. Evento de Entrada Consumido (`order.created`)
Consumido da exchange `order.events` (suporta envelope nativo do Debezium ou payload plano):

```json
{
  "eventName": "OrderCreated",
  "occurredAt": "2026-09-06T01:15:27.686Z",
  "orderId": "b0f728fd-e858-4425-8e70-37066257229a",
  "customerId": "cust-123e4567-e89b-12d3-a456-426614174000",
  "totalAmount": 520.00,
  "shippingCost": 20.00,
  "items": [
    {
      "id": "e01ea0c6-ed2d-41e8-a64e-ef50b3b02843",
      "productId": "prod-headset-gamer",
      "name": "Headset Gamer 7.1 Surround",
      "unitPrice": 250.00,
      "quantity": 2,
      "subtotal": 500.00
    }
  ],
  "paymentDetails": {
    "method": "CREDIT_CARD",
    "paymentMethodId": "tok_visa_12345",
    "installments": 3
  },
  "createdAt": "2026-09-06T01:15:27.685Z"
}
```

### 4.2. Eventos Publicados de Saída na Exchange `payment.events`

#### A) Pagamento Aprovado (`routingKey: payment.succeeded`):
```json
{
  "eventName": "payment.succeeded",
  "occurredAt": "2026-09-06T01:21:20.592Z",
  "orderId": "b0f728fd-e858-4425-8e70-37066257229a",
  "paymentId": "b4dff570-98e9-45fa-b5f3-dc5b27901802",
  "status": "SUCCEEDED",
  "transactionId": "txn_live_a1b2c3d4e5f67890",
  "amount": 520.00
}
```

#### B) Pagamento Recusado (`routingKey: payment.failed`):
```json
{
  "eventName": "payment.failed",
  "occurredAt": "2026-09-06T01:21:20.592Z",
  "orderId": "b0f728fd-e858-4425-8e70-37066257229a",
  "paymentId": "b4dff570-98e9-45fa-b5f3-dc5b27901802",
  "status": "FAILED",
  "reason": "Insufficient funds / Test customer declined",
  "amount": 520.00
}
```

### 4.3. Endpoints da API HTTP (Fastify)

Acesse a documentação interativa em **Swagger UI:** `http://localhost:3001/docs`

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/health` | Status de integridade do PostgreSQL e RabbitMQ |
| `GET` | `/payments/:id` | Recupera os detalhes do pagamento por UUID |
| `GET` | `/payments/order/:orderId` | Recupera os dados do pagamento pelo identificador do pedido |

---

## 5. Variáveis de Ambiente

O arquivo `.env.example` traz os valores padrão sanitizados para execução local:

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Ambiente de execução (`development`, `production`, `test`) |
| `PORT` | `3001` | Porta HTTP da aplicação (Fastify) |
| `HOST` | `0.0.0.0` | Host de escuta do servidor HTTP |
| `DB_HOST` | `localhost` / `payment-postgres` | Host do PostgreSQL |
| `DB_PORT` | `5432` | Porta interna do PostgreSQL |
| `DB_USER` | `postgres` | Usuário do banco de dados |
| `DB_PASSWORD` | `postgres` | Senha do banco de dados |
| `DB_NAME` | `payment_db` | Nome da base de dados relacional |
| `DB_POOL_MAX` | `10` | Máximo de conexões no Connection Pool (`pg.Pool`) |
| `RABBITMQ_HOST` | `localhost` / `rabbitmq` | Host do broker RabbitMQ |
| `RABBITMQ_PORT` | `5672` | Porta AMQP do RabbitMQ |
| `RABBITMQ_USER` | `guest` | Usuário AMQP |
| `RABBITMQ_PASSWORD` | `guest` | Senha AMQP |
| `RABBITMQ_ORDER_EVENTS_EXCHANGE` | `order.events` | Exchange Topic de entrada dos pedidos |
| `RABBITMQ_ORDER_CREATED_ROUTING_KEY` | `order.created` | Routing Key para pedidos criados |
| `RABBITMQ_PAYMENT_QUEUE` | `payment-service.order-created` | Fila durável consumida pelo microsserviço |
| `RABBITMQ_DLX` | `ecommerce.dlx` | Dead Letter Exchange para falhas não recuperáveis |
| `RABBITMQ_DLQ` | `payment-service.order-created.dlq` | Fila de Dead Letter |
| `RABBITMQ_PAYMENT_EVENTS_EXCHANGE` | `payment.events` | Exchange Topic de saída para eventos de pagamento |
| `GATEWAY_MIN_DELAY_MS` | `300` | Latência mínima simulada no mock de gateway (ms) |
| `GATEWAY_MAX_DELAY_MS` | `1800` | Latência máxima simulada no mock de gateway (ms) |
| `REDIS_HOST` | `localhost` / `payment-redis` | Host do servidor Redis |
| `REDIS_PORT` | `6379` | Porta de conexão do Redis |
| `REDIS_PASSWORD` | `""` | Senha do Redis (opcional) |
| `DISTRIBUTED_LOCK_TTL_MS` | `10000` | Tempo de vida (TTL) do Lock Distribuído em ms |

---

## 6. Como Executar o Projeto

### Pré-requisitos:
- [Docker](https://docs.docker.com/get-docker/) instalado e em execução.
- [Docker Compose](https://docs.docker.com/compose/) v2+.
- Rede compartilhada externa criada:
  ```bash
  docker network create ecommerce-network
  ```

---

### 6.1. Execução Completa via Docker Compose (Instância Única)

Suba o cluster do `ms-payment` (Aplicação, PostgreSQL dedicado na porta `5433`, Redis na porta `6379` e Debezium Server):

```bash
docker compose up -d --build
```

#### Acessos Disponíveis:
- **API HTTP (Fastify):** [http://localhost:3001](http://localhost:3001)
- **Documentação OpenAPI / Swagger UI:** [http://localhost:3001/docs](http://localhost:3001/docs)
- **Healthcheck:** [http://localhost:3001/health](http://localhost:3001/health)
- **Redis (Redis Insight / CLI):** Host `localhost`, Porta **`6379`**
- **Painel RabbitMQ Management:** [http://localhost:15672](http://localhost:15672) (`guest` / `guest`)
- **Banco de Dados (DBeaver / PostgreSQL):** Host `localhost`, Porta **`5433`**, Banco `payment_db`, Usuário `postgres`, Senha `postgres`.

---

### 6.2. Execução em Múltiplas Instâncias e Teste de Concorrência (Escala Horizontal)

O `ms-payment` suporta execução simultânea de múltiplas réplicas (*Competing Consumers Pattern* no RabbitMQ) com garantia de que pedidos simultâneos não provoquem cobranças duplicadas, graças ao Lock Distribuído no Redis (`SET NX PX` com script Lua de liberação segura) e identificação de instâncias nos logs (`[Instance: <id>]`).

#### 1. Subir o ambiente escalado com 2 instâncias:
```bash
docker compose up -d --build --scale ms-payment=2
```

O Docker Compose criará dinamicamente duas réplicas nomeadas automaticamente (ex.: `payment-ms-ms-payment-1` e `payment-ms-ms-payment-2`), compartilhando o mesmo pool de banco, mesma fila RabbitMQ e mesma instância do Redis, sem conflito de portas no host.

#### 2. Acompanhar os logs intercalados de ambas as réplicas:
```bash
docker compose logs -f ms-payment
```
Ao iniciar, cada réplica registrará seu identificador exclusivo:
```text
ms-payment-1 | [Instance: a1b2c3d4e5f6] RabbitMQ Consumer conectado e escutando eventos order.created.
ms-payment-2 | [Instance: 7890abcdef12] RabbitMQ Consumer conectado e escutando eventos order.created.
```

#### 3. Simular o Teste de Concorrência (Race Condition):
Para validar a exclusão mútua distribuída, envie duas mensagens simultâneas com o **mesmo `orderId`** na exchange `order.events` com routing key `order.created`.

Você pode realizar o envio via **Painel Web do RabbitMQ** ([http://localhost:15672](http://localhost:15672) -> Exchanges -> `order.events` -> *Publish message*) ou via curl/bash:

**Payload de Teste:**
```json
{
  "orderId": "order-concurrency-test-001",
  "customerId": "cust-concurrent-99",
  "totalAmount": 250.00,
  "paymentDetails": {
    "method": "CREDIT_CARD",
    "paymentMethodId": "tok_visa_valid_001",
    "installments": 1
  }
}
```

#### 4. Evidência Observada nos Logs:
Ao receberem mensagens concorrentes para o mesmo pedido, ambas as réplicas tentarão adquirir o lock do recurso `lock:payment:order:order-concurrency-test-001` no Redis. Apenas uma réplica vencerá a corrida, e a outra descartará o duplicado com `ACK` imediatamente:

```text
ms-payment-1 | [Instance: a1b2c3d4e5f6] Consumindo mensagem para orderId: order-concurrency-test-001
ms-payment-1 | [Instance: a1b2c3d4e5f6] [LOCK ADQUIRIDO] Processando cobrança para orderId: order-concurrency-test-001...
ms-payment-2 | [Instance: 7890abcdef12] Consumindo mensagem para orderId: order-concurrency-test-001
ms-payment-2 | [Instance: 7890abcdef12] [LOCK RECUSADO] Concorrência detectada para orderId: order-concurrency-test-001. Ignorando mensagem duplicada.
ms-payment-1 | [Instance: a1b2c3d4e5f6] Pagamento 'pay-77682d1c' concluído com status: SUCCEEDED para orderId: order-concurrency-test-001
```

**Garantias Verificadas:**
- Apenas uma cobrança é enviada ao Gateway de Pagamento.
- A mensagem duplicada é retirada da fila sem erros e sem sobrecarregar o sistema.
- A idempotência transacional no PostgreSQL garante que a base permaneça perfeitamente consistente.

> [!NOTE]
> **Validação Estrita de Contrato e DLQ:**
> O payload de `order.created` exige obrigatoriamente os campos `orderId`, `customerId` e `totalAmount` (número). Caso uma mensagem seja enviada com formato incompleto (ex.: sem `customerId`), o consumidor automaticamente a rejeitará com `nack(false, false)` e a direcionará para a DLQ `payment-service.order-created.dlq`, registrando o log:
> `[Instance: <id>] Mensagem com contrato incompleto. Descartando para DLQ: { ... }`

---

### 6.3. Execução Local sem Docker (Desenvolvimento)

Caso possua o PostgreSQL e o RabbitMQ rodando localmente:

1. **Instale as dependências:**
   ```bash
   npm ci
   ```

2. **Crie o arquivo de configuração local:**
   ```bash
   cp .env.example .env
   ```

3. **Inicie o servidor em modo de desenvolvimento:**
   ```bash
   npm run dev
   ```

---

### 6.4. Execução dos Testes Automatizados

O repositório possui uma suíte estrita de testes unitários desenvolvida sob o padrão AAA (*Arrange, Act, Assert*) com cobertura superior a 95%:

```bash
# Executar todos os testes
npm run test

# Executar com relatório e validação de cobertura (Quality Gate)
npm run test:cov

# Executar em modo observador contínuo (Watch Mode)
npm run test:watch
```

---

### 6.5. Boas Práticas de Versionamento & DevSecOps

O repositório adota políticas rigorosas de segurança, higienização e rastreabilidade para o ciclo de desenvolvimento:
- **Sanitização de Segredos:** Arquivos `.env` reais, dumps de banco, logs e certificados são permanentemente ignorados via `.gitignore`. Apenas o modelo documentado `.env.example` com valores locais padrão de desenvolvimento é versionado.
- **Configurações Seguras:** Credenciais em ambientes produtivos devem ser injetadas exclusivamente via variáveis de ambiente seguras (Kubernetes Secrets, AWS Secrets Manager, HashiCorp Vault) e nunca no código-fonte.
- **Padrão de Commits:** Utiliza a convenção [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- **Quality Gate:** Testes automatizados executam no build multi-stage do Docker e no pré-commit para impedir que código quebre a cobertura mínima ($\ge 90\%$).

---

## 7. Estrutura de Diretórios do Projeto

```
payment-ms/
├── .env.example                       # Modelo de variáveis de ambiente
├── .dockerignore                      # Arquivos ignorados no build context do Docker
├── .gitignore                         # Arquivos ignorados no versionamento Git
├── Dockerfile                         # Build multi-stage (Builder com testes + Runner Alpine)
├── docker-compose.yml                 # Orquestração (App, PostgreSQL CDC e Debezium Server)
├── package.json                       # Scripts e dependências (Node 22 LTS)
├── tsconfig.json                      # Configurações estritas do compilador TypeScript
├── jest.config.js                     # Configuração de testes unitários e coverage thresholds
├── GEMINI.md                          # Contexto, regras de IA e diretrizes operacionais
├── README.md                          # Guia oficial e documentação técnica do projeto
├── debezium/                          # Configurações do Change Data Capture
│   └── conf/
│       └── application.properties     # Conector Quarkus/Debezium para Outbox Router
├── src/
│   ├── domain/                        # CAMADA DE DOMÍNIO (Pura, 100% agnóstica)
│   │   ├── entities/                  # Aggregate Roots e Entidades
│   │   │   ├── aggregate-root.base.ts # Classe base com suporte a Domain Events
│   │   │   ├── payment.entity.ts      # Agregado Payment com transições de estado
│   │   │   └── payment.entity.spec.ts # Testes unitários do agregado
│   │   ├── value-objects/             # Objetos de Valor Imutáveis
│   │   │   ├── amount.vo.ts           # VO Amount com validação estrita
│   │   │   └── amount.vo.spec.ts      # Testes unitários do VO
│   │   ├── events/                    # Eventos de Domínio
│   │   │   ├── domain-event.interface.ts
│   │   │   ├── payment-succeeded.event.ts
│   │   │   └── payment-failed.event.ts
│   │   ├── errors/                    # Exceções de Regras de Domínio
│   │   │   ├── domain.error.ts
│   │   │   └── domain.error.spec.ts
│   │   └── index.ts
│   ├── application/                   # CAMADA DE APLICAÇÃO (Casos de Uso e Portas)
│   │   ├── ports/                     # Portas de Saída (Abstrações / Gateways)
│   │   │   ├── payment.repository.interface.ts
│   │   │   ├── payment.gateway.interface.ts
│   │   │   ├── card-token-vault.gateway.interface.ts
│   │   │   └── distributed-lock.service.ts    # Porta de Lock Distribuído
│   │   ├── dtos/                      # Data Transfer Objects planos
│   │   │   ├── process-payment.dto.ts
│   │   │   └── get-payment.dto.ts
│   │   ├── use-cases/                 # Orquestradores de fluxo
│   │   │   ├── process-payment.use-case.ts
│   │   │   ├── process-payment.use-case.spec.ts
│   │   │   ├── get-payment-by-id.use-case.ts
│   │   │   ├── get-payment-by-id.use-case.spec.ts
│   │   │   ├── get-payment-by-order-id.use-case.ts
│   │   │   └── get-payment-by-order-id.use-case.spec.ts
│   │   ├── errors/                    # Exceções de Aplicação
│   │   │   ├── application.error.ts
│   │   │   └── application.error.spec.ts
│   │   └── index.ts
│   ├── adapters/                      # ADAPTADORES PRIMÁRIOS (Driving / Inbound)
│   │   ├── messaging/                 # Consumidores AMQP RabbitMQ
│   │   │   ├── order-created.consumer.ts      # Consumidor com suporte a Lock, DLQ e CDC
│   │   │   └── order-created.consumer.spec.ts # Testes do consumidor
│   │   └── http/                      # Interface Web Fastify
│   │       ├── controllers/           # Controladores HTTP
│   │       │   ├── payment.controller.ts
│   │       │   ├── payment.controller.spec.ts
│   │       │   ├── health.controller.ts
│   │       │   └── health.controller.spec.ts
│   │       └── routes/                # Definição e schemas OpenAPI
│   │           ├── payment.routes.ts
│   │           └── health.routes.ts
│   ├── infra/                         # ADAPTADORES SECUNDÁRIOS (Driven / Outbound)
│   │   ├── config/                    # Variáveis de ambiente e identificação de réplicas
│   │   │   ├── env.ts
│   │   │   ├── instance.ts            # Identificador exclusivo da instância (INSTANCE_ID)
│   │   │   └── instance.spec.ts
│   │   ├── concurrency/               # Lock Distribuído e Controle de Concorrência
│   │   │   ├── redis-distributed-lock.service.ts      # Engine atômica com ioredis e script Lua
│   │   │   └── redis-distributed-lock.service.spec.ts # Testes unitários do lock
│   │   ├── database/                  # Persistência e Mappers
│   │   │   ├── schema.sql             # DDL das tabelas payments e outbox
│   │   │   ├── postgres.pool.ts       # Singleton gerenciador do pg.Pool
│   │   │   ├── postgres.pool.spec.ts
│   │   │   ├── payment.mapper.ts      # Conversor tabular <-> domínio
│   │   │   ├── payment.mapper.spec.ts
│   │   │   ├── postgres-payment.repository.ts # Repositório com transação atômica Outbox
│   │   │   └── postgres-payment.repository.spec.ts
│   │   ├── gateways/                  # Mocks de Integrações Externas
│   │   │   ├── mock-payment.gateway.ts        # Gateway com latência e falha determinística
│   │   │   ├── mock-payment.gateway.spec.ts
│   │   │   ├── mock-card-token-vault.gateway.ts # Cofre de tokens de cartões
│   │   │   └── mock-card-token-vault.gateway.spec.ts
│   │   ├── messaging/                 # Infraestrutura AMQP
│   │   │   ├── rabbitmq.connection.ts         # Singleton resiliente de conexão AMQP
│   │   │   └── rabbitmq.connection.spec.ts
│   │   └── http/                      # Setup Fastify e Plugins
│   │       ├── app.ts                 # Composition da aplicação Fastify + Swagger
│   │       └── app.spec.ts            # Testes de integração HTTP
│   └── main.ts                        # Composition Root e Entrypoint da aplicação
```

---

## 8. Próximos Passos do Laboratório (Roadmap)

- [x] **Transactional Outbox Pattern com Debezium CDC:** Implementado com replicação lógica no PostgreSQL e sink RabbitMQ.
- [x] **Lock Distribuído com Redis:** Prevenção de race conditions e dupla cobrança em réplicas simultâneas via comando atômico `SET NX PX` e liberação Lua segura.
- [x] **Tratamento de Idempotência e Desempacotamento de Envelopes:** Resolução atômica de duplicações e suporte transparente a payloads envelopados do Debezium.
- [x] **Topologia Resiliente com Dead Letter Queue (DLQ):** Fila `payment-service.order-created.dlq` associada via `ecommerce.dlx`.
- [ ] **Testes de Integração Automatizados (E2E) com Testcontainers:** Testar a cadeia completa (PostgreSQL + RabbitMQ + Redis reais) em ambiente isolado de CI/CD.
- [ ] **Integração com Microsserviço de Notificações (`notification-ms`):** Ouvir `payment.succeeded` e `payment.failed` para envio de e-mails/push aos clientes.
- [ ] **Observabilidade com OpenTelemetry & Prometheus:** Coleta de métricas de latência e tracing distribuído entre `order-ms` e `payment-ms`.
