# Kisan Mitra — one container: static app + REST API + SQLite. No pip install needed.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    KM_DB_PATH=/data/kisanmitra.db \
    KM_DEMO_MODE=0 \
    KM_TRUST_PROXY=1

RUN useradd --system --uid 10001 --home /app kisan && mkdir -p /data && chown kisan /data
WORKDIR /app
COPY --chown=kisan . /app
USER kisan
VOLUME ["/data"]
EXPOSE 8800

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8800/api/health', timeout=3).status == 200 else 1)"

# Bind all interfaces inside the container; put TLS (Caddy/nginx/your platform) in front.
CMD ["python", "devserver.py", "8800", "0.0.0.0"]
