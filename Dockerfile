FROM node:22-alpine

RUN apk add --no-cache git curl bash
RUN npm install -g cline

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

RUN mkdir -p /var/data/workspace /var/data/.cline

EXPOSE 3000

ENV NODE_ENV=production
ENV DOCKER=true
ENV DATA_DIR=/var/data

CMD ["npm", "start"]
