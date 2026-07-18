import { Money } from '@dziennik/domain';
import { pl } from '@dziennik/i18n';

/**
 * Tymczasowy ekran startowy Kamienia 0 - potwierdza, że apps/web korzysta
 * ze wspólnych pakietów domenowych (packages/domain) i tekstowych (packages/i18n).
 * Właściwy shell, routing i design system powstają w Kamieniu 1.
 */
export function App() {
  const przykladoweSaldo = Money.zero('EUR');

  return (
    <main>
      <h1>{pl.common.appName}</h1>
      <p>Fundament repozytorium (Kamień 0) jest gotowy.</p>
      <p data-testid="przykladowe-saldo">Przykładowe saldo: {przykladoweSaldo.toFixed(2)} EUR</p>
    </main>
  );
}
