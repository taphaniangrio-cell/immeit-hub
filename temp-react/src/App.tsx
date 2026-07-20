import { useState, useCallback, useMemo } from 'react';
import { useStore } from './stores/appStore';
import { useToast, ToastProvider } from './contexts/ToastContext';
import { Shell } from './components/layout/Shell';
import { ToastContainer } from './components/ui/Toast';
import { LoginScreen } from './components/features/LoginScreen';
import { ArticlesPage } from './components/features/ArticlesPage';
import { DashboardPage } from './components/dashboard/DashboardPage';
import { InsightsPage } from './components/dashboard/InsightsPage';
import MultiDatesDetails from './components/dashboard/MultiDatesDetails';

function AppInner() {
  const { session, view, login, logout, setView } = useStore();
  const { toasts, showToast, removeToast } = useToast();
  const [loginError, setLoginError] = useState('');

  const isMultiDatesPage = useMemo(() => window.location.pathname === '/multi-dates-details', []);

  if (isMultiDatesPage) {
    return <MultiDatesDetails />;
  }

  const handleLogin = useCallback(async (pw: string) => {
    setLoginError('');
    const ok = await login(pw);
    if (!ok) setLoginError('Mot de passe incorrect');
  }, [login]);

  if (!session) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} error={loginError} />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  return (
    <>
      <Shell title={view === 'articles' ? 'Articles' : view === 'insights' ? 'Détails multi-dépôts' : undefined}>
        {view === 'articles' ? <ArticlesPage /> :
         view === 'insights' ? <InsightsPage setView={setView} /> :
         <DashboardPage showToast={showToast} setView={setView} />}
      </Shell>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
