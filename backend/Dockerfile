FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml /app/pyproject.toml
COPY README.md /app/README.md
COPY alembic.ini /app/alembic.ini
COPY alembic /app/alembic
COPY app /app/app

RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .

RUN addgroup --system aam && adduser --system --ingroup aam aam
USER aam

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
