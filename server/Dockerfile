FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY prisma/ ./prisma/

RUN npx prisma generate

EXPOSE 3002

CMD ["node", "src/index.js"]