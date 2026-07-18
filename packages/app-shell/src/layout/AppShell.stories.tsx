import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from './AppShell.js';
import { DashboardPage } from '../pages/DashboardPage.js';
import { SettingsPage } from '../pages/SettingsPage.js';
import { SyncCenterPage } from '../pages/SyncCenterPage.js';

const meta: Meta<typeof AppShell> = {
  title: 'Ekrany/AppShell',
  component: AppShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Wspólny layout (sidebar/dolna nawigacja, TopBar, paleta poleceń Ctrl/Cmd+K) ' +
          'współdzielony przez apps/web i apps/desktop. Kluczowa dla dostępności: pasek ' +
          'nawigacji ma unikalne etykiety, jest link "przejdź do treści", motyw przełączalny.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof AppShell>;

export const ZDashboardem: Story = {
  name: 'Z Dashboardem (pusty stan)',
  render: () => (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  ),
};

export const ZUstawieniami: Story = {
  render: () => (
    <MemoryRouter initialEntries={['/ustawienia']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/ustawienia" element={<SettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  ),
};

export const ZCentrumSynchronizacji: Story = {
  name: 'Z Centrum synchronizacji',
  render: () => (
    <MemoryRouter initialEntries={['/synchronizacja']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/synchronizacja" element={<SyncCenterPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  ),
};
