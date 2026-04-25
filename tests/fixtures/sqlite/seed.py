from pathlib import Path
import sqlite3


fixture_path = Path(__file__).with_name("universality.sqlite3")

with sqlite3.connect(fixture_path) as connection:
    connection.execute(
        """
        create table if not exists accounts (
          id integer primary key,
          name text not null,
          status text not null,
          updated_at text not null
        )
        """
    )
    connection.execute("delete from accounts")
    connection.executemany(
        "insert into accounts (id, name, status, updated_at) values (?, ?, ?, datetime('now'))",
        [
            (1, "Northwind", "active"),
            (2, "Contoso", "active"),
            (3, "Fabrikam", "paused"),
        ],
    )
    connection.commit()

print(f"Seeded SQLite fixture at {fixture_path}")
