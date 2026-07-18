use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::application::accounts::AccountsService;
use crate::application::instruments::InstrumentsService;

/// Stan bazy danych po próbie otwarcia przy starcie aplikacji. Rozmyślnie nie ma wariantu
/// "prawdopodobnie gotowe" - albo baza jest otwarta i zmigrowana (`Ready`), albo nie (`Failed`
/// z czytelnym powodem). Komendy nigdy nie udają sukcesu, gdy baza nie działa.
pub enum DbState {
    Ready {
        conn: Arc<Mutex<Connection>>,
        db_path: PathBuf,
        accounts: AccountsService,
        instruments: InstrumentsService,
    },
    Failed {
        reason: String,
    },
}

pub struct AppState {
    pub db: DbState,
}
