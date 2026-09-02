FROM node:24-alpine
WORKDIR /app
COPY package.json package.json
RUN npm install --production
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]
