import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from './EmptyState.js';
import { ErrorState } from './ErrorState.js';
import { LoadingState } from './LoadingState.js';
import { StatusIndicator } from './StatusIndicator.js';
import { Button } from '../Button/Button.js';

const meta: Meta = {
  title: 'Stany',
  tags: ['autodocs'],
};
export default meta;

export const PustyBezStrategii: StoryObj<typeof EmptyState> = {
  name: 'EmptyState - brak strategii',
  render: () => (
    <EmptyState
      title="Nie masz jeszcze żadnej strategii"
      description="Utwórz własną strategię, aby móc przypisywać ją do transakcji. Nie znajdziesz tu gotowych szablonów."
      action={<Button>Dodaj strategię</Button>}
    />
  ),
};

export const Błąd: StoryObj<typeof ErrorState> = {
  name: 'ErrorState',
  render: () => (
    <ErrorState
      title="Nie udało się wczytać danych"
      description="Sprawdź połączenie z internetem i spróbuj ponownie."
      action={<Button variant="secondary">Spróbuj ponownie</Button>}
    />
  ),
};

export const Loading: StoryObj<typeof LoadingState> = {
  name: 'LoadingState',
  render: () => <LoadingState label="Wczytywanie transakcji…" />,
};

export const WskaźnikiStatusu: StoryObj<typeof StatusIndicator> = {
  name: 'StatusIndicator - wszystkie tony',
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <StatusIndicator label="Zsynchronizowano" tone="success" />
      <StatusIndicator label="Synchronizacja trwa…" tone="accent" />
      <StatusIndicator label="Offline" tone="warning" />
      <StatusIndicator label="Konflikt wymaga decyzji" tone="danger" />
      <StatusIndicator label="Bez zmian" tone="neutral" />
    </div>
  ),
};
