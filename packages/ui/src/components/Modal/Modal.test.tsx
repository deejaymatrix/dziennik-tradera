import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal.js';

describe('Modal', () => {
  it('nie renderuje treści, gdy zamknięty', () => {
    render(
      <Modal open={false} onOpenChange={() => {}} title="Paleta poleceń">
        <p>Zawartość</p>
      </Modal>,
    );
    expect(screen.queryByText('Zawartość')).not.toBeInTheDocument();
  });

  it('renderuje tytuł i treść, gdy otwarty', () => {
    render(
      <Modal open onOpenChange={() => {}} title="Paleta poleceń">
        <p>Zawartość</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Paleta poleceń' })).toBeInTheDocument();
    expect(screen.getByText('Zawartość')).toBeInTheDocument();
  });

  it('wywołuje onOpenChange(false) po Escape', () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="Paleta poleceń">
        <p>Zawartość</p>
      </Modal>,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
