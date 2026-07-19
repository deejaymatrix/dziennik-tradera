use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::application::accounts::AccountsService;
use crate::application::backup::BackupService;
use crate::application::export::ExportService;
use crate::application::instruments::InstrumentsService;
use crate::application::reports::ReportsService;
use crate::application::strategies::StrategiesService;
use crate::application::trades::TradesService;

/// Stan bazy danych po próbie otwarcia przy starcie aplikacji. Rozmyślnie nie ma wariantu
/// "prawdopodobnie gotowe" - albo baza jest otwarta i zmigrowana (`Ready`), albo nie (`Failed`
/// z czytelnym powodem). Komendy nigdy nie udają sukcesu, gdy baza nie działa.
///
/// `accounts`/`instruments`/`strategies` są w `Arc`, bo `TradesService` trzyma do nich
/// współdzielone odniesienia (buduje migawki instrumentu/strategii i pobiera saldo konta przy
/// każdym zapisie transakcji) - bez `Arc` byłoby to samopożyczenie pola siostrzanego w tej samej
/// strukturze, czego Rust nie pozwala bez unsafe.
pub enum DbState {
    Ready {
        conn: Arc<Mutex<Connection>>,
        db_path: PathBuf,
        accounts: Arc<AccountsService>,
        instruments: Arc<InstrumentsService>,
        strategies: Arc<StrategiesService>,
        trades: TradesService,
        reports: ReportsService,
        export: ExportService,
        backup: BackupService,
    },
    Failed {
        reason: String,
    },
}

pub struct AppState {
    pub db: DbState,
}
