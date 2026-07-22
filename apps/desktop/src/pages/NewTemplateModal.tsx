import { useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { invokeCommand } from "../app/invokeCommand";
import type { BrokerTemplate } from "../app/types/instrument";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./ImportBrokerModal.module.css";

export interface NewTemplateModalProps {
  onClose: () => void;
  /** Dostaje świeżo utworzony szablon, żeby ekran mógł od razu na niego przełączyć. */
  onCreated: (template: BrokerTemplate) => Promise<void>;
}

/**
 * Zakładanie pustego szablonu instrumentów prosto z zakładki "Instrumenty" - osobne okno
 * nawigacyjne dla szablonów zostało zwinięte, żeby nie mnożyć ekranów. Powstaje szablon BEZ
 * instrumentów; dane brokera wgrywa się do niego osobnym krokiem ("Importuj dane brokera").
 */
export function NewTemplateModal({ onClose, onCreated }: NewTemplateModalProps): ReactElement {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [accountType, setAccountType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Podaj nazwę szablonu.");
      return;
    }

    setBusy(true);
    try {
      const template = await invokeCommand<BrokerTemplate>("create_broker_template", {
        input: {
          name: name.trim(),
          broker_name: broker.trim() || name.trim(),
          account_type: accountType.trim() || null,
        },
      });
      showToast(`Szablon "${template.name}" utworzony.`, "success");
      await onCreated(template);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się utworzyć szablonu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nowy szablon instrumentów">
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <p className={styles.note}>
          Szablon to osobny zestaw instrumentów i ich parametrów dla jednego brokera. Powstanie
          pusty - instrumenty wgrasz do niego przyciskiem &bdquo;Importuj dane brokera&rdquo; albo
          dodasz ręcznie.
        </p>

        <TextField
          label="Nazwa szablonu"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          hint="Np. IC Markets RAW."
        />
        <TextField
          label="Nazwa brokera"
          value={broker}
          onChange={(e) => setBroker(e.target.value)}
          hint="Puste = tak samo jak nazwa szablonu."
        />
        <TextField
          label="Typ konta (opcjonalnie)"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
          hint="Np. RAW, Standard, ECN."
        />

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Anuluj
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Tworzenie..." : "Utwórz szablon"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
