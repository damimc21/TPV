# ---- Build stage ----
FROM python:3.13-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    default-libmysqlclient-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-prod.txt ./
RUN pip install --no-cache-dir --prefix=/install \
    -r requirements.txt \
    -r requirements-prod.txt

# ---- Final stage ----
FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local
COPY . .

RUN DJANGO_SECRET_KEY=build-dummy-key python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "tpv.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]