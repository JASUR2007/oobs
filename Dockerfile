FROM node:22-alpine

WORKDIR /app

COPY package.json ./

# В проекте нет внешних зависимостей, но если появятся
RUN npm install --production --ignore-scripts || true

COPY . .

ENV PORT=10000
ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "server.js"]
