use std::sync::Arc;

use crate::domain::preferences::{Preferences, PreferencesRepository, PreferencesSection};
use crate::error::AppError;

/// Warstwa aplikacyjna preferencji. Cała jej wartość to jedna rzecz: zapis JEDNEJ sekcji jest
/// atomowy i nie może po drodze zgubić ani nadpisać pozostałych sekcji.
pub struct PreferencesService {
    repository: Arc<dyn PreferencesRepository + Send + Sync>,
}

impl PreferencesService {
    pub fn new(repository: Arc<dyn PreferencesRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn get(&self) -> Result<Preferences, AppError> {
        self.repository.load()
    }

    /// Zapisuje wyłącznie wskazaną sekcję z przysłanego kompletu preferencji.
    ///
    /// Reszta sekcji brana jest z tego, co JEST W BAZIE, a nie z tego, co przysłał formularz.
    /// To celowe: gdyby wziąć całość od klienta, dwa otwarte okna ustawień nadpisywałyby sobie
    /// nawzajem sekcje, których użytkownik w danym oknie nawet nie dotykał.
    ///
    /// Walidacja idzie PRZED zapisem i dotyczy tylko tej sekcji - jedna niepoprawna wartość
    /// odrzuca cały zapis sekcji, więc nigdy nie zostaje zapisana jej połowa.
    pub fn update_section(
        &self,
        section: PreferencesSection,
        incoming: Preferences,
    ) -> Result<Preferences, AppError> {
        incoming.validate_section(section)?;

        let mut current = self.repository.load()?;
        apply_section(&mut current, section, incoming);
        self.repository.save(&current)?;
        Ok(current)
    }

    /// Przywraca domyślne w jednej sekcji. Nie dotyka danych dziennika - preferencje leżą
    /// w innej tabeli niż transakcje, konta, strategie, załączniki i kopie bezpieczeństwa.
    pub fn reset_section(&self, section: PreferencesSection) -> Result<Preferences, AppError> {
        let mut current = self.repository.load()?;
        current.reset_section(section);
        self.repository.save(&current)?;
        Ok(current)
    }
}

fn apply_section(target: &mut Preferences, section: PreferencesSection, incoming: Preferences) {
    match section {
        PreferencesSection::Appearance => target.appearance = incoming.appearance,
        PreferencesSection::Behavior => target.behavior = incoming.behavior,
        PreferencesSection::Defaults => target.defaults = incoming.defaults,
        PreferencesSection::Notifications => target.notifications = incoming.notifications,
        PreferencesSection::Data => target.data = incoming.data,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::preferences::{StartupView, ThemeMode};
    use std::sync::Mutex;

    /// Repozytorium w pamięci - testujemy regułę atomowości sekcji, nie SQLite.
    struct InMemoryRepository {
        stored: Mutex<Preferences>,
    }

    impl PreferencesRepository for InMemoryRepository {
        fn load(&self) -> Result<Preferences, AppError> {
            Ok(self.stored.lock().unwrap().clone())
        }

        fn save(&self, preferences: &Preferences) -> Result<(), AppError> {
            *self.stored.lock().unwrap() = preferences.clone();
            Ok(())
        }
    }

    fn service_with(initial: Preferences) -> PreferencesService {
        PreferencesService::new(Arc::new(InMemoryRepository {
            stored: Mutex::new(initial),
        }))
    }

    #[test]
    fn zapis_sekcji_nie_rusza_pozostalych_sekcji() {
        let mut initial = Preferences::default();
        initial.behavior.startup_view = StartupView::Reports;
        initial.notifications.sound = true;
        let service = service_with(initial);

        // Klient przysyła KOMPLET, ale z domyślnymi (czyli innymi) wartościami w sekcjach,
        // których użytkownik nie dotykał. Zapis wyglądu nie może ich nadpisać.
        let mut incoming = Preferences::default();
        incoming.appearance.theme = ThemeMode::Light;

        let saved = service
            .update_section(PreferencesSection::Appearance, incoming)
            .expect("zapis");

        assert_eq!(saved.appearance.theme, ThemeMode::Light);
        assert_eq!(
            saved.behavior.startup_view,
            StartupView::Reports,
            "sekcja Zachowanie nie była zapisywana, więc musi zostać z bazy"
        );
        assert!(
            saved.notifications.sound,
            "sekcja Powiadomienia nie była zapisywana, więc musi zostać z bazy"
        );
    }

    #[test]
    fn niepoprawna_wartosc_odrzuca_caly_zapis_sekcji() {
        let service = service_with(Preferences::default());

        let mut incoming = Preferences::default();
        incoming.appearance.theme = ThemeMode::Light; // poprawne
        incoming.appearance.accent_color = "bez sensu".to_string(); // niepoprawne

        let result = service.update_section(PreferencesSection::Appearance, incoming);

        assert!(matches!(result, Err(AppError::Validation(_))));
        let after = service.get().expect("odczyt");
        assert_eq!(
            after.appearance.theme,
            ThemeMode::Dark,
            "poprawna część sekcji też NIE może zostać zapisana - zapis jest atomowy"
        );
    }

    #[test]
    fn reset_sekcji_nie_rusza_pozostalych() {
        let mut initial = Preferences::default();
        initial.appearance.theme = ThemeMode::Light;
        initial.behavior.startup_view = StartupView::Accounts;
        let service = service_with(initial);

        let after = service
            .reset_section(PreferencesSection::Appearance)
            .expect("reset");

        assert_eq!(after.appearance.theme, ThemeMode::Dark);
        assert_eq!(after.behavior.startup_view, StartupView::Accounts);
    }
}
