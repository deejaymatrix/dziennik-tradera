import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Modal } from './Modal.js';
import { Button } from '../Button/Button.js';
import { Text } from '../Typography/Typography.js';

const meta: Meta<typeof Modal> = {
  title: 'Prymitywy/Modal',
  component: Modal,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Modal>;

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Otwórz okno modalne</Button>
      <Modal open={open} onOpenChange={setOpen} title="Potwierdź usunięcie">
        <Text tone="secondary">
          Ta operacja przeniesie transakcję do kosza. Będzie można ją przywrócić przez
          skonfigurowany okres retencji.
        </Text>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Anuluj
          </Button>
          <Button variant="destructive" onClick={() => setOpen(false)}>
            Usuń
          </Button>
        </div>
      </Modal>
    </>
  );
}

export const Domyślny: Story = {
  render: () => <ModalDemo />,
};
