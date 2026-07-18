import type { SelectOption } from '@dziennik/ui';

/**
 * Krótka, curated lista - pełny wybór strefy czasowej/instrumentu przez
 * wyszukiwarkę przyjdzie razem z prawdziwym modelem profilu w Kamieniu 2/3
 * (docs/specyfikacja-produktu.md §7.1, §7.3). To wystarcza do UI onboardingu.
 */
export const timezoneOptions: SelectOption[] = [
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (domyślna)' },
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'America/New_York' },
];

export const reportingCurrencyOptions: SelectOption[] = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'PLN', label: 'PLN' },
  { value: 'GBP', label: 'GBP' },
  { value: 'CHF', label: 'CHF' },
];

export const accountTypeOptions: SelectOption[] = [
  { value: 'live', label: 'Live' },
  { value: 'demo', label: 'Demo' },
  { value: 'prop', label: 'Prop / funded' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'custom', label: 'Własny typ' },
];
