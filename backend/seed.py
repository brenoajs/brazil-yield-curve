"""Seed CLI: popula o banco com histórico mockado.

Uso: python seed.py [--days 10] [--db sqlite:///./byc.db]
"""
from __future__ import annotations

import argparse

from ingestor import seed_history
from models import init_db, make_engine, make_session_factory


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=10)
    ap.add_argument("--db", default="sqlite:///./byc.db")
    args = ap.parse_args()
    engine = make_engine(args.db)
    init_db(engine)
    with make_session_factory(engine)() as session:
        dates = seed_history(session, days=args.days)
    print(f"seed ok: {len(dates)} pregões: {[str(d) for d in dates]}")


if __name__ == "__main__":
    main()
