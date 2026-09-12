"""
便利腳本：自動生成 Alembic 遷移檔案

使用方式：
  python generate_migration.py "add_column_foo_to_bar"

等同於：
  alembic revision --autogenerate -m "add_column_foo_to_bar"
"""
import sys
import subprocess

if len(sys.argv) < 2:
    print("用法: python generate_migration.py <遷移描述>")
    print("範例: python generate_migration.py 'add index on alerts.severity'")
    sys.exit(1)

msg = sys.argv[1]
subprocess.run(["alembic", "revision", "--autogenerate", "-m", msg], check=True)
