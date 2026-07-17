import { useState, useCallback } from 'react';
import { useStore } from './stores/appStore';
import { useToast } from './hooks/useToast';
import { Shell } from './components/layout/Shell';
import { ToastContainer } from './components/ui/Toast';
import { LoginScreen } from './components/features/LoginScreen';
import { ArticlesPage } from './components/features/ArticlesPage';
import { DashboardPage } from './components/dashboard/DashboardPage';

export default function App() {
  const { session, view, login, logout, setView } = useStore();
  const { toasts, showToast, removeToast } = useToast();
  const [loginError, setLoginError] = useState('');

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
      <Shell title={view === 'articles' ? 'Articles' : undefined}>
        {view === 'articles' ? <ArticlesPage /> : <DashboardPage showToast={showToast} />}
      </Shell>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
