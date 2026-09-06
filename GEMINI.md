# GEMINI.md - Contexto, Diretrizes e Regras do payment-ms

Bem-vindo ao repositório **`payment-ms`** (Microsserviço de Pagamentos). Este documento serve como guia de contexto operacional, arquitetural e técnico para desenvolvedores e agentes de inteligência artificial (Gemini, Antigravity, Copilot, etc.) atuando neste projeto.

---

## 1. Visão Geral do Projeto

O `payment-ms` é um microsserviço de alta criticidade responsável pelo processamento, autorização e persistência de pagamentos no ecossistema de e-commerce. Ele opera em conjunto com o `order-ms` através de uma **Arquitetura Orientada a Eventos (EDA - Event-Driven Architecture)**, desacoplada e resiliente.

### Principais Responsabilidades
- **Consumo de Eventos**: Consome eventos de `order.created` publicados na exchange `order.events` via RabbitMQ.
- **Processamento de Pagamento**: Orquestra a autorização com gateways adquirentes e cofre de tokens de cartão (mockados de forma realista).
- **Garantia Transacional**: Persiste o estado do pagamento e eventos de domínio de forma atômica no PostgreSQL usando o padrão **Transactional Outbox**.
- **Change Data Capture (CDC)**: Publica eventos de negócio (`payment.succeeded`, `payment.failed`) na exchange `payment.events` através do **Debezium Server** lendo o WAL do PostgreSQL, sem dependência de escrita direta no broker pela aplicação.
- **APIs REST de Consulta**: Expõe endpoints HTTP de consulta (`/api/v1/payments/:id`, `/api/v1/payments/order/:orderId`) e `/health` documentados com OpenAPI/Swagger.

---

## 2. Stack Tecnológica

| Componente | Tecnologia | Detalhes / Versão |
| :--- | :--- | :--- |
| **Runtime** | Node.js | v22.x LTS (Engine compatível com ESM/CommonJS) |
| **Linguagem** | TypeScript | v5.7.x em modo `strict: true` |
| **Web Framework** | Fastify | v5.2.x com `@fastify/swagger` e `@fastify/swagger-ui` |
| **Banco de Dados** | PostgreSQL | v16 com replicação lógica habilitada (`wal_level=logical`) |
| **Driver de BD** | `pg` | Pool de conexões nativo com transações explícitas |
| **Mensageria** | RabbitMQ | v3.13 com AMQP 0-9-1 (`amqplib`) |
| **CDC Engine** | Debezium Server | v2.6.x (Quarkus runtime) |
| **Testes** | Jest + ts-jest | v29.x com threshold de cobertura $\ge 90\%$ |
| **Compilação** | `tsc` + `tsc-alias` | Compilação com resolução estática de aliases no `dist/` |
| **Containerização**| Docker & Compose | Multi-stage build com network compartilhada `ecommerce-network` |

---

## 3. Padrões de Arquitetura & Diretrizes de Design

O projeto adota rigorosamente **Clean Architecture** combinada com práticas de **Domain-Driven Design (DDD)**.

```
       +---------------------------------------------------------------+
       |                      INFRASTRUCTURE                           |
       |  (PostgresPool, Debezium, Docker, Fastify App, Swagger)       |
       |  +---------------------------------------------------------+  |
       |  |                    ADAPTERS                             |  |
       |  |  (Fastify Controllers, RabbitMQ Consumers, Repositories)|  |
       |  |  +---------------------------------------------------+  |  |
       |  |  |                 APPLICATION                       |  |  |
       |  |  |  (Use Cases, Ports/Interfaces, DTOs, App Errors)  |  |  |
       |  |  |  +---------------------------------------------+  |  |  |
       |  |  |  |                DOMAIN                       |  |  |  |
       |  |  |  |  (Aggregate Root, Entities, Value Objects, |  |  |  |
       |  |  |  |   Domain Events, Domain Exceptions)         |  |  |  |
       |  |  |  +---------------------------------------------+  |  |  |
       |  |  +---------------------------------------------------+  |  |
       |  +---------------------------------------------------------+  |
       +---------------------------------------------------------------+
```

