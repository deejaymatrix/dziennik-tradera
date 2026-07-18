import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from './TextField.js';

const meta: Meta<typeof TextField> = {
  title: 'Prymitywy/TextField',
  component: TextField,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof TextField>;

export const Domyślny: Story = {
  args: { label: 'Adres e-mail', placeholder: 'ty@przyklad.pl' },
};

export const Wymagany: Story = {
  args: { label: 'Nazwa konta', required: true },
};

export const ZPodpowiedzią: Story = {
  name: 'Z podpowiedzią',
  args: { label: 'Nazwa konta', hint: 'Np. „Live FTMO 100k”.', required: true },
};

export const ZBłędem: Story = {
  name: 'Z błędem walidacji',
  args: { label: 'Hasło', type: 'password', error: 'Hasło musi mieć co najmniej 12 znaków.' },
};
