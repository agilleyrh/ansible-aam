FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS build

WORKDIR /opt/app-root/src

COPY --chown=1001:0 package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts ./
COPY --chown=1001:0 index.html ./
COPY --chown=1001:0 src ./src

RUN npm ci && npm run build

FROM registry.access.redhat.com/ubi9/nginx-124:latest

ENV AAM_API_UPSTREAM=http://aam-api:8000

COPY nginx.conf.template /opt/app-root/etc/nginx.conf.template
COPY docker-entrypoint.sh /opt/app-root/docker-entrypoint.sh
COPY --from=build /opt/app-root/src/dist /opt/app-root/src

USER 0
RUN chmod +x /opt/app-root/docker-entrypoint.sh \
    && chown -R 1001:0 /opt/app-root \
    && chmod -R g=u /opt/app-root
USER 1001

EXPOSE 8080

ENTRYPOINT ["/opt/app-root/docker-entrypoint.sh"]
