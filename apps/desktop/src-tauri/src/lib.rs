mod application;
mod commands;
mod db;
mod diagnostics;
mod domain;
mod error;
mod infrastructure;
mod logging;
mod state;

use std::sync::{Arc, Mutex};

use tauri::Manager;

use application::accounts::AccountsService;
use application::instruments::InstrumentsService;
use infrastructure::sqlite_account_repository::SqliteAccountRepository;
use infrastructure::sqlite_cash_operation_repository::SqliteCashOperationRepository;
use infrastructure::sqlite_instrument_repository::SqliteInstrumentRepository;
use state::{AppState, DbState};

fn init_db_state(app_data_dir: &std::path::Path) -> DbState {
    if let Err(err) = std::fs::create_dir_all(app_data_dir) {
        let reason = format!("nie można utworzyć katalogu danych aplikacji: {err}");
        logging::log_error("db_init", &reason);
        return DbState::Failed { reason };
    }

    logging::init(app_data_dir);

    let db_path = app_data_dir.join(db::APP_DB_FILENAME);
    let backup_dir = app_data_dir.join("backups");

    let mut conn = match db::connection::open(&db_path) {
        Ok(conn) => conn,
        Err(err) => {
            let reason = format!("nie można otworzyć bazy danych: {err}");
            logging::log_error("db_init", &err);
            return DbState::Failed { reason };
        }
    };

    match db::migrations::run_migrations(&mut conn, &backup_dir) {
        Ok(report) if !report.applied.is_empty() => {
            let backup_note = report
                .backup_path
                .as_ref()
                .map(|p| format!(", kopia zapasowa: {}", p.display()))
                .unwrap_or_default();
            logging::log_info(
                "db_init",
                &format!("zastosowano migracje {:?}{backup_note}", report.applied),
            );
        }
        Ok(_) => {}
        Err(err) => {
            let reason = format!("migracja bazy danych nie powiodła się: {err}");
            logging::log_error("db_init", &err);
            return DbState::Failed { reason };
        }
    }

    let conn = Arc::new(Mutex::new(conn));
    let accounts = AccountsService::new(
        Arc::new(SqliteAccountRepository::new(conn.clone())),
        Arc::new(SqliteCashOperationRepository::new(conn.clone())),
    );
    let instruments =
        InstrumentsService::new(Arc::new(SqliteInstrumentRepository::new(conn.clone())));

    DbState::Ready {
        conn,
        db_path,
        accounts,
        instruments,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("nie można ustalić katalogu danych aplikacji");
            let db_state = init_db_state(&app_data_dir);
            app.manage(AppState { db: db_state });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            diagnostics::get_app_status,
            diagnostics::get_database_status,
            commands::accounts::create_account,
            commands::accounts::get_account,
            commands::accounts::list_accounts,
            commands::accounts::update_account,
            commands::accounts::archive_account,
            commands::accounts::restore_account,
            commands::accounts::create_cash_operation,
            commands::accounts::list_cash_operations,
            commands::instruments::create_instrument,
            commands::instruments::list_instruments,
            commands::instruments::update_instrument,
            commands::instruments::deactivate_instrument,
            commands::instruments::activate_instrument,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
