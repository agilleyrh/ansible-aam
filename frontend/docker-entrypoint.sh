#!/bin/sh
set -eu

: "${AAM_API_UPSTREAM:=http://aam-api:8000}"

mkdir -p /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi /opt/app-root/etc
sed "s|__AAM_API_UPSTREAM__|${AAM_API_UPSTREAM}|g" \
  /opt/app-root/etc/nginx.conf.template \
  > /opt/app-root/etc/nginx.conf

exec nginx -c /opt/app-root/etc/nginx.conf -g "daemon off;"
