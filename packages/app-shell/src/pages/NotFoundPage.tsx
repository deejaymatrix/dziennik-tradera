import { useNavigate } from 'react-router';
import { Button, ErrorState } from '@dziennik/ui';
import { pl } from '@dziennik/i18n';
import { ROUTES } from '../routes.js';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <ErrorState
      headingLevel={1}
      title={pl.states.notFoundTitle}
      description={pl.states.notFoundDescription}
      action={
        <Button variant="secondary" onClick={() => navigate(ROUTES.dashboard)}>
          {pl.states.backToDashboard}
        </Button>
      }
    />
  );
}
