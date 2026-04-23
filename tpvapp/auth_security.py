import hashlib
import json
import time

from django.core.cache import cache

from tpvapp.models import ConfiguracionTPV

CACHE_CONFIG_KEY = "auth_security:config:v2"

CFG_ENABLED = "auth_security_enabled"
CFG_THROTTLE_RULES_JSON = "auth_throttle_rules_json"
CFG_USER_LOCK_MODE = "auth_user_lock_mode"
CFG_USER_LOCK_ATTEMPTS = "auth_user_lock_attempts"
CFG_USER_LOCK_SECONDS = "auth_user_lock_seconds"

# Claves legacy (migracion transparente)
CFG_CYCLE_ATTEMPTS = "auth_throttle_cycle_attempts"
CFG_FIRST_LOCK_SECONDS = "auth_throttle_first_seconds"
CFG_REPEAT_LOCK_SECONDS = "auth_throttle_repeat_seconds"
CFG_USER_LOCK_ENABLED = "auth_user_lock_enabled"
CFG_USER_LOCK_PERMANENT = "auth_user_lock_permanent"

USER_LOCK_NONE = "none"
USER_LOCK_TEMPORARY = "temporary"
USER_LOCK_PERMANENT = "permanent"
VALID_USER_LOCK_MODES = {USER_LOCK_NONE, USER_LOCK_TEMPORARY, USER_LOCK_PERMANENT}

DEFAULTS = {
    "enabled": True,
    "throttle_rules": [
        {"attempts": 5, "seconds": 60},
        {"attempts": 5, "seconds": 300},
    ],
    "user_lock_mode": USER_LOCK_NONE,
    "user_lock_attempts": 20,
    "user_lock_seconds": 1800,
}
USER_LOCK_ATTEMPTS_MAX = 9999


def _to_bool(value, default):
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "si", "on")


def _to_int(value, default, min_value, max_value):
    try:
        parsed = int(str(value).strip())
    except Exception:
        parsed = default
    return max(min_value, min(max_value, parsed))


def _normalize_rules(rules):
    cleaned = []
    for rule in rules or []:
        if not isinstance(rule, dict):
            continue
        attempts = _to_int(rule.get("attempts"), 0, 1, 50)
        seconds = _to_int(rule.get("seconds"), 0, 10, 7200)
        if attempts <= 0 or seconds <= 0:
            continue
        cleaned.append({"attempts": attempts, "seconds": seconds})
    if not cleaned:
        return [r.copy() for r in DEFAULTS["throttle_rules"]]
    return cleaned


def _parse_rules_from_value(value):
    if not value:
        return None
    try:
        data = json.loads(value)
    except Exception:
        return None
    if not isinstance(data, list):
        return None
    return _normalize_rules(data)


def _legacy_rules(raw):
    cycle = _to_int(raw.get(CFG_CYCLE_ATTEMPTS), 5, 1, 50)
    first_sec = _to_int(raw.get(CFG_FIRST_LOCK_SECONDS), 60, 10, 7200)
    repeat_sec = _to_int(raw.get(CFG_REPEAT_LOCK_SECONDS), 300, 10, 7200)
    return [
        {"attempts": cycle, "seconds": first_sec},
        {"attempts": cycle, "seconds": repeat_sec},
    ]


def _normalize_user_lock_mode(raw):
    mode = str(raw or "").strip().lower()
    if mode in VALID_USER_LOCK_MODES:
        return mode
    return USER_LOCK_NONE


def _min_user_lock_attempts(throttle_rules):
    total = sum(
        _to_int((rule or {}).get("attempts"), 0, 1, 50)
        for rule in (throttle_rules or [])
        if isinstance(rule, dict)
    )
    return max(1, total)


def _legacy_user_lock_mode(raw):
    enabled = _to_bool(raw.get(CFG_USER_LOCK_ENABLED), False)
    if not enabled:
        return USER_LOCK_NONE
    permanent = _to_bool(raw.get(CFG_USER_LOCK_PERMANENT), False)
    return USER_LOCK_PERMANENT if permanent else USER_LOCK_TEMPORARY


def invalidate_auth_security_config_cache():
    cache.delete(CACHE_CONFIG_KEY)


