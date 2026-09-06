# ----------------------------------------------------------------------
# Estágio 1: Build da Aplicação TypeScript
# ----------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copia manifestos de dependências e configurações
COPY package*.json tsconfig.json jest.config.js ./

# Instala todas as dependências (incluindo devDependencies)
RUN npm ci

# Copia código-fonte
COPY src/ ./src/

# Executa bateria de testes automatizados como Quality Gate no build
RUN npm run test

# Compila o projeto TypeScript para JavaScript em /app/dist
RUN npm run build

# Copia scripts de banco de dados se existentes
RUN cp -r src/infra/database/schema.sql dist/infra/database/schema.sql 2>/dev/null || :

# ----------------------------------------------------------------------
# Estágio 2: Runtime de Produção Enxuto
# ----------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Copia manifestos e instala exclusivamente dependências de produção
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia os artefatos compilados do estágio de build
COPY --from=builder /app/dist ./dist

# Usuário não-root para prevenção de escalonamento de privilégios
USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]
