import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme, useThemeToggle } from './ThemeProvider.js';

function Probe() {
  const { theme, resolvedTheme } = useTheme();
  const toggle = useThemeToggle();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={toggle}>Przełącz motyw</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('domyślnie ustawia ciemny motyw i atrybut data-theme na <html>', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('przełącza między ciemnym a jasnym motywem', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Przełącz motyw' }));

    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('rzuca czytelny błąd, gdy useTheme użyty poza ThemeProvider', () => {
    function Broken() {
      useTheme();
      return null;
    }

    expect(() => render(<Broken />)).toThrow(/ThemeProvider/);
  });
});
