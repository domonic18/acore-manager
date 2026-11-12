import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Suspense } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { usePermission } from '@/shared/hooks/usePermission';
import { AppLayout } from '@/shared/components/AppLayout';
import { DetailPageSkeleton } from '@/shared/components/Skeleton';
import { ChunkErrorBoundary } from '@/shared/components/ChunkErrorBoundary';
import { LoadFailureNotice } from '@/shared/components/LoadFailureNotice';
import { lazyWithRetry } from '@/shared/lib/chunk-load';
import { RouteErrorFallback } from './RouteErrorFallback';

const LoginPage = lazyWithRetry(() => import('@/pages/LoginPage'), 'LoginPage');
const DashboardPage = lazyWithRetry(() => import('@/pages/DashboardPage'), 'DashboardPage');
const AccountListPage = lazyWithRetry(() => import('@/pages/AccountListPage'), 'AccountListPage');
const AccountDetailPage = lazyWithRetry(() => import('@/pages/AccountDetailPage'), 'AccountDetailPage');
const CharacterListPage = lazyWithRetry(() => import('@/pages/CharacterListPage'), 'CharacterListPage');
const CharacterDetailPage = lazyWithRetry(() => import('@/pages/CharacterDetailPage'), 'CharacterDetailPage');
const TransactionPage = lazyWithRetry(() => import('@/pages/TransactionPage'), 'TransactionPage');
const GmToolPage = lazyWithRetry(() => import('@/pages/GmToolPage'), 'GmToolPage');
const AuditLogPage = lazyWithRetry(() => import('@/pages/AuditLogPage'), 'AuditLogPage');
const IpBanPage = lazyWithRetry(() => import('@/pages/IpBanPage'), 'IpBanPage');
const BanlistPage = lazyWithRetry(() => import('@/pages/BanlistPage'), 'BanlistPage');
const MuteListPage = lazyWithRetry(() => import('@/pages/MuteListPage'), 'MuteListPage');
const RbacConfigPage = lazyWithRetry(() => import('@/pages/RbacConfigPage'), 'RbacConfigPage');
const GmAccountPage = lazyWithRetry(() => import('@/pages/GmAccountPage'), 'GmAccountPage');
const SystemConfigPage = lazyWithRetry(() => import('@/pages/SystemConfigPage'), 'SystemConfigPage');
const AiDiagnosisPage = lazyWithRetry(() => import('@/pages/AiDiagnosisPage'), 'AiDiagnosisPage');
const AiDiagnosisReportDetailPage = lazyWithRetry(
  () => import('@/pages/AiDiagnosisReportDetailPage'),
  'AiDiagnosisReportDetailPage',
);
const AiDiagnosisFindingsPage = lazyWithRetry(
  () => import('@/pages/AiDiagnosisFindingsPage'),
  'AiDiagnosisFindingsPage',
);
const TargetedAnalysisPage = lazyWithRetry(
  () => import('@/pages/TargetedAnalysisPage'),
  'TargetedAnalysisPage',
);
const TargetedAnalysisDetailPage = lazyWithRetry(
  () => import('@/pages/TargetedAnalysisDetailPage'),
  'TargetedAnalysisDetailPage',
);
const SampleRegistryPage = lazyWithRetry(() => import('@/pages/SampleRegistryPage'), 'SampleRegistryPage');
const PromptLibraryPage = lazyWithRetry(() => import('@/pages/PromptLibraryPage'), 'PromptLibraryPage');
const AiAssistantDock = lazyWithRetry(
  () =>
    import('@/features/ai-assistant/components/AiAssistantDock').then((m) => ({ default: m.AiAssistantDock })),
  'AiAssistantDock',
);

function withSuspense(Component: React.ComponentType) {
  return (
    // 懒加载路由首屏骨架：chunk 加载期间整页占位，避免导航瞬间白屏/文字闪现
    <Suspense fallback={<DetailPageSkeleton />}>
      <Component />
    </Suspense>
  );
}

// 页面路由统一挂 errorElement：页面 chunk 加载失败时只替换内容区，布局与导航保留
function page(path: string, Component: React.ComponentType) {
  return {
    path,
    element: withSuspense(Component),
    errorElement: <RouteErrorFallback />,
  };
}

// 全局 AI 助手入口：悬浮按钮 + 右侧抽屉，随 AppLayout 出现在所有已登录页
function AiAssistantDockGate() {
  const { hasGmLevel } = usePermission();
  if (!hasGmLevel(2)) return null;
  return (
    // 助手 chunk 加载失败只降级为角标提示，不牵连整页
    <ChunkErrorBoundary
      fallback={<LoadFailureNotice floating title="AI 助手加载失败" description="网络波动导致助手脚本未加载完成。" />}
    >
      <Suspense fallback={null}>
        <AiAssistantDock />
      </Suspense>
    </ChunkErrorBoundary>
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
    children: [page('', LoginPage)],
  },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      {
        element: (
          <>
            <AppLayout />
            <AiAssistantDockGate />
          </>
        ),
        children: [
          page('', DashboardPage),
          page('accounts', AccountListPage),
          page('accounts/:id', AccountDetailPage),
          page('characters', CharacterListPage),
          page('characters/:guid', CharacterDetailPage),
          page('transactions', TransactionPage),
          page('gm-tools', GmToolPage),
          page('banlist', BanlistPage),
          page('mutes', MuteListPage),
          {
            element: <GmGuard minLevel={2} />,
            children: [
              page('ip-bans', IpBanPage),
              page('ai-diagnosis', AiDiagnosisPage),
              page('ai-diagnosis/findings', AiDiagnosisFindingsPage),
              page('ai-diagnosis/targeted', TargetedAnalysisPage),
              page('ai-diagnosis/samples', SampleRegistryPage),
              page('ai-diagnosis/prompts', PromptLibraryPage),
              page('ai-diagnosis/targeted/:id', TargetedAnalysisDetailPage),
              page('ai-diagnosis/:realm/:date', AiDiagnosisReportDetailPage),
            ],
          },
          {
            element: <GmGuard minLevel={3} />,
            children: [page('gm-accounts', GmAccountPage), page('audit-logs', AuditLogPage), page('rbac-config', RbacConfigPage)],
          },
          {
            element: <GmGuard minLevel={3} />,
            children: [
              { path: 'model-config', element: <Navigate to="/system-config?tab=model" replace /> },
              { path: 'feishu-bindings', element: <Navigate to="/system-config?tab=bindings" replace /> },
              page('system-config', SystemConfigPage),
            ],
          },
        ],
      },
    ],
  },
]);
