import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectNoAccessibilityViolations } from '@dziennik/testing';
import { TextField } from './TextField.js';

describe('TextField', () => {
  it('wiąże etykietę z polem (dostępne przez getByLabelText)', () => {
    render(<TextField label="Adres e-mail" />);
    expect(screen.getByLabelText('Adres e-mail')).toBeInTheDocument();
  });

  it('pokazuje błąd jako aria-invalid i komunikat role="alert"', () => {
    render(<TextField label="Adres e-mail" error="Nieprawidłowy adres e-mail." />);

    const input = screen.getByLabelText('Adres e-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Nieprawidłowy adres e-mail.');
  });

  it('nie ma naruszeń dostępności (axe)', async () => {
    const { container } = render(
      <TextField label="Hasło" type="password" hint="Minimum 12 znaków." required />,
    );
    await expectNoAccessibilityViolations(container);
  });
});
