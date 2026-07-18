import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelectField } from './SelectField.js';

const meta: Meta<typeof SelectField> = {
  title: 'Prymitywy/SelectField',
  component: SelectField,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof SelectField>;

export const Domyślny: Story = {
  args: {
    label: 'Waluta raportowa',
    options: [
      { value: 'EUR', label: 'EUR' },
      { value: 'USD', label: 'USD' },
      { value: 'PLN', label: 'PLN' },
    ],
  },
};

export const TypKonta: Story = {
  name: 'Typ konta',
  args: {
    label: 'Typ konta',
    required: true,
    options: [
      { value: 'live', label: 'Live' },
      { value: 'demo', label: 'Demo' },
      { value: 'prop', label: 'Prop / funded' },
      { value: 'challenge', label: 'Challenge' },
    ],
  },
};
