import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectNoAccessibilityViolations } from '@dziennik/testing';
import { Card } from './Card/Card.js';
import { Heading, Text } from './Typography/Typography.js';
import { Badge } from './Badge/Badge.js';
import { Spinner } from './Spinner/Spinner.js';

describe('Card', () => {
  it('renderuje dzieci wewnątrz kontenera', () => {
    render(<Card>Zawartość karty</Card>);
    expect(screen.getByText('Zawartość karty')).toBeInTheDocument();
  });
});

describe('Typography', () => {
  it('Heading renderuje właściwy poziom nagłówka', () => {
    render(<Heading level={2}>Saldo konta</Heading>);
    expect(screen.getByRole('heading', { level: 2, name: 'Saldo konta' })).toBeInTheDocument();
  });

  it('Text renderuje jako paragraf domyślnie', () => {
    render(<Text>Przykładowy opis.</Text>);
    const node = screen.getByText('Przykładowy opis.');
    expect(node.tagName).toBe('P');
  });
});

describe('Badge', () => {
  it('renderuje treść odznaki', () => {
    render(<Badge tone="success">Zysk</Badge>);
    expect(screen.getByText('Zysk')).toBeInTheDocument();
  });
});

describe('Spinner', () => {
  it('ma dostępną etykietę statusu ładowania', () => {
    render(<Spinner label="Wczytywanie transakcji…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie transakcji…');
  });
});

describe('Dostępność prymitywów (axe)', () => {
  it('Card + Heading + Text + Badge nie mają naruszeń', async () => {
    const { container } = render(
      <Card>
        <Heading level={3}>Dashboard</Heading>
        <Text tone="secondary">Podsumowanie Twojego dnia.</Text>
        <Badge tone="accent">Nowość</Badge>
      </Card>,
    );
    await expectNoAccessibilityViolations(container);
  });
});
