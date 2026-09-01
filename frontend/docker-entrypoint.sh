#!/bin/sh
set -eu

: "${AAM_API_UPSTREAM:=http://aam-api:8000}"
: "${AAM_DEFAULT_USER:=}"
: "${AAM_DEFAULT_ROLES:=}"

export AAM_API_UPSTREAM AAM_DEFAULT_USER AAM_DEFAULT_ROLES

envsubst '${AAM_API_UPSTREAM} ${AAM_DEFAULT_USER} ${AAM_DEFAULT_ROLES}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
