FROM node:20-alpine

WORKDIR /app
COPY . .

RUN cd server && npm ci --omit=dev

EXPOSE 3000
CMD ["sh", "-c", "cd server && npm start"]
