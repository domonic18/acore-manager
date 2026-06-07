import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { usePermission } from '@/shared/hooks/usePermission';
import { AppLayout } from '@/shared/components/AppLayout';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const AccountListPage = lazy(() => import('@/pages/AccountListPage'));
const AccountDetailPage = lazy(() => import('@/pages/AccountDetailPage'));
const CharacterListPage = lazy(() => import('@/pages/CharacterListPage'));
const CharacterDetailPage = lazy(() => import('@/pages/CharacterDetailPage'));
const TransactionPage = lazy(() => import('@/pages/TransactionPage'));
const GmToolPage = lazy(() => import('@/pages/GmToolPage'));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'));
const IpBanPage = lazy(() => import('@/pages/IpBanPage'));
const BanlistPage = lazy(() => import('@/pages/BanlistPage'));
const GmAccountPage = lazy(() => import('@/pages/GmAccountPage'));
const MuteListPage = lazy(() => import('@/pages/MuteListPage'));

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

function GmGuard({ minLevel }: { minLevel: number }) {
  const { hasGmLevel } = usePermission();
  return hasGmLevel(minLevel) ? <Outlet /> : <Navigate to="/" replace />;
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
          { path: 'characters', element: withSuspense(CharacterListPage) },
          { path: 'characters/:guid', element: withSuspense(CharacterDetailPage) },
          { path: 'transactions', element: withSuspense(TransactionPage) },
          { path: 'gm-tools', element: withSuspense(GmToolPage) },
          { path: 'banlist', element: withSuspense(BanlistPage) },
          { path: 'mutes', element: withSuspense(MuteListPage) },
          {
            element: <GmGuard minLevel={2} />,
            children: [
              { path: 'ip-bans', element: withSuspense(IpBanPage) },
            ],
          },
          {
            element: <GmGuard minLevel={3} />,
            children: [
              { path: 'gm-accounts', element: withSuspense(GmAccountPage) },
              { path: 'audit-logs', element: withSuspense(AuditLogPage) },
            ],
          },
        ],
      },
    ],
  },
]);
