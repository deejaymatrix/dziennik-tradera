import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus } from 'lucide-react';
import { Button } from './Button.js';

const meta: Meta<typeof Button> = {
  title: 'Prymitywy/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'destructive'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { children: 'Zapisz', variant: 'primary' },
};

export const Secondary: Story = {
  args: { children: 'Anuluj', variant: 'secondary' },
};

export const Ghost: Story = {
  args: { children: 'Pomiń na razie', variant: 'ghost' },
};

export const Destructive: Story = {
  args: { children: 'Usuń trwale', variant: 'destructive' },
};

export const ZIkona: Story = {
  name: 'Z ikoną',
  args: {
    variant: 'primary',
    children: (
      <>
        <Plus size={16} />
        Dodaj transakcję
      </>
    ),
  },
};

export const Wyłączony: Story = {
  args: { children: 'Dostępne od Kamienia 3', variant: 'primary', disabled: true },
};

export const Rozmiary: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button size="sm">Mały</Button>
      <Button size="md">Średni</Button>
      <Button size="lg">Duży</Button>
    </div>
  ),
};
