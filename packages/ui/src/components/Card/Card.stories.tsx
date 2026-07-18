import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card.js';
import { Heading, Text } from '../Typography/Typography.js';
import { Badge } from '../Badge/Badge.js';

const meta: Meta<typeof Card> = {
  title: 'Prymitywy/Card',
  component: Card,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Domyślna: Story = {
  render: () => (
    <Card style={{ maxWidth: 360 }}>
      <Heading level={3}>Saldo konta</Heading>
      <Text tone="secondary">Live FTMO 100k</Text>
      <Text size="lg" weight="medium" tone="success" style={{ marginTop: 12 }}>
        +1 240,50 EUR
      </Text>
    </Card>
  ),
};

export const Wyniesiona: Story = {
  name: 'Wyniesiona (raised)',
  render: () => (
    <Card raised style={{ maxWidth: 360 }}>
      <Heading level={3}>Strategia</Heading>
      <Badge tone="accent">Aktywna</Badge>
    </Card>
  ),
};
