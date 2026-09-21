#!/bin/sh
set -eu

: "${AAM_API_UPSTREAM:=http://aam-api:8000}"

export AAM_API_UPSTREAM

envsubst '${AAM_API_UPSTREAM}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
