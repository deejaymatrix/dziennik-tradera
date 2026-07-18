import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage.js';

describe('LoginPage', () => {
  it('pokazuje błędy walidacji przy pustym formularzu', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(await screen.findByText('Podaj adres e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Podaj hasło.')).toBeInTheDocument();
  });

  it('odrzuca za krótkie hasło z czytelnym komunikatem', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Adres e-mail'), 'user@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'krotkie');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(await screen.findByText('Hasło musi mieć co najmniej 12 znaków.')).toBeInTheDocument();
  });

  it('po poprawnym wypełnieniu NIE udaje zalogowania - pokazuje jawną informację o braku backendu', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Adres e-mail'), 'user@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'bardzoDlugieHaslo123');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    await waitFor(() =>
      expect(screen.getByText('Logowanie zostanie podłączone w Kamieniu 2')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Zaloguj się' })).not.toBeInTheDocument();
  });

  it('informuje o braku publicznej rejestracji', () => {
    render(<LoginPage />);
    expect(screen.getByText(/Brak publicznej rejestracji/)).toBeInTheDocument();
  });
});
