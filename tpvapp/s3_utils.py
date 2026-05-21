"""
Utilidades para interactuar con Amazon S3.

Solo actua cuando AWS_STORAGE_BUCKET_NAME esta configurado en settings
(es decir, en produccion). En local todas las funciones devuelven None/[]
sin lanzar errores, para no romper el flujo de desarrollo.

Estructura de prefijos en el bucket:
  backups/   - Copias de seguridad de la base de datos
  informes/  - Informes exportados (CSV/XLSX)
  logs/      - Exportaciones diarias de logs del sistema
  auditoria/ - Exportaciones diarias de eventos de auditoria
"""

import io
import json
import logging
import threading

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings

logger = logging.getLogger(__name__)


def _bucket():
    return getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)


def _client():
    return boto3.client("s3", region_name=getattr(settings, "AWS_S3_REGION_NAME", "us-east-1"))


# ---------------------------------------------------------------------------
# Subidas
# ---------------------------------------------------------------------------

def upload_file(local_path, s3_key: str) -> bool:
    """
    Sube un archivo local a S3.
    Devuelve True si se subio correctamente, False si no hay bucket configurado
    o si ocurrio un error.
    """
    bucket = _bucket()
    if not bucket:
        return False
    try:
        _client().upload_file(str(local_path), bucket, s3_key)
        logger.info("s3_utils: subido %s -> s3://%s/%s", local_path, bucket, s3_key)
        return True
    except (BotoCoreError, ClientError) as e:
        logger.error("s3_utils: error subiendo %s -> %s: %s", local_path, s3_key, e)
        return False


def upload_bytes(data: bytes, s3_key: str, content_type: str = "application/octet-stream") -> bool:
    """
    Sube bytes directamente a S3 sin necesidad de archivo temporal.
    """
    bucket = _bucket()
    if not bucket:
        return False
    try:
        _client().put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=data,
            ContentType=content_type,
        )
        logger.info("s3_utils: subidos %d bytes -> s3://%s/%s", len(data), bucket, s3_key)
        return True
    except (BotoCoreError, ClientError) as e:
        logger.error("s3_utils: error subiendo bytes -> %s: %s", s3_key, e)
        return False


def upload_bytes_async(data: bytes, s3_key: str, content_type: str = "application/octet-stream"):
    """
    Sube bytes a S3 en un hilo aparte para no bloquear la respuesta HTTP.
    Util para cuando se genera un informe y se quiere guardar copia en S3
    sin hacer esperar al usuario.
    """
    t = threading.Thread(target=upload_bytes, args=(data, s3_key, content_type), daemon=True)
    t.start()


def upload_json(data, s3_key: str) -> bool:
    """
    Serializa data como JSON y lo sube a S3.
    """
    payload = json.dumps(data, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    return upload_bytes(payload, s3_key, content_type="application/json")


# ---------------------------------------------------------------------------
# Listado
# ---------------------------------------------------------------------------

def list_files(prefix: str) -> list[dict]:
    """
    Lista objetos en S3 bajo el prefijo dado.
    Devuelve lista de dicts con keys: Key, Size, LastModified.
    """
    bucket = _bucket()
    if not bucket:
        return []
    try:
        paginator = _client().get_paginator("list_objects_v2")
        results = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                results.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                })
        return results
    except (BotoCoreError, ClientError) as e:
        logger.error("s3_utils: error listando prefijo %s: %s", prefix, e)
        return []


# ---------------------------------------------------------------------------
# Descarga
# ---------------------------------------------------------------------------

def download_bytes(s3_key: str) -> bytes | None:
    """
    Descarga el contenido de un objeto S3 como bytes.
    Devuelve None si no hay bucket configurado o si ocurre un error.
    """
    bucket = _bucket()
    if not bucket:
        return None
    try:
        response = _client().get_object(Bucket=bucket, Key=s3_key)
        return response["Body"].read()
    except (BotoCoreError, ClientError) as e:
        logger.error("s3_utils: error descargando %s: %s", s3_key, e)
        return None


# ---------------------------------------------------------------------------
# URLs prefirmadas (para descarga sin hacer publico el bucket)
# ---------------------------------------------------------------------------

def presigned_url(s3_key: str, expiration: int = 3600) -> str | None:
    """
    Genera una URL prefirmada para descargar un objeto de S3.
    Expira en `expiration` segundos (por defecto 1 hora).
    """
    bucket = _bucket()
    if not bucket:
        return None
    try:
        url = _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": s3_key},
            ExpiresIn=expiration,
        )
        return url
    except (BotoCoreError, ClientError) as e:
        logger.error("s3_utils: error generando URL prefirmada para %s: %s", s3_key, e)
        return None


# ---------------------------------------------------------------------------
# Prefijos estandar (para no hardcodear strings por toda la app)
# ---------------------------------------------------------------------------

S3_PREFIX_BACKUPS = "backups/"
S3_PREFIX_INFORMES = "informes/"
S3_PREFIX_LOGS = "logs/"
S3_PREFIX_AUDITORIA = "auditoria/"