### Regras de Dependência (Cruciais)
1. **Camada de Domínio (`src/domain/`)**:
   - **Isolamento Absoluto**: Não possui nenhuma dependência externa, framework ou biblioteca além de recursos nativos do TypeScript/JavaScript.
   - **Agregados Ricos**: Métodos de mutação encapsulam regras de negócio (`authorize()`, `fail()`, `markAsRefunded()`). Proibido modelo anêmico (getters/setters públicos soltos).
   - **Value Objects**: Imutáveis, com validação no construtor (`Amount`).
   - **Domain Events**: Armazenados internamente no Aggregate Root via `addDomainEvent()` e descarregados no use case via `pullDomainEvents()`.
2. **Camada de Aplicação (`src/application/`)**:
   - Depende **apenas do Domínio**.
   - Define **Ports** (interfaces de repositórios e gateways externos em `ports/`).
   - Orquestra fluxos de negócio em **Use Cases** (`process-payment.use-case.ts`, `get-payment-by-id.use-case.ts`, etc.).
   - Não conhece detalhes de banco de dados (SQL), protocolos HTTP ou RabbitMQ.
3. **Camada de Adaptadores (`src/adapters/`)**:
   - Implementa as portas ou orquestra chamadas aos use cases.
   - **Controllers**: Recebem requests HTTP (Fastify), validam payload e invocam use cases.
   - **Consumers**: Ouvem filas RabbitMQ, desserializam payloads e invocam use cases.
   - **Repositories & Gateways**: Implementam as interfaces de persistência e comunicação externa.
4. **Camada de Infraestrutura (`src/infra/`)**:
   - Conexões com banco (`postgres.pool.ts`), servidor HTTP (`app.ts`), scripts de inicialização (`schema.sql`), infraestrutura de mensageria (`rabbitmq.connection.ts`).

---

## 4. Padrões Específicos do Laboratório

### 4.1. Transactional Outbox Pattern
Para evitar problemas de *Dual-Write* (inconsistência entre banco de dados e mensageria):
- Ao processar um pagamento, o Use Case gera eventos de domínio (`PaymentSucceededEvent` ou `PaymentFailedEvent`).
- O `PostgresPaymentRepository` abre uma transação SQL explícita:
  ```sql
  BEGIN;
  INSERT INTO payments (...) VALUES (...);
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES (...);
  COMMIT;
  ```
- A aplicação **NÃO** publica diretamente no RabbitMQ na saída do use case. O Debezium captura os novos registros na tabela `outbox_events` e os envia ao RabbitMQ.

### 4.2. CDC com Debezium Server
- O Debezium Server roda no container `ms-payment-debezium` utilizando a engine Quarkus.
- Conecta-se ao PostgreSQL usando a publicação lógica `payment_cdc_pub` e replication slot `payment_cdc_slot`.
- Publica na exchange `payment.events` com routing keys dinâmicas baseadas no `event_type` (ex: `payment.succeeded`, `payment.failed`).
- **Atenção em configurações**: No arquivo `debezium/conf/application.properties`, toda variável de ambiente **DEVE** ter valor de fallback (ex: `${VAR_NAME:default_value}`) para não disparar `NoSuchElementException` do Quarkus.

### 4.3. Tratamento de Envelopes Debezium no Consumo
- Ao consumir mensagens originadas de CDC (como as publicadas pelo `order-ms`), o payload vem envelopado pela estrutura padrão do Debezium:
  ```json
  {
    "schema": { ... },
    "payload": "{\"orderId\": \"...\", \"amount\": 150.00, ...}"
  }
  ```
- O `OrderCreatedConsumer` desempacota recursivamente o envelope (suportando `payload` serializado como string JSON ou como objeto nativo) antes de validar os campos do contrato.

