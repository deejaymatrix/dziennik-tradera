import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/components/Button/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Ostatnia linia obrony przed pustym ekranem: przechwytuje błędy renderowania
 * w drzewie komponentów i pokazuje ekran odzyskania zamiast białej strony.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      "[ErrorBoundary] Nieobsłużony błąd renderowania:",
      error,
      errorInfo.componentStack,
    );
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleCopyDetails = (): void => {
    const details = `${this.state.error?.name ?? "Error"}: ${this.state.error?.message ?? "brak opisu"}`;
    void navigator.clipboard.writeText(details);
  };

  public override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div role="alert" className="recovery-screen">
        <h1>Wystąpił nieoczekiwany błąd</h1>
        <p>
          Aplikacja napotkała problem i nie mogła kontynuować wyświetlania tego widoku. Twoje dane
          lokalne nie zostały naruszone przez ten błąd interfejsu.
        </p>
        <p className="recovery-screen__detail">{error.message}</p>
        <div className="recovery-screen__actions">
          <Button variant="primary" onClick={this.handleReload}>
            Uruchom ponownie
          </Button>
          <Button variant="secondary" onClick={this.handleCopyDetails}>
            Skopiuj szczegóły błędu
          </Button>
        </div>
      </div>
    );
  }
}
