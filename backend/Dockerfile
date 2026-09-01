FROM registry.access.redhat.com/ubi9/python-312:latest

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OPENSSL_armcap=0

WORKDIR /opt/app-root/src

COPY --chown=1001:0 pyproject.toml README.md alembic.ini ./
COPY --chown=1001:0 alembic ./alembic
COPY --chown=1001:0 app ./app

RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .

# OpenShift assigns an arbitrary UID in group 0; keep the tree group-writable.
USER 0
RUN chgrp -R 0 /opt/app-root && chmod -R g=u /opt/app-root
USER 1001

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "asyncio", "--http", "h11"]
