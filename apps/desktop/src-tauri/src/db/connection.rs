use std::path::Path;

use rusqlite::Connection;

/// Otwiera połączenie SQLite z ustawieniami bezpiecznymi dla lokalnej aplikacji
/// jednoużytkownikowej: WAL (odporność na przerwanie zapisu), wymuszone klucze obce,
/// oraz limit oczekiwania na blokadę zamiast natychmiastowego błędu "database is locked".
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enables_foreign_keys_and_wal() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.sqlite3");
        let conn = open(&db_path).expect("open");

        let foreign_keys: i64 = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .expect("read foreign_keys pragma");
        assert_eq!(foreign_keys, 1);

        let journal_mode: String = conn
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .expect("read journal_mode pragma");
        assert_eq!(journal_mode.to_lowercase(), "wal");
    }
}
