"""Exporta a API /api/v1 como arquivos estáticos para hospedagem no GitHub Pages.

Sobe o app FastAPI em memória (TestClient), chama cada rota e grava a resposta
em disco. Como um host estático não resolve query string, os parâmetros viram
caminho: /api/v1/curves/DI_FUTURE/latest.json etc.

Uso: python export_static.py --out ../frontend/public --db sqlite:///./byc.db
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from fastapi.testclient import TestClient

from api_main import VALID_CURVE_TYPES, create_app


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _get_json(client: TestClient, url: str):
    res = client.get(url)
    res.raise_for_status()
    return res.json()


def export(db_url: str, out_dir: Path) -> int:
    app = create_app(db_url)
    root = out_dir / "api" / "v1"
    written = 0

    with TestClient(app) as client:
        _write(root / "health.json", json.dumps(_get_json(client, "/api/v1/health")))
        written += 1

        _write(root / "macro.json", json.dumps(_get_json(client, "/api/v1/macro")))
        written += 1

        for curve_type in VALID_CURVE_TYPES:
            base = root / "curves" / curve_type
            dates_payload = _get_json(client, f"/api/v1/curves/dates?curve_type={curve_type}")
            dates = dates_payload["dates"]
            _write(base / "dates.json", json.dumps(dates_payload))
            written += 1
            if not dates:
                continue

            latest = _get_json(client, f"/api/v1/curves/latest?curve_type={curve_type}")
            _write(base / "latest.json", json.dumps(latest))
            written += 1

            compare_latest = _get_json(client, f"/api/v1/curves/compare?curve_type={curve_type}")
            _write(base / "compare" / "latest.json", json.dumps(compare_latest))
            written += 1

            csv_latest = client.get(f"/api/v1/export/curve.csv?curve_type={curve_type}")
            csv_latest.raise_for_status()
            _write(root / "export" / curve_type / "latest.csv", csv_latest.text)
            written += 1

            for date in dates:
                curve = _get_json(client, f"/api/v1/curves/{date}?curve_type={curve_type}")
                _write(base / f"{date}.json", json.dumps(curve))
                cmp_date = _get_json(
                    client, f"/api/v1/curves/compare?curve_type={curve_type}&trade_date={date}"
                )
                _write(base / "compare" / f"{date}.json", json.dumps(cmp_date))
                csv_date = client.get(
                    f"/api/v1/export/curve.csv?curve_type={curve_type}&trade_date={date}"
                )
                csv_date.raise_for_status()
                _write(root / "export" / curve_type / f"{date}.csv", csv_date.text)
                written += 3

    return written


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="sqlite:///./byc.db")
    ap.add_argument("--out", default="../frontend/public", help="diretório de saída (public/ do Vite)")
    args = ap.parse_args()
    out_dir = Path(args.out).resolve()
    count = export(args.db, out_dir)
    print(f"export ok: {count} arquivos em {out_dir}")


if __name__ == "__main__":
    main()
