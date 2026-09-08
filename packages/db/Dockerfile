FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . ./
CMD ["sh", "-c", "npx prisma db push && npm run seed"]
