FROM node:22-alpine AS build

WORKDIR /app

COPY package.json tsconfig.json tsconfig.node.json vite.config.ts /app/
COPY index.html /app/index.html
COPY src /app/src

RUN npm install && npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

