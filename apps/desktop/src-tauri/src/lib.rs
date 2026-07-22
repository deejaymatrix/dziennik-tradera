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
use application::attachments::AttachmentsService;
use application::backup::BackupService;
use application::broker_templates::BrokerTemplatesService;
use application::emotional_states::EmotionalStatesService;
use application::export::ExportService;
use application::instrument_import::InstrumentImportService;
use application::instruments::InstrumentsService;
use application::intervals::IntervalsService;
use application::reports::ReportsService;
use application::strategies::StrategiesService;
use application::trades::TradesService;
use application::trading_rules::TradingRulesService;
use application::trash::TrashService;
use infrastructure::sqlite_account_repository::SqliteAccountRepository;
use infrastructure::sqlite_attachment_repository::SqliteAttachmentRepository;
use infrastructure::sqlite_broker_template_repository::SqliteBrokerTemplateRepository;
use infrastructure::sqlite_cash_operation_repository::SqliteCashOperationRepository;
use infrastructure::sqlite_emotional_state_repository::SqliteEmotionalStateRepository;
use infrastructure::sqlite_instrument_repository::SqliteInstrumentRepository;
use infrastructure::sqlite_interval_repository::SqliteIntervalRepository;
use infrastructure::sqlite_strategy_repository::SqliteStrategyRepository;
use infrastructure::sqlite_trade_repository::SqliteTradeRepository;
use infrastructure::sqlite_trading_rules_repository::SqliteTradingRulesRepository;
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

    match infrastructure::backup_archive::apply_pending_restore_if_present(
        app_data_dir,
        &db_path,
        &backup_dir,
        env!("CARGO_PKG_VERSION"),
    ) {
        Ok(true) => logging::log_info(
            "db_init",
            "zastosowano oczekujące przywrócenie kopii zapasowej z poprzedniej sesji",
        ),
        Ok(false) => {}
        Err(err) => {
            let reason = format!("przywrócenie kopii zapasowej nie powiodło się: {err}");
            logging::log_error("db_init", &err);
            return DbState::Failed { reason };
        }
    }

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
    let accounts = Arc::new(AccountsService::new(
        Arc::new(SqliteAccountRepository::new(conn.clone())),
        Arc::new(SqliteCashOperationRepository::new(conn.clone())),
        Arc::new(SqliteTradeRepository::new(conn.clone())),
    ));
    let instruments = Arc::new(InstrumentsService::new(Arc::new(
        SqliteInstrumentRepository::new(conn.clone()),
    )));
    let strategies = Arc::new(StrategiesService::new(Arc::new(
        SqliteStrategyRepository::new(conn.clone()),
    )));
    let intervals = Arc::new(IntervalsService::new(Arc::new(
        SqliteIntervalRepository::new(conn.clone()),
    )));
    let trades = TradesService::new(
        Arc::new(SqliteTradeRepository::new(conn.clone())),
        Arc::new(SqliteTradeRepository::new(conn.clone())),
        accounts.clone(),
        instruments.clone(),
        strategies.clone(),
        intervals.clone(),
    );
    let reports = ReportsService::new(
        Arc::new(SqliteTradeRepository::new(conn.clone())),
        accounts.clone(),
    );
    let export = ExportService::new(
        Arc::new(SqliteTradeRepository::new(conn.clone())),
        accounts.clone(),
    );
    let backup = BackupService::new(conn.clone(), app_data_dir.to_path_buf());
    let emotional_states =
        EmotionalStatesService::new(Arc::new(SqliteEmotionalStateRepository::new(conn.clone())));
    let attachments = Arc::new(AttachmentsService::new(
        Arc::new(SqliteAttachmentRepository::new(conn.clone())),
        app_data_dir.to_path_buf(),
    ));
    let trading_rules = Arc::new(TradingRulesService::new(Arc::new(
        SqliteTradingRulesRepository::new(conn.clone()),
    )));
    let broker_template_repo = Arc::new(SqliteBrokerTemplateRepository::new(conn.clone()));
    let broker_templates = Arc::new(BrokerTemplatesService::new(broker_template_repo.clone()));
    let instrument_import = InstrumentImportService::new(broker_template_repo.clone());
    // Uzgodnienia startowego kopiującego szablon dla każdego konta CELOWO już nie ma. Istniało
    // wyłącznie po to, żeby spełnić dawną regułę "jeden szablon = jedno konto" (migracja 0011
    // odwróciła powiązanie i wiele kont może dzielić szablon), a przy okazji podejmowałoby za
    // użytkownika decyzję, której nie da się cofnąć. Konto bez szablonu zostaje bez szablonu,
    // a interfejs poprowadzi do jego wybrania.
    let trash = TrashService::new(
        accounts.clone(),
        strategies.clone(),
        intervals.clone(),
        Arc::new(SqliteTradeRepository::new(conn.clone())),
        attachments.clone(),
        trading_rules.clone(),
        broker_templates.clone(),
        BackupService::new(conn.clone(), app_data_dir.to_path_buf()),
    );

    DbState::Ready {
        conn,
        db_path,
        accounts,
        instruments,
        strategies,
        intervals,
        trades,
        reports,
        export,
        backup,
        emotional_states,
        attachments,
        trading_rules,
        broker_templates,
        instrument_import,
        trash,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

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
            commands::instruments::get_instrument,
            commands::instruments::list_instruments,
            commands::instruments::update_instrument_version,
            commands::instruments::reset_instrument_to_factory,
            commands::instruments::set_instrument_visibility,
            commands::instruments::set_instruments_visibility_bulk,
            commands::instruments::reorder_instruments,
            commands::instruments::reset_instrument_visibility_to_default,
            commands::instruments::delete_instrument,
            commands::intervals::create_interval,
            commands::intervals::get_interval,
            commands::intervals::list_intervals,
            commands::intervals::update_interval_label,
            commands::intervals::set_interval_hidden,
            commands::intervals::archive_interval,
            commands::intervals::restore_interval,
            commands::intervals::reorder_intervals,
            commands::strategies::create_strategy,
            commands::strategies::get_strategy,
            commands::strategies::list_strategies,
            commands::strategies::update_strategy,
            commands::strategies::duplicate_strategy,
            commands::strategies::archive_strategy,
            commands::strategies::restore_strategy,
            commands::trades::preview_trade,
            commands::trades::create_trade,
            commands::trades::get_trade,
            commands::trades::list_trades,
            commands::trades::update_trade,
            commands::trades::soft_delete_trade,
            commands::trades::restore_trade,
            commands::trades::get_trade_balance_context,
            commands::trades::list_trade_audit_log,
            commands::reports::get_account_report,
            commands::reports::get_filtered_report,
            commands::reports::compare_accounts_report,
            commands::export::export_trades_csv,
            commands::export::export_trades_xlsx,
            commands::export::export_trades_pdf,
            commands::backup::create_backup,
            commands::backup::prepare_backup_restore,
            commands::emotional_states::create_emotional_state,
            commands::emotional_states::list_emotional_states,
            commands::emotional_states::set_emotional_state_hidden,
            commands::emotional_states::delete_emotional_state,
            commands::trash::list_trash_items,
            commands::trash::restore_trash_item,
            commands::trash::purge_trash_item,
            commands::trash::empty_trash,
            commands::attachments::list_attachments,
            commands::attachments::add_screenshot_attachment_from_path,
            commands::attachments::add_screenshot_attachment_from_bytes,
            commands::attachments::add_link_attachment,
            commands::attachments::update_attachment_label,
            commands::attachments::reorder_attachments,
            commands::attachments::delete_attachment,
            commands::attachments::read_attachment_image,
            commands::attachments::read_screenshot_candidate,
            commands::trading_rules::get_trading_rules,
            commands::trading_rules::save_trading_rules,
            commands::trading_rules::restore_trading_rule_templates,
            commands::broker_templates::list_broker_templates,
            commands::broker_templates::create_broker_template,
            commands::broker_templates::rename_broker_template,
            commands::broker_templates::duplicate_broker_template,
            commands::broker_templates::assign_broker_template,
            commands::broker_templates::unassign_broker_template,
            commands::broker_templates::archive_broker_template,
            commands::instrument_import::preview_broker_import,
            commands::instrument_import::import_broker_template,
            commands::instrument_import::import_instruments_into_template,
            commands::position_sizing::calculate_position_size,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