### 4.4. Dead Letter Queue (DLQ) e Idempotência
- Se uma mensagem de `order.created` falhar em validação ou apresentar erro não recuperável, ela é rejeitada (`nack(false, false)`) e roteada para a DLQ `payment-service.order-created.dlq` via DLX `ecommerce.dlx`.
- Headers enriquecidos (`x-exception-message`, `x-original-exchange`, `x-original-routing-key`, `x-failed-at`) são anexados para permitir triagem e auditoria.
- **Idempotência**: O processamento verifica unicidade pelo `orderId`. Se o pagamento já existir para aquele pedido, a mensagem é descartada com `ack` sem reprocessamento duplicado.

---

## 5. Estrutura de Diretórios e Nomenclaturas

### Árvore de Diretórios
```text
payment-ms/
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── jest.config.js
├── package.json
├── tsconfig.json
├── GEMINI.md
├── README.md
├── debezium/
│   └── conf/
│       └── application.properties
└── src/
    ├── main.ts
    ├── domain/
    │   ├── base/               # Classes base de DDD (Entity, AggregateRoot)
    │   ├── entities/           # Entidades e Agregados (payment.entity.ts)
    │   ├── value-objects/      # Objetos de Valor (amount.vo.ts)
    │   ├── events/             # Eventos de domínio (payment-succeeded.event.ts)
    │   └── errors/             # Exceções de regras de negócio
    ├── application/
    │   ├── use-cases/          # Casos de uso de negócio
    │   ├── ports/              # Interfaces de repositórios e gateways externos
    │   ├── dtos/               # Contratos de entrada e saída
    │   └── errors/             # Erros de aplicação
    ├── adapters/
    │   ├── controllers/        # Controladores HTTP Fastify
    │   ├── consumers/          # Consumidores AMQP RabbitMQ
    │   ├── routes/             # Definição de rotas HTTP
    │   └── mappers/            # Conversores entre Domínio e Persistência
    └── infra/
        ├── database/           # Pool PostgreSQL e migrations (schema.sql)
        ├── repositories/       # Implementação do repositório com Outbox atômico
        ├── messaging/          # Conexão RabbitMQ e topologias
        ├── gateways/           # Implementações de gateways (mocks)
        └── http/               # Configuração do servidor Fastify e plugins Swagger
```

### Convenções de Nomenclatura
- **Arquivos**: Formato `kebab-case` com sufixo obrigatório indicando o papel arquitetural:
  - `*.entity.ts`, `*.vo.ts`, `*.event.ts`
  - `*.use-case.ts`, `*.interface.ts`, `*.dto.ts`, `*.error.ts`
  - `*.controller.ts`, `*.consumer.ts`, `*.routes.ts`
  - `*.repository.ts`, `*.gateway.ts`, `*.mapper.ts`
  - `*.spec.ts` (testes de unidade e integração)
- **Path Aliases TypeScript**:
  - `@domain/*` $\rightarrow$ `src/domain/*`
  - `@application/*` $\rightarrow$ `src/application/*`
  - `@adapters/*` $\rightarrow$ `src/adapters/*`
  - `@infra/*` $\rightarrow$ `src/infra/*`

---

## 6. Portas, Rede e Topologia de Infraestrutura

Para evitar conflito com o `order-ms` no mesmo host de desenvolvimento:

| Serviço | Porta Host | Porta Container | Observações |
| :--- | :--- | :--- | :--- |
| **payment-ms (HTTP)** | **`3001`** | `3001` | (`order-ms` utiliza a porta 3000) |
| **PostgreSQL (payment_db)** | **`5433`** | `5432` | (`order-ms` utiliza a porta 5432) |
| **RabbitMQ AMQP** | `5672` | `5672` | Rede Docker `ecommerce-network` |
| **RabbitMQ Management** | `15672` | `15672` | Painel Web: `http://localhost:15672` (guest/guest) |
| **Debezium CDC Runner** | - | - | Container interno conectado à rede compartilhada |

