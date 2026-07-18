import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@dziennik/ui';
import { pl } from '@dziennik/i18n';
import { primaryNavItems, secondaryNavItems, type NavItem } from '../navigation.js';
import styles from './CommandPalette.module.css';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const allItems: NavItem[] = [...primaryNavItems, ...secondaryNavItems];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allItems;
    return allItems.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [query]);

  function goTo(item: NavItem) {
    navigate(item.to);
    onOpenChange(false);
    setQuery('');
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = results[activeIndex];
      if (item) goTo(item);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery('');
          setActiveIndex(0);
        }
      }}
      title={pl.nav.openCommandPalette}
      description="Wpisz nazwę strony i wybierz strzałkami lub Enterem."
      hideTitle
    >
      <input
        autoFocus
        type="text"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="command-palette-list"
        aria-label={pl.common.search}
        placeholder={pl.common.search}
        className={styles.input}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {results.length === 0 ? (
        <p className={styles.empty}>Brak wyników.</p>
      ) : (
        <ul className={styles.list} id="command-palette-list" role="listbox">
          {results.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.to} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={
                    index === activeIndex ? `${styles.item} ${styles.itemActive}` : styles.item
                  }
                  onClick={() => goTo(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
