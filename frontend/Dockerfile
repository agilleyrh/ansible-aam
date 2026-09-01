FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS build

WORKDIR /opt/app-root/src

COPY --chown=1001:0 package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts ./
COPY --chown=1001:0 index.html ./
COPY --chown=1001:0 src ./src

RUN npm ci && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

ENV AAM_API_UPSTREAM=http://aam-api:8000 \
    AAM_DEFAULT_USER= \
    AAM_DEFAULT_ROLES=

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=build /opt/app-root/src/dist /usr/share/nginx/html

USER 0
RUN chmod +x /docker-entrypoint.sh \
    && chown -R 101:0 /usr/share/nginx/html /etc/nginx/conf.d /etc/nginx/templates \
    && chmod -R g=u /usr/share/nginx/html /etc/nginx/conf.d /etc/nginx/templates
USER 101

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
