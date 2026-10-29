import os
from sqlalchemy import MetaData, create_engine
from sqlalchemy.schema import CreateTable
//postgresql://postgres.gbrjeyhmeivljxlidoma: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@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
DB_URL = ""

engine = create_engine(DB_URL)
metadata = MetaData(schema="public")

# Nạp cấu trúc của tất cả các bảng trong schema public
metadata.reflect(bind=engine)

os.makedirs("supabase_backup", exist_ok=True)
sql_file_path = "supabase_backup/schema_create_tables.sql"

with open(sql_file_path, "w", encoding="utf-8") as f:
    for table_name, table in metadata.tables.items():
        # Dịch schema thành câu lệnh CREATE TABLE theo chuẩn PostgreSQL
        create_stmt = str(CreateTable(table).compile(engine))
        f.write(f"-- Table: {table_name}\n")
        f.write(create_stmt.strip() + ";\n\n")

print(f"Hoàn tất! Các câu lệnh tạo bảng đã được lưu tại: {sql_file_path}")