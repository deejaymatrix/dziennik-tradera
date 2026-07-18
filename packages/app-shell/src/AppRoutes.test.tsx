import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '@dziennik/ui';
import { expectNoAccessibilityViolations } from '@dziennik/testing';
import { AppRouteTree } from './AppRoutes.js';

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRouteTree />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('AppRouteTree', () => {
  it('pokazuje Dashboard wewnątrz AppShell na ścieżce głównej', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    // AppShell renderuje nawigację - potwierdzenie, że to nie jest goły ekran.
    expect(screen.getByRole('button', { name: 'Otwórz paletę poleceń' })).toBeInTheDocument();
  });

  it('pokazuje Ustawienia pod /ustawienia w tym samym shellu', () => {
    renderAt('/ustawienia');
    expect(screen.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeInTheDocument();
  });

  it('pokazuje ekran logowania BEZ AppShell (inna warstwa niż moduły produktowe)', () => {
    renderAt('/logowanie');
    expect(screen.getByRole('heading', { level: 1, name: 'Zaloguj się' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Otwórz paletę poleceń' })).not.toBeInTheDocument();
  });

  it('nieznana ścieżka pokazuje stronę 404 z działającym powrotem do Dashboardu', () => {
    renderAt('/nieistniejaca-strona');
    expect(screen.getByRole('heading', { name: 'Nie znaleziono strony' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wróć do Dashboardu' })).toBeInTheDocument();
  });
});

describe('Dostępność kluczowych ekranów (axe)', () => {
  it('AppShell + Dashboard nie mają naruszeń dostępności', async () => {
    const { container } = renderAt('/');
    await expectNoAccessibilityViolations(container);
  });

  it('ekran logowania nie ma naruszeń dostępności', async () => {
    const { container } = renderAt('/logowanie');
    await expectNoAccessibilityViolations(container);
  });

  it('onboarding (krok 1) nie ma naruszeń dostępności', async () => {
    const { container } = renderAt('/onboarding');
    await expectNoAccessibilityViolations(container);
  });

  it('strona 404 nie ma naruszeń dostępności', async () => {
    const { container } = renderAt('/nieistniejaca-strona');
    await expectNoAccessibilityViolations(container);
  });
});
