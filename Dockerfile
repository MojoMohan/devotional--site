FROM node:20-alpine

WORKDIR /app
COPY . .

RUN cd server && npm ci --omit=dev

EXPOSE 3000
WORKDIR /app/server
CMD ["npm", "start"]