### Exchanges & Filas no RabbitMQ
- **Exchange Consumida**: `order.events` (Tipo: `topic`, Durable)
  - **Routing Key**: `order.created`
  - **Fila Principal**: `payment-service.order-created`
  - **Fila DLQ**: `payment-service.order-created.dlq` (atrelada a `ecommerce.dlx`)
- **Exchange Publicada (pelo Debezium)**: `payment.events` (Tipo: `topic`, Durable)
  - **Routing Keys**: `payment.succeeded`, `payment.failed`

---

## 7. Comandos de Operação e Desenvolvimento

### Comandos Locais (npm)
```bash
# Instalar dependências
npm install

# Executar em modo desenvolvimento (Hot reload / ts-node)
npm run dev

# Compilar TypeScript e resolver path aliases (dist/)
npm run build

# Iniciar artefato compilado
npm start

# Executar todos os testes unitários
npm test

# Executar testes com relatório de cobertura (Jest)
npm run test:cov
```

### Comandos Docker Compose
```bash
# Subir todo o ambiente de pagamentos (App + Postgres + Debezium)
docker compose up -d

# Recompilar a imagem do payment-ms e reiniciar
docker compose up -d --build payment-ms

# Ver logs do serviço de pagamentos
docker compose logs -f payment-ms

# Ver logs do motor CDC Debezium
docker compose logs -f payment-debezium

# Derrubar o ambiente mantendo os dados de volumes
docker compose down
```

---

## 8. Regras Mandatórias para Agentes de IA

Ao editar, estender ou refatorar o código deste repositório, os agentes **DEVEM** seguir estritamente as regras abaixo:

1. **Respeito Estrito à Clean Architecture**:
   - **NUNCA** importe `@adapters/*` ou `@infra/*` dentro de `@domain/*` ou `@application/*`.
   - Repositórios e gateways na camada de aplicação devem ser sempre definidos como **interfaces** (ports). A implementação fica em `@infra/repositories` ou `@infra/gateways`.
2. **Garantia de Transactional Outbox**:
   - Nenhuma operação de gravação de pagamento com publicação de evento deve emitir mensagens AMQP diretamente no Use Case. A emissão é de responsabilidade do **Debezium** lendo a tabela `outbox_events`.
   - O repositório PostgreSQL deve manter a gravação de `payments` e `outbox_events` na **mesma transação SQL** (`BEGIN ... COMMIT`).
3. **Resolução de Path Aliases no Build**:
   - O comando de build **sempre** é `tsc && tsc-alias`. Não remova o `tsc-alias`, pois o Node.js não resolve aliases `@domain/*` em runtime sem ele.
4. **Resiliência e Idempotência**:
   - Novos consumidores AMQP devem sempre implementar idempotência e tratamento seguro para envelopes de CDC e erros estruturais (roteamento para DLQ com headers).
5. **Qualidade de Testes**:
   - Toda nova funcionalidade deve ser acompanhada de testes unitários isolados em `*.spec.ts`.
   - Mantenha a cobertura de testes acima de 90% (o pipeline falha se cair abaixo dos thresholds no `jest.config.js`).
6. **Variáveis de Ambiente Debezium**:
   - Ao adicionar propriedades no `debezium/conf/application.properties`, forneça sempre o valor padrão no formato `${NOME_VARIAVEL:valor_padrao}`.
7. **Segurança e DevSecOps**:
   - **NUNCA** insira credenciais, segredos, senhas ou certificados em arquivos rastreados pelo Git.
   - Toda nova variável de configuração deve ser adicionada à interface tipada em `src/infra/config/env.ts` e documentada no `.env.example` com valores padrão seguros de desenvolvimento.
   - Preserve as regras do `.gitignore` para impedir que `dist/`, `coverage/`, `.env` ou logs sejam acidentalmente versionados.
   - Adote o padrão de mensagens **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
