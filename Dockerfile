# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .   

EXPOSE 8080

CMD ["npm", "run", "dev"]
# docker build -t my-node-app .
# docker run -p 3000:3000 my-node-app