"""
Apply Supabase migrations.

Usage options:
  # Option A – Direct DB connection (fastest, needs DB password from dashboard)
  python apply_migrations.py --db-password YOUR_DB_PASSWORD

  # Option B – Supabase Management API (needs Personal Access Token from
  #             https://supabase.com/dashboard/account/tokens )
  python apply_migrations.py --access-token YOUR_PAT

  # Option C – Print combined SQL and open the SQL Editor URL (no extra creds needed)
  python apply_migrations.py --print-sql
"""

import argparse
import json
import os
import sys
import requests

# ── project constants ─────────────────────────────────────────
PROJECT_REF = "dbxigqzwgilcdojrqbzl"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieGlncXp3Z2lsY2RvanJxYnpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcxMTg5MiwiZXhwIjoyMDg5Mjg3ODkyfQ"
    ".A1DpZjz0ALfOUDwdR-yLsWAMoxSVGc-sEJ3AA1MYRjc"
)
DB_HOST = f"db.{PROJECT_REF}.supabase.co"
DB_PORT = 5432
DB_NAME = "postgres"
DB_USER = "postgres"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS = [
    os.path.join(BASE_DIR, "supabase", "migrations", "001_school_leads.sql"),
    os.path.join(BASE_DIR, "supabase", "migrations", "002_inep_schools.sql"),
    os.path.join(BASE_DIR, "supabase", "migrations", "003_pipeline_history.sql"),
    os.path.join(BASE_DIR, "supabase", "migrations", "004_phase1_production.sql"),
]


# ─── Strategy A: psycopg2 direct connection ───────────────────

def apply_via_psycopg2(db_password: str) -> bool:
    """Connect directly to Postgres and execute all migration files."""
    try:
        import psycopg2  # noqa: PLC0415
    except ImportError:
        print("psycopg2 not installed. Run:  pip install psycopg2-binary")
        return False

    dsn = (
        f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} "
        f"user={DB_USER} password={db_password} sslmode=require"
    )
    try:
        conn = psycopg2.connect(dsn, connect_timeout=10)
        conn.autocommit = True
        cur = conn.cursor()
        for path in MIGRATIONS:
            label = os.path.basename(path)
            with open(path, encoding="utf-8") as f:
                sql = f.read()
            print(f"  Applying {label} ...", end=" ", flush=True)
            cur.execute(sql)
            print("OK")
        cur.close()
        conn.close()
        return True
    except Exception as exc:
        print(f"\n  ERROR: {exc}")
        return False


# ─── Strategy B: Supabase Management API ─────────────────────

def apply_via_management_api(access_token: str) -> bool:
    """Apply migrations through the Supabase Management API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    for path in MIGRATIONS:
        label = os.path.basename(path)
        with open(path, encoding="utf-8") as f:
            sql = f.read()
        print(f"  Applying {label} ...", end=" ", flush=True)
        resp = requests.post(url, headers=headers, json={"query": sql}, timeout=30)
        if resp.status_code in (200, 201):
            print("OK")
        else:
            print(f"FAILED (HTTP {resp.status_code}): {resp.text[:200]}")
            return False
    return True


# ─── Strategy C: print combined SQL ──────────────────────────

def print_combined_sql() -> None:
    combined_path = os.path.join(BASE_DIR, "supabase", "combined_migrations.sql")
    parts = ["-- Wayzen School Intelligence – combined migrations\n"]
    for path in MIGRATIONS:
        label = os.path.basename(path)
        with open(path, encoding="utf-8") as f:
            parts.append(f"\n-- ===== {label} =====\n")
            parts.append(f.read())
    content = "\n".join(parts)
    with open(combined_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\nCombined SQL written to:\n  {combined_path}\n")
    print("Paste it in the Supabase SQL Editor:")
    print(f"  https://supabase.com/dashboard/project/{PROJECT_REF}/sql/new\n")


# ─── Verification ─────────────────────────────────────────────

def verify_tables() -> dict:
    url_base = f"https://{PROJECT_REF}.supabase.co/rest/v1"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    }
    tables = [
        "school_leads",
        "inep_schools",
        "pipeline_history",
        "school_source_snapshots",
        "school_source_snapshot_items",
        "school_lead_quality_audits",
    ]
    results = {}
    for t in tables:
        r = requests.get(f"{url_base}/{t}?select=*&limit=0", headers=headers, timeout=10)
        status = "OK" if r.status_code == 200 else f"MISSING (HTTP {r.status_code})"
        results[t] = status
        print(f"  {t}: {status}")
    return results


# ─── Main ─────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Apply Wayzen Supabase migrations")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--db-password", metavar="PASSWORD",
                       help="Postgres DB password (Settings > Database on dashboard)")
    group.add_argument("--access-token", metavar="PAT",
                       help="Supabase Personal Access Token (dashboard/account/tokens)")
    group.add_argument("--print-sql", action="store_true",
                       help="Write combined SQL to file and show SQL Editor URL")
    parser.add_argument("--verify-only", action="store_true",
                        help="Skip migrations, only check tables exist")
    args = parser.parse_args()

    print("Wayzen – Supabase Migration Applier")
    print(f"Project: {PROJECT_REF}\n")

    if args.verify_only:
        verify_tables()
        return

    if args.print_sql:
        print_combined_sql()
        print("\nRe-run with --verify-only after pasting SQL in editor.")
        return

    if args.db_password:
        print("Strategy: Direct psycopg2 connection")
        ok = apply_via_psycopg2(args.db_password)
    elif args.access_token:
        print("Strategy: Supabase Management API")
        ok = apply_via_management_api(args.access_token)
    else:
        # No flag – generate SQL and exit with instructions
        print_combined_sql()
        print("No credentials provided. Choose one of:")
        print("  python apply_migrations.py --db-password YOUR_PASSWORD")
        print("  python apply_migrations.py --access-token YOUR_PAT")
        print("  python apply_migrations.py --print-sql  (then paste in SQL Editor)")
        return

    if not ok:
        print("\nMigrations failed. Generating combined SQL as fallback...")
        print_combined_sql()
        sys.exit(1)

    print("\nVerifying tables...")
    results = verify_tables()
    if all(v == "OK" for v in results.values()):
        print("\nAll tables created successfully!")
        flag = os.path.join(BASE_DIR, ".migrations_applied")
        with open(flag, "w") as f:
            f.write("applied\n")
    else:
        print("\nSome tables still missing. Check error output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()

