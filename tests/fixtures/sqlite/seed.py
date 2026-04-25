from pathlib import Path
import sqlite3


fixture_path = Path(__file__).with_name("universality.sqlite3")
PERF_ROW_COUNT = 100_000

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
    connection.execute(
        """
        create table if not exists perf_events (
          id integer primary key,
          account_id integer not null,
          region text not null,
          event_name text not null,
          amount real not null,
          created_at text not null
        )
        """
    )
    connection.execute(
        "create index if not exists perf_events_account_created_idx on perf_events (account_id, created_at)"
    )
    connection.execute("create index if not exists perf_events_region_idx on perf_events (region)")
    connection.execute("delete from perf_events")
    connection.executemany(
        """
        insert into perf_events (
          id,
          account_id,
          region,
          event_name,
          amount,
          created_at
        ) values (?, ?, ?, ?, ?, datetime('now', ? || ' seconds'))
        """,
        (
            (
                row_id,
                (row_id % 250) + 1,
                ["eu-west-1", "us-east-1", "ap-southeast-1", "af-south-1", "local"][
                    row_id % 5
                ],
                [
                    "order.created",
                    "order.updated",
                    "inventory.adjusted",
                    "session.heartbeat",
                ][row_id % 4],
                round((row_id % 10000) / 3 + 10, 2),
                -(row_id % 43200),
            )
            for row_id in range(1, PERF_ROW_COUNT + 1)
        ),
    )
    connection.commit()

print(f"Seeded SQLite fixture at {fixture_path}")
