FROM node:16-alpine

WORKDIR /usr/src/app

# Instala dependências necessárias para compilação
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

COPY . .

# Adiciona curl para healthcheck
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV API_PORT=3005

EXPOSE 3005

# Adiciona um delay inicial para garantir que o Dremio esteja acessível
CMD ["sh", "-c", "sleep 10 && node server.js"]
