FROM node:20-alpine

WORKDIR /app

COPY server/package*.json /app/server/
RUN cd /app/server && npm ci --omit=dev

COPY . /app

WORKDIR /app/server
EXPOSE 3000

CMD ["npm", "start"]
