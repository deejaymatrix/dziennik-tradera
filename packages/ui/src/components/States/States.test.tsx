import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectNoAccessibilityViolations } from '@dziennik/testing';
import { EmptyState } from './EmptyState.js';
import { ErrorState } from './ErrorState.js';
import { LoadingState } from './LoadingState.js';
import { StatusIndicator } from './StatusIndicator.js';
import { Button } from '../Button/Button.js';

describe('EmptyState', () => {
  it('pokazuje tytuł, opis i konkretne działanie (nie pustą dekorację)', () => {
    render(
      <EmptyState
        title="Nie masz jeszcze żadnej strategii"
        description="Utwórz własną strategię."
        action={<Button>Dodaj strategię</Button>}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Nie masz jeszcze żadnej strategii' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dodaj strategię' })).toBeInTheDocument();
  });

  it('nie ma naruszeń dostępności', async () => {
    const { container } = render(<EmptyState title="Brak transakcji" />);
    await expectNoAccessibilityViolations(container);
  });
});

describe('ErrorState', () => {
  it('ma rolę alert, żeby czytnik ekranu od razu ogłosił błąd', () => {
    render(<ErrorState title="Nie udało się wczytać danych" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wczytać danych');
  });
});

describe('LoadingState', () => {
  it('pokazuje etykietę ładowania', () => {
    render(<LoadingState label="Wczytywanie transakcji…" />);
    expect(screen.getAllByText('Wczytywanie transakcji…').length).toBeGreaterThan(0);
  });
});

describe('StatusIndicator', () => {
  it('renderuje etykietę statusu', () => {
    render(<StatusIndicator label="Offline" tone="warning" />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});
