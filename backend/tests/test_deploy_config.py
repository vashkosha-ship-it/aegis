"""Проверки конфигурации деплоя: CSP, заголовки, порядок подключения скриптов.

Зачем это в тестах. Дважды за один день правка не доезжала до места, где она
что-то значит: снипет с новой CSP остался в репозитории и не попал в
/etc/nginx/snippets, а реестр разрешённых обработчиков не был подключён в
index.html. В обоих случаях всё выглядело сделанным, а работало по-старому,
и обнаруживалось вручную.

Здесь проверяется то, что можно проверить без сервера: сам файл конфигурации
и разметка. Отданные боевым сервером заголовки — отдельно,
tools/verify_deployment.py.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
HEADERS_CONF = REPO / "backend" / "deploy" / "aegis-security-headers.conf"
INDEX_HTML = REPO / "frontend" / "index.html"
APP_JS = REPO / "frontend" / "app.js"
NGINX_CONF = REPO / "backend" / "deploy" / "nginx-aegis.conf"
BACKEND_SERVICE = REPO / "backend" / "deploy" / "aegis.service"
WORKER_SERVICE = REPO / "backend" / "deploy" / "aegis-worker.service"
HEALTHCHECK = REPO / "backend" / "deploy" / "healthcheck.sh"
JOURNAL_CONF = REPO / "backend" / "deploy" / "20-aegis-retention.conf"
ALERT_SERVICE = REPO / "backend" / "deploy" / "aegis-alert@.service"
BACKUP_SCRIPT = REPO / "backend" / "deploy" / "backup.sh"
BACKUP_SERVICE = REPO / "backend" / "deploy" / "aegis-backup.service"
BACKUP_TIMER = REPO / "backend" / "deploy" / "aegis-backup.timer"
RESTORE_DOC = REPO / "backend" / "deploy" / "RESTORE.md"


def _active_lines(path: Path) -> list[str]:
    """Строки конфигурации без комментариев.

    Существенно: закомментированная политика в файле лежит намеренно (прежняя
    разрешающая, на случай отката), и путать её с действующей нельзя.
    """
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        stripped = raw.strip()
        if stripped and not stripped.startswith("#"):
            lines.append(stripped)
    return lines


def _header_value(lines: list[str], name: str) -> str | None:
    """Значение add_header по точному имени заголовка."""
    pattern = re.compile(rf'^add_header\s+{re.escape(name)}\s+"(.*)"\s*(always)?\s*;')
    for line in lines:
        m = pattern.match(line)
        if m:
            return m.group(1)
    return None


@pytest.fixture(scope="module")
def conf_lines() -> list[str]:
    assert HEADERS_CONF.exists(), f"не найден {HEADERS_CONF}"
    return _active_lines(HEADERS_CONF)


class TestContentSecurityPolicy:
    def test_exactly_one_active_policy(self, conf_lines):
        """Две одновременно действующие политики — источник путаницы.

        Report-Only рядом с боевой допустим только на время наблюдения; если
        он остался включённым, значит переход не довели до конца.
        """
        active = [
            line for line in conf_lines
            if line.startswith("add_header Content-Security-Policy ")
        ]
        report_only = [
            line for line in conf_lines
            if line.startswith("add_header Content-Security-Policy-Report-Only")
        ]
        assert len(active) == 1, f"действующих политик: {len(active)}"
        assert not report_only, "Report-Only остался включённым"

    def test_script_src_forbids_inline(self, conf_lines):
        """Ради этого и переписывались 335 обработчиков."""
        csp = _header_value(conf_lines, "Content-Security-Policy")
        assert csp, "нет действующей Content-Security-Policy"

        script_src = next(
            (d.strip() for d in csp.split(";") if d.strip().startswith("script-src")),
            None,
        )
        assert script_src, "в политике нет script-src"
        assert "'unsafe-inline'" not in script_src, (
            "script-src снова разрешает инлайновые скрипты — внедрённый в DOM "
            "текст сможет выполниться"
        )
        assert "'unsafe-eval'" not in script_src, (
            "script-src снова разрешает eval — диспетчер обработчиков в нём "
            "не нуждается"
        )

    def test_style_src_exception_is_narrow(self, conf_lines):
        """'unsafe-inline' допустим только для стилей и только там."""
        csp = _header_value(conf_lines, "Content-Security-Policy")
        directives = {
            d.strip().split()[0]: d.strip()
            for d in csp.split(";")
            if d.strip()
        }
        for name, value in directives.items():
            if name == "style-src":
                continue
            assert "'unsafe-inline'" not in value, (
                f"'unsafe-inline' появился в {name}"
            )

    @pytest.mark.parametrize(
        ("directive", "expected"),
        [
            ("default-src", "'self'"),
            ("object-src", "'none'"),
            ("base-uri", "'self'"),
            ("form-action", "'self'"),
            ("frame-ancestors", "'none'"),
        ],
    )
    def test_restrictive_directives_present(self, conf_lines, directive, expected):
        csp = _header_value(conf_lines, "Content-Security-Policy")
        assert f"{directive} {expected}" in csp, (
            f"ожидалось {directive} {expected}"
        )


class TestOtherSecurityHeaders:
    @pytest.mark.parametrize(
        ("header", "must_contain"),
        [
            ("Strict-Transport-Security", "max-age="),
            ("X-Content-Type-Options", "nosniff"),
            ("X-Frame-Options", "DENY"),
            ("Referrer-Policy", "strict-origin"),
            ("Permissions-Policy", "geolocation=()"),
        ],
    )
    def test_header_present(self, conf_lines, header, must_contain):
        value = _header_value(conf_lines, header)
        assert value is not None, f"нет заголовка {header}"
        assert must_contain in value

    def test_hsts_has_no_preload(self, conf_lines):
        """preload необратим: откатить попадание в список браузеров нельзя."""
        hsts = _header_value(conf_lines, "Strict-Transport-Security")
        assert "preload" not in hsts


class TestScriptLoadingOrder:
    """Порядок подключения — не косметика.

    Реестр разрешённых обработчиков должен выполниться раньше диспетчера:
    иначе список окажется пустым, и диспетчер молча отклонит все обработчики.
    Интерфейс при этом выглядит целым, но не реагирует ни на что.
    """

    @staticmethod
    @pytest.fixture(scope="class")
    def html() -> str:
        assert INDEX_HTML.exists(), f"не найден {INDEX_HTML}"
        return INDEX_HTML.read_text(encoding="utf-8")

    def test_allowlist_loaded_before_dispatcher(self, html):
        allowlist = html.find("handler-allowlist.js")
        dispatcher = html.find("inline-handlers.js")

        assert allowlist != -1, "реестр обработчиков не подключён"
        assert dispatcher != -1, "диспетчер обработчиков не подключён"
        assert allowlist < dispatcher, (
            "реестр подключён после диспетчера — список будет пустым"
        )

    def test_helpers_are_loaded(self, html):
        assert "csp-helpers.js" in html, (
            "не подключены функции-помощники: часть обработчиков не найдётся"
        )

    def test_all_referenced_scripts_exist(self, html):
        """Опечатка в имени файла даёт 404 и молча ломает часть интерфейса."""
        missing = []
        for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
            if src.startswith(("http://", "https://", "//")):
                continue
            if not (INDEX_HTML.parent / src).exists():
                missing.append(src)
        assert not missing, f"подключены несуществующие файлы: {missing}"


class TestNoInlineHandlersLeftInMarkup:
    """CSP без 'unsafe-inline' и инлайновые обработчики несовместимы.

    Если новый обработчик добавят по старой привычке, он просто не сработает
    в браузере — без ошибки, которую легко заметить. Ловим здесь.
    """

    HANDLER_RE = re.compile(r'\son(click|change|input|keydown|keyup|submit|error)\s*=')

    @pytest.mark.parametrize("filename", ["index.html", "app.js"])
    def test_no_inline_event_attributes(self, filename):
        path = INDEX_HTML.parent / filename
        text = path.read_text(encoding="utf-8")

        offenders = []
        for match in self.HANDLER_RE.finditer(text):
            line_no = text.count("\n", 0, match.start()) + 1
            offenders.append(f"{filename}:{line_no}")

        assert not offenders, (
            f"инлайновые обработчики не работают при текущей CSP: "
            f"{offenders[:10]}"
        )


class TestNoStaleConfigs:
    """Устаревшие копии конфигов путают при деплое.

    Рабочие лежат в backend/deploy. Копии в корне репозитория и в backend/
    остались от прежней схемы: править по ошибке начинали именно их, а на
    сервер уезжало старое.
    """

    @pytest.mark.parametrize(
        "stale",
        ["security-headers.conf", "backend/nginx-aegis.conf"],
    )
    def test_stale_config_removed(self, stale):
        path = REPO / stale
        assert not path.exists(), (
            f"{stale} — устаревшая копия. Рабочие конфиги в backend/deploy/"
        )


class TestHealthRouting:
    """Healthcheck не должен принимать HTML SPA за здоровый backend."""

    def test_nginx_proxies_health_endpoints(self):
        config = NGINX_CONF.read_text(encoding="utf-8")

        assert "location = /health" in config
        assert "proxy_pass http://127.0.0.1:8000/health" in config
        assert "location = /ready" in config
        assert "proxy_pass http://127.0.0.1:8000/ready" in config

    def test_healthcheck_validates_json_and_redis(self):
        script = HEALTHCHECK.read_text(encoding="utf-8")

        assert '\"status\":\"ok\"' in script
        assert '\"redis\":{\"ok\":true' in script
        assert '\"database\":{\"ok\":true' in script
        assert '\"storage\":{\"ok\":true' in script

    def test_range_check_requires_auth_and_validates_206(self):
        script = HEALTHCHECK.read_text(encoding="utf-8")

        assert "AEGIS_HEALTH_TOKEN" in script
        assert "Authorization: Bearer $HEALTH_TOKEN" in script
        assert '"206"' in script
        assert "Content-Range: bytes 0-" in script

    def test_worker_drops_root_privileges(self):
        active = _active_lines(WORKER_SERVICE)

        assert "User=www-data" in active
        assert "Group=www-data" in active
        assert "User=root" not in active
        assert "NoNewPrivileges=true" in active
        assert "EnvironmentFile=/opt/aegis/backend/.env" in active

    def test_backend_is_sandboxed(self):
        active = _active_lines(BACKEND_SERVICE)

        assert "User=www-data" in active
        assert "Group=www-data" in active
        assert "User=root" not in active
        assert "NoNewPrivileges=true" in active
        assert "PrivateTmp=true" in active
        assert "ProtectSystem=full" in active
        assert "ProtectHome=true" in active
        assert "UMask=0027" in active

    def test_backend_requires_redis_service(self):
        service = BACKEND_SERVICE.read_text(encoding="utf-8")

        assert "Requires=redis-server.service" in service


class TestLogRetention:
    """Системный журнал не должен бесконтрольно занимать диск."""

    def test_journal_has_size_and_time_limits(self):
        active = _active_lines(JOURNAL_CONF)

        assert "[Journal]" in active
        assert "SystemMaxUse=500M" in active
        assert "RuntimeMaxUse=100M" in active
        assert "MaxRetentionSec=30day" in active


class TestBackupConfiguration:
    """Backup должен быть регулярным, закрытым и проверяемым."""

    def test_backup_is_daily_and_persistent(self):
        timer = _active_lines(BACKUP_TIMER)
        assert "OnCalendar=*-*-* 02:30:00 UTC" in timer
        assert "Persistent=true" in timer

    def test_backup_service_is_hardened(self):
        service = _active_lines(BACKUP_SERVICE)
        assert "Type=oneshot" in service
        assert "UMask=0077" in service
        assert "NoNewPrivileges=true" in service
        assert "ProtectSystem=strict" in service
        assert "ReadWritePaths=/var/backups/aegis" in service

    def test_backup_checksums_and_retention(self):
        script = BACKUP_SCRIPT.read_text(encoding="utf-8")
        assert "set -euo pipefail" in script
        assert "pg_dump --format=custom" in script
        assert "sha256sum database.dump storage.tar.gz" in script
        assert "AEGIS_BACKUP_KEEP_DAYS" in script
        assert ".incomplete-" in script

    def test_restore_requires_integrity_check_and_safety_copy(self):
        document = RESTORE_DOC.read_text(encoding="utf-8")
        assert "sha256sum --check SHA256SUMS" in document
        assert "pre-restore-neon-stack.dump" in document
        assert "storage.before-restore-" in document
        assert "systemctl stop aegis aegis-worker" in document


class TestFailureAlerts:
    @pytest.mark.parametrize(
        "service_path",
        [BACKEND_SERVICE, WORKER_SERVICE, BACKUP_SERVICE],
    )
    def test_important_services_have_failure_handler(self, service_path):
        assert "OnFailure=aegis-alert@%n.service" in _active_lines(service_path)

    def test_notifier_is_hardened_and_throttled(self):
        active = _active_lines(ALERT_SERVICE)
        assert "User=www-data" in active
        assert "RuntimeDirectory=aegis-alerts" in active
        assert "NoNewPrivileges=true" in active
        assert "ProtectSystem=strict" in active
        assert "UMask=0077" in active
