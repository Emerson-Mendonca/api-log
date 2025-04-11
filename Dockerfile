# Dockerfile para a aplicação Node.js
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código-fonte
COPY . .

# Compilar TypeScript para JavaScript
RUN npm run build

# Criar imagem final menor
FROM node:18-alpine

WORKDIR /app

# Copiar apenas arquivos necessários para produção
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Expor porta para a API
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "dist/index.js"]