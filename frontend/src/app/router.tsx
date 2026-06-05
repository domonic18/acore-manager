import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { AppLayout } from '@/shared/components/AppLayout';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const AccountListPage = lazy(() => import('@/pages/AccountListPage'));
const AccountDetailPage = lazy(() => import('@/pages/AccountDetailPage'));

function withSuspense(Component: React.ComponentType) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">加载中...</div>}>
      <Component />
    </Suspense>
  );
}

function GuestGuard() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : <Outlet />;
}

function AuthGuard() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <GuestGuard />,
    children: [{ path: '', element: withSuspense(LoginPage) }],
  },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '', element: withSuspense(DashboardPage) },
          { path: 'accounts', element: withSuspense(AccountListPage) },
          { path: 'accounts/:id', element: withSuspense(AccountDetailPage) },
        ],
      },
    ],
  },
]);
