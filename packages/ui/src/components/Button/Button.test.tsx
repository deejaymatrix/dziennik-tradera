import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { expectNoAccessibilityViolations } from '@dziennik/testing';
import { Button } from './Button.js';

describe('Button', () => {
  it('renderuje treść i obsługuje kliknięcie', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Zapisz</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('nie wywołuje onClick, gdy wyłączony', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Zapisz
      </Button>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('domyślny typ to "button" (nie submituje przypadkiem formularza)', () => {
    render(<Button>Anuluj</Button>);
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveAttribute('type', 'button');
  });

  it('nie ma naruszeń dostępności (axe)', async () => {
    const { container } = render(<Button>Dodaj transakcję</Button>);
    await expectNoAccessibilityViolations(container);
  });
});