def get_auth_security_config(force_refresh=False):
    if not force_refresh:
        cached = cache.get(CACHE_CONFIG_KEY)
        if cached:
            return cached

    keys = [
        CFG_ENABLED,
        CFG_THROTTLE_RULES_JSON,
        CFG_USER_LOCK_MODE,
        CFG_USER_LOCK_ATTEMPTS,
        CFG_USER_LOCK_SECONDS,
        # legacy
        CFG_CYCLE_ATTEMPTS,
        CFG_FIRST_LOCK_SECONDS,
        CFG_REPEAT_LOCK_SECONDS,
        CFG_USER_LOCK_ENABLED,
        CFG_USER_LOCK_PERMANENT,
    ]
    raw = dict(
        ConfiguracionTPV.objects.filter(clave__in=keys).values_list("clave", "valor")
    )

    parsed_rules = _parse_rules_from_value(raw.get(CFG_THROTTLE_RULES_JSON))
    throttle_rules = parsed_rules or _legacy_rules(raw)
    throttle_rules = _normalize_rules(throttle_rules)
    min_user_lock_attempts = _min_user_lock_attempts(throttle_rules)
    attempts_max = max(USER_LOCK_ATTEMPTS_MAX, min_user_lock_attempts)

    mode = _normalize_user_lock_mode(raw.get(CFG_USER_LOCK_MODE))
    if mode == USER_LOCK_NONE:
        mode = _legacy_user_lock_mode(raw)

    cfg = {
        "enabled": _to_bool(raw.get(CFG_ENABLED), DEFAULTS["enabled"]),
        "throttle_rules": throttle_rules,
        "user_lock_mode": mode,
        "user_lock_attempts": max(
            min_user_lock_attempts,
            _to_int(raw.get(CFG_USER_LOCK_ATTEMPTS), DEFAULTS["user_lock_attempts"], 1, attempts_max),
        ),
        "user_lock_seconds": _to_int(raw.get(CFG_USER_LOCK_SECONDS), DEFAULTS["user_lock_seconds"], 60, 86400),
    }

    cache.set(CACHE_CONFIG_KEY, cfg, timeout=120)
    return cfg


def save_auth_security_config(values):
    incoming_rules = values.get("throttle_rules")
    if incoming_rules is None:
        incoming_rules = values.get("rules")
    throttle_rules = _normalize_rules(incoming_rules)
    min_user_lock_attempts = _min_user_lock_attempts(throttle_rules)
    attempts_max = max(USER_LOCK_ATTEMPTS_MAX, min_user_lock_attempts)

    mode = _normalize_user_lock_mode(values.get("user_lock_mode"))
    if mode not in VALID_USER_LOCK_MODES:
        mode = USER_LOCK_NONE

    normalized = {
        CFG_ENABLED: "1" if bool(values.get("enabled", DEFAULTS["enabled"])) else "0",
        CFG_THROTTLE_RULES_JSON: json.dumps(throttle_rules),
        CFG_USER_LOCK_MODE: mode,
        CFG_USER_LOCK_ATTEMPTS: str(
            max(
                min_user_lock_attempts,
                _to_int(values.get("user_lock_attempts"), DEFAULTS["user_lock_attempts"], 1, attempts_max),
            )
        ),
        CFG_USER_LOCK_SECONDS: str(_to_int(values.get("user_lock_seconds"), DEFAULTS["user_lock_seconds"], 60, 86400)),
        # legacy mirrors
        CFG_CYCLE_ATTEMPTS: str(throttle_rules[0]["attempts"]),
        CFG_FIRST_LOCK_SECONDS: str(throttle_rules[0]["seconds"]),
        CFG_REPEAT_LOCK_SECONDS: str(throttle_rules[min(1, len(throttle_rules) - 1)]["seconds"]),
        CFG_USER_LOCK_ENABLED: "1" if mode != USER_LOCK_NONE else "0",
        CFG_USER_LOCK_PERMANENT: "1" if mode == USER_LOCK_PERMANENT else "0",
    }

    for clave, valor in normalized.items():
        ConfiguracionTPV.objects.update_or_create(
            clave=clave,
            defaults={"valor": valor},
        )

    invalidate_auth_security_config_cache()
    return get_auth_security_config(force_refresh=True)


def _normalize_username(username):
    value = (username or "").strip().lower()
    return value[:120] or "__empty__"


