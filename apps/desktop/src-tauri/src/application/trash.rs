use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::application::accounts::AccountsService;
use crate::application::attachments::AttachmentsService;
use crate::application::backup::BackupService;
use crate::application::broker_templates::BrokerTemplatesService;
use crate::application::intervals::IntervalsService;
use crate::application::strategies::StrategiesService;
use crate::application::trading_rules::TradingRulesService;
use crate::domain::trade::{Trade, TradeRepository};
use crate::error::AppError;

/// Rodzaj encji w uniwersalnym Koszu (Faza 5, rozszerzony w Fazie 8) - encje z własnym stanem
/// "zarchiwizowane/usunięte, ale nie znikło": konta, transakcje, strategie, własne interwały
/// oraz pytania z zakładki "Zasady handlu". Własne instrumenty i pojedyncze elementy zasad
/// strategii świadomie zostają poza tym zakresem (patrz PROGRESS.md) - pierwsze mają już
/// bezpieczne, natychmiastowe usuwanie blokowane dla używanych instrumentów, drugie są
/// zagnieżdżonymi polami bez własnej sygnatury czasowej, zarządzanymi wprost na ekranie
/// edycji strategii.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrashEntityType {
    Account,
    Trade,
    Strategy,
    Interval,
    TradingRule,
    Template,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrashItem {
    pub entity_type: TrashEntityType,
    pub id: String,
    pub label: String,
    pub deleted_at: DateTime<Utc>,
    /// Informacja o zależnościach (sekcja "info o zależnościach") - np. ile transakcji
    /// odwołuje się do tej strategii/tego konta. `None`, gdy nic na to nie wskazuje.
    pub dependency_note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EmptyTrashFailure {
    pub label: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct EmptyTrashResult {
    pub purged: usize,
    pub failed: Vec<EmptyTrashFailure>,
}

/// Warstwa aplikacyjna uniwersalnego Kosza - agreguje to, co już archiwizują/miękko usuwają
/// istniejące serwisy (konta, strategie, interwały) i repozytorium transakcji, w jedną listę.
/// Trzyma własny uchwyt do repozytorium transakcji (nie pełny `TradesService`) - operacje
/// kosza na transakcjach to proste odczyty/przywracanie/usuwanie, bez potrzeby orkiestracji
/// migawek instrumentu/strategii, którą `TradesService` robi tylko przy tworzeniu/edycji.
pub struct TrashService {
    accounts: Arc<AccountsService>,
    strategies: Arc<StrategiesService>,
    intervals: Arc<IntervalsService>,
    trades: Arc<dyn TradeRepository + Send + Sync>,
    attachments: Arc<AttachmentsService>,
    trading_rules: Arc<TradingRulesService>,
    broker_templates: Arc<BrokerTemplatesService>,
    backup: BackupService,
}

impl TrashService {
    // Konstruktor agreguje wszystkie serwisy, których dotyka uniwersalny Kosz - stąd naturalnie
    // przekracza domyślny próg clippy na liczbę argumentów.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        accounts: Arc<AccountsService>,
        strategies: Arc<StrategiesService>,
        intervals: Arc<IntervalsService>,
        trades: Arc<dyn TradeRepository + Send + Sync>,
        attachments: Arc<AttachmentsService>,
        trading_rules: Arc<TradingRulesService>,
        broker_templates: Arc<BrokerTemplatesService>,
        backup: BackupService,
    ) -> Self {
        Self {
            accounts,
            strategies,
            intervals,
            trades,
            attachments,
            trading_rules,
            broker_templates,
            backup,
        }
    }

    /// Nazwy plików zdjęć załączonych do jednej transakcji - zbierane PRZED trwałym usunięciem
    /// (które kaskadowo skasuje wiersze `attachments` w bazie), żeby fizyczne pliki dało się
    /// usunąć PO potwierdzonym sukcesie tamtej operacji (patrz `delete_permanently` poniżej).
    fn screenshot_files_for_trade(&self, trade_id: &str) -> Result<Vec<String>, AppError> {
        Ok(self
            .attachments
            .list_for_trade(trade_id)?
            .into_iter()
            .filter_map(|a| a.file_path)
            .collect())
    }

    /// JEDNO zapytanie zamiast osobnego na każdą transakcję konta.
    ///
    /// Wcześniej ta funkcja pobierała wszystkie transakcje konta i dla KAŻDEJ odpytywała bazę
    /// o załączniki. Przy koncie z tysiącami transakcji opróżnianie kosza zajmowało przez to
    /// kilkadziesiąt sekund, a aplikacja wyglądała na zawieszoną i bywała ubijana przez system.
    fn screenshot_files_for_account(&self, account_id: &str) -> Result<Vec<String>, AppError> {
        self.attachments.file_paths_for_account(account_id)
    }

    /// Wszystkie transakcje na wszystkich kontach (aktywnych i zarchiwizowanych), usunięte i
    /// nie - policzone raz i reużyte przy budowaniu listy Kosza oraz notatek o zależnościach,
    /// żeby nie odpytywać bazy wielokrotnie o to samo.
    fn all_trades(&self) -> Result<Vec<Trade>, AppError> {
        let accounts = self.accounts.list(true)?;
        let mut all = Vec::new();
        for account in &accounts {
            all.extend(self.trades.list(&account.account.id, true)?);
        }
        Ok(all)
    }

    pub fn list(&self) -> Result<Vec<TrashItem>, AppError> {
        let accounts = self.accounts.list(true)?;
        let all_trades = self.all_trades()?;
        let mut items = Vec::new();

        for account in &accounts {
            let Some(deleted_at) = account.account.archived_at else {
                continue;
            };
            let trade_count = all_trades
                .iter()
                .filter(|t| t.account_id == account.account.id)
                .count();
            items.push(TrashItem {
                entity_type: TrashEntityType::Account,
                id: account.account.id.clone(),
                label: account.account.name.clone(),
                deleted_at,
                dependency_note: (trade_count > 0).then(|| {
                    format!("Konto ma {trade_count} transakcji - trwałe usunięcie skasuje też je.")
                }),
            });
        }

        for trade in &all_trades {
            let Some(deleted_at) = trade.deleted_at else {
                continue;
            };
            let label = match &trade.instrument_spec_snapshot {
                Some(snapshot) => format!(
                    "Transakcja #{} ({})",
                    trade.display_number, snapshot.display_symbol
                ),
                None => format!("Transakcja #{}", trade.display_number),
            };
            items.push(TrashItem {
                entity_type: TrashEntityType::Trade,
                id: trade.id.clone(),
                label,
                deleted_at,
                dependency_note: None,
            });
        }

        for strategy in self.strategies.list(true)? {
            let Some(deleted_at) = strategy.archived_at else {
                continue;
            };
            let usage = all_trades
                .iter()
                .filter(|t| t.strategy_id.as_deref() == Some(strategy.id.as_str()))
                .count();
            items.push(TrashItem {
                entity_type: TrashEntityType::Strategy,
                id: strategy.id,
                label: strategy.name,
                deleted_at,
                dependency_note: (usage > 0).then(|| {
                    format!(
                        "Używana w {usage} transakcjach - trwałe usunięcie zablokowane, dopóki się to nie zmieni."
                    )
                }),
            });
        }

        for interval in self.intervals.list(true, true)? {
            let Some(deleted_at) = interval.archived_at else {
                continue;
            };
            let usage = all_trades
                .iter()
                .filter(|t| t.interval_id.as_deref() == Some(interval.id.as_str()))
                .count();
            items.push(TrashItem {
                entity_type: TrashEntityType::Interval,
                id: interval.id,
                label: interval.label,
                deleted_at,
                dependency_note: (usage > 0).then(|| {
                    format!(
                        "Użyty historycznie w {usage} transakcjach (ich zamrożona etykieta zostanie bez zmian)."
                    )
                }),
            });
        }

        for rule in self.trading_rules.get()?.rules {
            let Some(deleted_at) = rule.archived_at else {
                continue;
            };
            items.push(TrashItem {
                entity_type: TrashEntityType::TradingRule,
                id: rule.id,
                label: rule.question,
                deleted_at,
                dependency_note: rule.is_builtin.then(|| {
                    "Pytanie z szablonu - \"Przywróć szablon\" na zakładce Zasady handlu też może je odtworzyć.".to_string()
                }),
            });
        }

        for template in self.broker_templates.list(true)? {
            let Some(deleted_at) = template.archived_at else {
                continue;
            };
            items.push(TrashItem {
                entity_type: TrashEntityType::Template,
                id: template.id,
                label: format!("Szablon: {}", template.name),
                deleted_at,
                dependency_note: Some(format!(
                    "Zawiera {} instrumentów - trwałe usunięcie nie ruszy transakcji historycznych (ich zamrożone migawki zostają).",
                    template.instrument_count
                )),
            });
        }

        items.sort_by_key(|item| std::cmp::Reverse(item.deleted_at));
        Ok(items)
    }

    pub fn restore(&self, entity_type: TrashEntityType, id: &str) -> Result<(), AppError> {
        match entity_type {
            TrashEntityType::Account => self.accounts.restore(id).map(|_| ()),
            TrashEntityType::Trade => self.trades.restore(id).map(|_| ()),
            TrashEntityType::Strategy => self.strategies.restore(id).map(|_| ()),
            TrashEntityType::Interval => self.intervals.restore(id).map(|_| ()),
            TrashEntityType::TradingRule => self.trading_rules.restore_rule(id),
            TrashEntityType::Template => self.broker_templates.restore(id),
        }
    }

    /// Fizyczne pliki zdjęć są usuwane z dysku dopiero PO potwierdzonym sukcesie trwałego
    /// usunięcia konta/transakcji w bazie - nigdy przed, żeby nieudana operacja na bazie nie
    /// zostawiła wiersza wskazującego na już nieistniejący plik.
    pub fn delete_permanently(
        &self,
        entity_type: TrashEntityType,
        id: &str,
    ) -> Result<(), AppError> {
        match entity_type {
            TrashEntityType::Account => {
                let files = self.screenshot_files_for_account(id)?;
                self.accounts.delete_permanently(id)?;
                self.attachments.purge_physical_files(files);
                Ok(())
            }
            TrashEntityType::Trade => {
                let files = self.screenshot_files_for_trade(id)?;
                self.trades.delete_permanently(id)?;
                self.attachments.purge_physical_files(files);
                Ok(())
            }
            TrashEntityType::Strategy => self.strategies.delete_permanently(id),
            TrashEntityType::Interval => self.intervals.delete_permanently(id),
            TrashEntityType::TradingRule => self.trading_rules.delete_rule_permanently(id),
            TrashEntityType::Template => self.broker_templates.delete_permanently(id),
        }
    }

    /// Opróżnia cały Kosz: najpierw twarda kopia zapasowa (przerywa całą operację, jeśli się
    /// nie uda - nigdy nie czyścimy nieodwracalnie bez świeżej kopii), potem trwałe usunięcie
    /// każdego elementu. Konta są usuwane na końcu, bo ich usunięcie kaskadowo zabiera też
    /// transakcje - gdyby poszły pierwsze, próba osobnego usunięcia "ich" transakcji (jeśli też
    /// były niezależnie w Koszu) fałszywie wyglądałaby jak błąd (already gone). Pojedyncze
    /// niepowodzenia (np. strategia wciąż używana w żywej transakcji) nie przerywają reszty -
    /// zbierane są do `failed`, żeby użytkownik widział dokładnie, co się nie udało i dlaczego.
    pub fn empty(&self) -> Result<EmptyTrashResult, AppError> {
        self.backup.create_automatic_backup("kosz")?;

        let mut items = self.list()?;
        items.sort_by_key(|item| matches!(item.entity_type, TrashEntityType::Account));

        let mut purged = 0;
        let mut failed = Vec::new();
        for item in items {
            match self.delete_permanently(item.entity_type, &item.id) {
                Ok(()) => purged += 1,
                Err(err) => failed.push(EmptyTrashFailure {
                    label: item.label,
                    message: err.to_string(),
                }),
            }
        }
        Ok(EmptyTrashResult { purged, failed })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use crate::domain::account::NewAccount;
    use crate::domain::strategy::{StrategyInput, StrategyRepository};
    use crate::domain::trade::{TradeInput, TradeSide};
    use crate::infrastructure::sqlite_account_repository::SqliteAccountRepository;
    use crate::infrastructure::sqlite_attachment_repository::SqliteAttachmentRepository;
    use crate::infrastructure::sqlite_cash_operation_repository::SqliteCashOperationRepository;
    use crate::infrastructure::sqlite_interval_repository::SqliteIntervalRepository;
    use crate::infrastructure::sqlite_strategy_repository::SqliteStrategyRepository;
    use crate::infrastructure::sqlite_trade_repository::SqliteTradeRepository;
    use crate::infrastructure::sqlite_trading_rules_repository::SqliteTradingRulesRepository;
    use rust_decimal_macros::dec;
    use std::sync::Mutex;

    fn setup() -> (TrashService, Arc<AccountsService>, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("db.sqlite3");
        let mut conn = connection::open(&db_path).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));

        let accounts = Arc::new(AccountsService::new(
            Arc::new(SqliteAccountRepository::new(conn.clone())),
            Arc::new(SqliteCashOperationRepository::new(conn.clone())),
            Arc::new(SqliteTradeRepository::new(conn.clone())),
        ));
        let strategies = Arc::new(StrategiesService::new(Arc::new(
            SqliteStrategyRepository::new(conn.clone()),
        )));
        let intervals = Arc::new(IntervalsService::new(Arc::new(
            SqliteIntervalRepository::new(conn.clone()),
        )));
        let trades: Arc<dyn TradeRepository + Send + Sync> =
            Arc::new(SqliteTradeRepository::new(conn.clone()));
        let attachments = Arc::new(AttachmentsService::new(
            Arc::new(SqliteAttachmentRepository::new(conn.clone())),
            dir.path().to_path_buf(),
        ));
        let trading_rules = Arc::new(TradingRulesService::new(Arc::new(
            SqliteTradingRulesRepository::new(conn.clone()),
        )));
        let broker_templates = Arc::new(BrokerTemplatesService::new(
            Arc::new(
                crate::infrastructure::sqlite_broker_template_repository::SqliteBrokerTemplateRepository::new(
                    conn.clone(),
                ),
            ),
        ));
        let backup = BackupService::new(conn.clone(), dir.path().to_path_buf());

        let trash = TrashService::new(
            accounts.clone(),
            strategies,
            intervals,
            trades,
            attachments,
            trading_rules,
            broker_templates,
            backup,
        );

        (trash, accounts, dir)
    }

    fn create_account(accounts: &AccountsService, name: &str) -> String {
        accounts
            .create(NewAccount {
                name: name.to_string(),
                description: None,
                account_type: None,
                currency: "USD".to_string(),
                initial_balance: dec!(1000),
            })
            .expect("create account")
            .account
            .id
    }

    #[test]
    fn list_is_empty_when_nothing_is_trashed() {
        let (trash, accounts, _dir) = setup();
        create_account(&accounts, "Konto aktywne");

        assert!(trash.list().expect("list").is_empty());
    }

    #[test]
    fn list_includes_an_archived_account() {
        let (trash, accounts, _dir) = setup();
        let id = create_account(&accounts, "Konto do kosza");
        accounts.archive(&id).expect("archive");

        let items = trash.list().expect("list");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].entity_type, TrashEntityType::Account);
        assert_eq!(items[0].label, "Konto do kosza");
    }

    #[test]
    fn restore_and_delete_permanently_dispatch_to_the_right_entity() {
        let (trash, accounts, _dir) = setup();
        let id = create_account(&accounts, "Konto testowe");
        accounts.archive(&id).expect("archive");
        assert_eq!(trash.list().expect("list").len(), 1);

        trash
            .restore(TrashEntityType::Account, &id)
            .expect("restore via trash service");
        assert!(trash.list().expect("list after restore").is_empty());

        accounts.archive(&id).expect("archive again");
        trash
            .delete_permanently(TrashEntityType::Account, &id)
            .expect("purge via trash service");
        assert!(accounts.get(&id).is_err());
    }

    #[test]
    fn empty_purges_everything_and_creates_a_backup_first() {
        let (trash, accounts, dir) = setup();
        let id = create_account(&accounts, "Konto do wyczyszczenia");
        accounts.archive(&id).expect("archive");

        let result = trash.empty().expect("empty trash");
        assert_eq!(result.purged, 1);
        assert!(result.failed.is_empty());
        assert!(trash.list().expect("list after empty").is_empty());

        let backup_dir = dir.path().join("backups");
        let backups: Vec<_> = std::fs::read_dir(&backup_dir)
            .expect("read backups dir")
            .collect();
        assert_eq!(
            backups.len(),
            1,
            "opróżnienie kosza powinno zostawić dokładnie jedną automatyczną kopię zapasową"
        );
    }

    #[test]
    fn empty_orders_trades_before_their_own_account_to_avoid_a_false_failure() {
        let (trash, accounts, conn_dir) = setup();
        let account_id = create_account(&accounts, "Konto z transakcją");

        let trade_conn = Arc::new(Mutex::new(
            connection::open(&conn_dir.path().join("db.sqlite3")).expect("reopen"),
        ));
        let trade_repo = SqliteTradeRepository::new(trade_conn);
        let trade = trade_repo
            .create(&crate::domain::trade::TradeWrite {
                input: TradeInput {
                    account_id: account_id.clone(),
                    instrument_id: None,
                    strategy_id: None,
                    side: TradeSide::Buy,
                    opened_at: None,
                    closed_at: None,
                    interval_id: None,
                    session: None,
                    volume: None,
                    entry_price: None,
                    stop_loss: None,
                    take_profit: None,
                    exit_price: None,
                    commission: dec!(0),
                    swap: dec!(0),
                    other_fees: dec!(0),
                    conversion_rate: None,
                    plan_before: None,
                    management_notes: None,
                    post_trade_summary: None,
                    conclusion: None,
                    plan_adherence_rating: None,
                    pnl_override: None,
                    emotions: None,
                    checklist: None,
                    partial_closes: vec![],
                },
                calculation: crate::domain::trade_calculations::TradeCalculation::default(),
                instrument_snapshot: None,
                strategy_snapshot: None,
                interval_snapshot: None,
            })
            .expect("create trade");
        trade_repo
            .soft_delete(&trade.id)
            .expect("soft delete trade");
        accounts.archive(&account_id).expect("archive account");

        // Kosz zawiera oba: konto ORAZ jego własną (niezależnie usuniętą) transakcję.
        assert_eq!(trash.list().expect("list").len(), 2);

        let result = trash
            .empty()
            .expect("empty should not report a false failure");
        assert_eq!(result.purged, 2);
        assert!(
            result.failed.is_empty(),
            "usunięcie transakcji przed jej kontem nie powinno dawać błędu \"already gone\": {:?}",
            result.failed
        );
    }

    #[test]
    fn empty_reports_a_strategy_that_could_not_be_purged_without_failing_the_rest() {
        let (trash, accounts, conn_dir) = setup();
        let account_id = create_account(&accounts, "Konto");

        let strategy_conn = Arc::new(Mutex::new(
            connection::open(&conn_dir.path().join("db.sqlite3")).expect("reopen"),
        ));
        let strategies_repo = SqliteStrategyRepository::new(strategy_conn.clone());
        let strategy = strategies_repo
            .create(&StrategyInput {
                name: "Breakout".to_string(),
                description: None,
                color: None,
                entry_rules: vec![],
                management_rules: vec![],
                tags: vec![],
            })
            .expect("create strategy");
        strategies_repo
            .archive(&strategy.id)
            .expect("archive strategy");

        // Żywa (nieusunięta) transakcja wciąż odwołuje się do tej strategii - jej trwałe
        // usunięcie musi zostać zablokowane przez SqliteStrategyRepository.
        strategy_conn
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO trades (id, account_id, display_number, strategy_id, status, side, created_at, updated_at)
                 VALUES ('trade-1', ?1, 1, ?2, 'draft', 'buy', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![account_id, strategy.id],
            )
            .expect("seed live trade referencing the strategy");

        let result = trash
            .empty()
            .expect("empty should complete despite one failure");
        assert_eq!(result.purged, 0);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].label, "Breakout");
    }

    const PNG_TEST_BYTES: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    ];

    #[test]
    fn an_archived_trading_rule_shows_up_in_trash_and_can_be_restored_and_purged() {
        let (trash, _accounts, dir) = setup();

        // Zarchiwizuj jedno pytanie wprost w bazie (ta sama ścieżka, którą zapisałby bulk save).
        let conn = connection::open(&dir.path().join("db.sqlite3")).expect("reopen");
        conn.execute(
            "UPDATE trading_rules SET archived_at = '2026-07-21T10:00:00Z'
             WHERE question = 'W jakich godzinach handluję?'",
            [],
        )
        .expect("archive rule");
        let rule_id: String = conn
            .query_row(
                "SELECT id FROM trading_rules WHERE question = 'W jakich godzinach handluję?'",
                [],
                |r| r.get(0),
            )
            .expect("rule id");
        drop(conn);

        let items = trash.list().expect("list");
        let item = items
            .iter()
            .find(|i| i.entity_type == TrashEntityType::TradingRule)
            .expect("pytanie w Koszu");
        assert_eq!(item.label, "W jakich godzinach handluję?");
        assert!(
            item.dependency_note.is_some(),
            "szablon ma notatkę o przywracaniu"
        );

        trash
            .restore(TrashEntityType::TradingRule, &rule_id)
            .expect("restore");
        assert!(trash
            .list()
            .expect("list")
            .iter()
            .all(|i| i.entity_type != TrashEntityType::TradingRule));

        let conn = connection::open(&dir.path().join("db.sqlite3")).expect("reopen");
        conn.execute(
            "UPDATE trading_rules SET archived_at = '2026-07-21T10:00:00Z' WHERE id = ?1",
            [&rule_id],
        )
        .expect("archive again");
        drop(conn);
        trash
            .delete_permanently(TrashEntityType::TradingRule, &rule_id)
            .expect("purge");
        let conn = connection::open(&dir.path().join("db.sqlite3")).expect("reopen");
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM trading_rules WHERE id = ?1",
                [&rule_id],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(count, 0);
    }

    #[test]
    fn delete_permanently_removes_the_physical_screenshot_file_for_a_trade() {
        let (trash, accounts, dir) = setup();
        let account_id = create_account(&accounts, "Konto");

        let conn = Arc::new(Mutex::new(
            connection::open(&dir.path().join("db.sqlite3")).expect("reopen"),
        ));
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO trades (id, account_id, display_number, status, side, deleted_at, created_at, updated_at)
                 VALUES ('trade-1', ?1, 1, 'draft', 'buy', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [&account_id],
            )
            .expect("seed soft-deleted trade");

        let attachments = AttachmentsService::new(
            Arc::new(SqliteAttachmentRepository::new(conn.clone())),
            dir.path().to_path_buf(),
        );
        let created = attachments
            .add_screenshot_from_bytes("trade-1", PNG_TEST_BYTES.to_vec(), None)
            .expect("store screenshot");
        let file_path = dir
            .path()
            .join("attachments")
            .join(created.file_path.as_ref().unwrap());
        assert!(file_path.exists());

        trash
            .delete_permanently(TrashEntityType::Trade, "trade-1")
            .expect("purge trade");

        assert!(!file_path.exists());
    }

    #[test]
    fn delete_permanently_removes_screenshot_files_owned_by_a_purged_account() {
        let (trash, accounts, dir) = setup();
        let account_id = create_account(&accounts, "Konto do usunięcia");

        let conn = Arc::new(Mutex::new(
            connection::open(&dir.path().join("db.sqlite3")).expect("reopen"),
        ));
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO trades (id, account_id, display_number, status, side, created_at, updated_at)
                 VALUES ('trade-1', ?1, 1, 'draft', 'buy', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [&account_id],
            )
            .expect("seed live trade under the account");

        let attachments = AttachmentsService::new(
            Arc::new(SqliteAttachmentRepository::new(conn.clone())),
            dir.path().to_path_buf(),
        );
        let created = attachments
            .add_screenshot_from_bytes("trade-1", PNG_TEST_BYTES.to_vec(), None)
            .expect("store screenshot");
        let file_path = dir
            .path()
            .join("attachments")
            .join(created.file_path.as_ref().unwrap());
        assert!(file_path.exists());

        accounts.archive(&account_id).expect("archive account");
        trash
            .delete_permanently(TrashEntityType::Account, &account_id)
            .expect("purge account");

        assert!(!file_path.exists());
    }
}
