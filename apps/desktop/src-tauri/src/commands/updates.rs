use crate::error::AppError;
use crate::infrastructure::update_manifest::{self, WynikSprawdzenia};

/// Lekkie sprawdzenie, czy manifest aktualizacji się zmienił (Cel 1.8).
///
/// Świadomie NIE weryfikuje podpisu i niczego nie instaluje - to zadanie wtyczki
/// `tauri-plugin-updater`, wywoływanej dopiero wtedy, gdy ta komenda powie, że manifest jest
/// nowy. Dzięki temu sprawdzanie co dziesięć minut kosztuje jedno żądanie warunkowe
/// zakończone odpowiedzią „bez zmian", a żadna decyzja bezpieczeństwa nie zależy od tego kodu.
///
/// `etag` to wartość zapamiętana z poprzedniego sprawdzenia; przy pierwszym wywołaniu `None`.
#[tauri::command]
pub async fn check_update_manifest(etag: Option<String>) -> Result<WynikSprawdzenia, AppError> {
    update_manifest::sprawdz(etag.as_deref()).await
}
