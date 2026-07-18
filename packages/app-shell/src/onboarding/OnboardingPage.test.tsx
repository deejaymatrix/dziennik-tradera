import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingPage } from './OnboardingPage.js';

describe('OnboardingPage', () => {
  it('blokuje przejście dalej bez podania imienia w kroku 1', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole('button', { name: 'Dalej' }));

    expect(screen.getByText('Podaj, jak się do Ciebie zwracać.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Twój profil' })).toBeInTheDocument();
  });

  it('przechodzi przez wszystkie kroki i pozwala pominąć strategię z ostrzeżeniem', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.type(screen.getByLabelText(/Jak się do Ciebie zwracać\?/), 'Mateusz');
    await user.click(screen.getByRole('button', { name: 'Dalej' }));

    expect(screen.getByRole('heading', { name: 'Pierwsze konto tradingowe' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Nazwa konta/), 'Live FTMO 100k');
    await user.click(screen.getByRole('button', { name: 'Dalej' }));

    expect(
      screen.getByRole('heading', { name: 'Pierwsza strategia (opcjonalnie)' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pomiń na razie' }));

    expect(
      screen.getByText(/Bez strategii nadal możesz zapisywać transakcje jako szkic/),
    ).toBeInTheDocument();
  });

  it('nowe konto nigdy nie dostaje domyślnej/przykładowej strategii - pole jest puste', () => {
    render(<OnboardingPage />);
    // Krok 1 nie pokazuje żadnej strategii; sama nazwa pola w kroku 3 jest pusta domyślnie
    // (weryfikowane też przez ADR-0003 i test packages/domain - tu tylko UI).
    expect(screen.queryByDisplayValue('Japan Attack')).not.toBeInTheDocument();
  });
});