def get_client_ip(request):
    if request is None:
        return "unknown"
    forwarded_for = (request.META.get("HTTP_X_FORWARDED_FOR") or "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or "unknown"
    return (request.META.get("REMOTE_ADDR") or "").strip() or "unknown"


def _state_key(username, ip):
    token = hashlib.sha1(f"{username}|{ip}".encode("utf-8")).hexdigest()
    return f"auth_security:state:{token}"


def _user_lock_key(username):
    token = hashlib.sha1(username.encode("utf-8")).hexdigest()
    return f"auth_security:userlock:{token}"


def _max_rule_seconds(cfg):
    return max((r["seconds"] for r in cfg["throttle_rules"]), default=300)


def _state_timeout(cfg):
    return max(_max_rule_seconds(cfg) * 4, cfg["user_lock_seconds"] + 600, 86400)


def get_login_block(request, username):
    cfg = get_auth_security_config()
    if not cfg["enabled"]:
        return {"blocked": False, "reason": None, "retry_after": 0, "config": cfg}

    now = time.time()
    user_key = _normalize_username(username)
    ip = get_client_ip(request)

    if cfg["user_lock_mode"] != USER_LOCK_NONE:
        lock_key = _user_lock_key(user_key)
        lock_state = cache.get(lock_key) or {}
        if lock_state.get("permanent"):
            return {
                "blocked": True,
                "reason": "user_lock_permanent",
                "retry_after": 0,
                "config": cfg,
            }
        lock_until = float(lock_state.get("until") or 0)
        if lock_until > now:
            return {
                "blocked": True,
                "reason": "user_lock",
                "retry_after": int(lock_until - now),
                "config": cfg,
            }
        if lock_state:
            cache.delete(lock_key)

    state = cache.get(_state_key(user_key, ip)) or {}
    throttle_until = float(state.get("throttle_until") or 0)
    if throttle_until > now:
        return {
            "blocked": True,
            "reason": "throttle",
            "retry_after": int(throttle_until - now),
            "config": cfg,
        }

    return {"blocked": False, "reason": None, "retry_after": 0, "config": cfg}


def register_failed_login(request, username):
    cfg = get_auth_security_config()
    if not cfg["enabled"]:
        return {
            "fails": 0,
            "locks": 0,
            "stage": 0,
            "throttle_applied": 0,
            "user_lock_applied": 0,
            "user_lock_permanent": False,
            "config": cfg,
        }

    user_key = _normalize_username(username)
    ip = get_client_ip(request)
    cache_key = _state_key(user_key, ip)
    state = cache.get(cache_key) or {}
    now = time.time()

    fails = int(state.get("fails") or 0) + 1
    locks = int(state.get("locks") or 0)
    stage_index = int(state.get("stage_index") or 0)
    stage_progress = int(state.get("stage_progress") or 0) + 1
    throttle_until = float(state.get("throttle_until") or 0)

    if throttle_until < now:
        throttle_until = 0

    rules = cfg["throttle_rules"] or [r.copy() for r in DEFAULTS["throttle_rules"]]
    stage_index = max(0, min(stage_index, len(rules) - 1))
    current_rule = rules[stage_index]

    throttle_applied = 0
    if stage_progress >= current_rule["attempts"]:
        throttle_applied = current_rule["seconds"]
        throttle_until = now + throttle_applied
        stage_progress = 0
        locks += 1
        if stage_index < len(rules) - 1:
            stage_index += 1

    user_lock_applied = 0
    user_lock_permanent = False
    if cfg["user_lock_mode"] != USER_LOCK_NONE and fails >= cfg["user_lock_attempts"]:
        if cfg["user_lock_mode"] == USER_LOCK_PERMANENT:
            user_lock_permanent = True
            cache.set(
                _user_lock_key(user_key),
                {"permanent": True, "fails": fails, "set_at": now},
                timeout=365 * 24 * 3600,
            )
        else:
            user_lock_applied = cfg["user_lock_seconds"]
            cache.set(
                _user_lock_key(user_key),
                {"until": now + user_lock_applied, "fails": fails},
                timeout=max(user_lock_applied + 600, 3600),
            )

    cache.set(
        cache_key,
        {
            "fails": fails,
            "locks": locks,
            "stage_index": stage_index,
            "stage_progress": stage_progress,
            "throttle_until": throttle_until,
            "last_fail": now,
        },
        timeout=_state_timeout(cfg),
    )

    return {
        "fails": fails,
        "locks": locks,
        "stage": stage_index + 1,
        "throttle_applied": throttle_applied,
        "user_lock_applied": user_lock_applied,
        "user_lock_permanent": user_lock_permanent,
        "config": cfg,
    }


def register_success_login(request, username):
    cfg = get_auth_security_config()
    user_key = _normalize_username(username)
    ip = get_client_ip(request)
    cache.delete(_state_key(user_key, ip))
    cache.delete(_user_lock_key(user_key))
    return cfg


def clear_user_lock(username):
    user_key = _normalize_username(username)
    cache.delete(_user_lock_key(user_key))


def clear_ip_throttle(username, ip):
    user_key = _normalize_username(username)
    cache.delete(_state_key(user_key, ip or "unknown"))
