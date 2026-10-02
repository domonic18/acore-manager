import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { useAuth } from '@/shared/hooks/useAuth';
import { LogoIcon } from '@/shared/components/ui/LogoIcon';
import { SHORT_VERSION } from '@/shared/config/version';
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Receipt,
  Shield,
  ScrollText,
  LogOut,
  Menu,
  X,
  Ban,
  ShieldAlert,
  Crown,
  MessageSquareOff,
  SlidersHorizontal,
  Bot,
  FileSearch,
  Crosshair,
  Settings,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';

interface MenuItem {
  path: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** 前缀路径互斥（如 /ai-diagnosis 与 /ai-diagnosis/targeted）时精确匹配高亮 */
  end?: boolean;
}

const menuGroups: { title: string; items: MenuItem[] }[] = [
  {
    title: '总览',
    items: [{ path: '/', label: '管理总览', icon: LayoutDashboard }],
  },
  {
    title: '玩家管理',
    items: [
      { path: '/accounts', label: '账号管理', icon: Users },
      { path: '/characters', label: '角色管理', icon: UserCircle },
      { path: '/transactions', label: '交易记录', icon: Receipt },
    ],
  },
  {
    title: 'GM 运维',
    items: [
      { path: '/gm-tools', label: 'GM 工具', icon: Shield },
      { path: '/gm-accounts', label: 'GM 账号', icon: Crown },
      { path: '/rbac-config', label: 'RBAC 配置', icon: SlidersHorizontal },
    ],
  },
  {
    title: '处罚中心',
    items: [
      { path: '/banlist', label: '封号列表', icon: ShieldAlert },
      { path: '/mutes', label: '禁言列表', icon: MessageSquareOff },
      { path: '/ip-bans', label: 'IP 封禁', icon: Ban },
    ],
  },
  {
    title: 'AI 智能',
    items: [
      { path: '/model-config', label: '模型配置', icon: Bot },
      { path: '/ai-diagnosis', label: '巡检报告', icon: FileSearch, end: true },
      { path: '/ai-diagnosis/targeted', label: '深度分析', icon: Crosshair },
    ],
  },
  {
    title: '系统',
    items: [
      { path: '/audit-logs', label: '日志审计', icon: ScrollText },
      { path: '/system-config', label: '系统配置', icon: Settings },
    ],
  },
];

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/login');
  };

  // 点击菜单外任意区域收起头像下拉
  useEffect(() => {
    if (!userMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [userMenuOpen]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 bg-card border-r border-border',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center">
                <LogoIcon className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <h1 className="text-lg font-bold text-primary">守望者要塞</h1>
                  <span className="text-[10px] text-muted-foreground">{SHORT_VERSION}</span>
                </div>
                <p className="text-xs text-muted-foreground">GM 指挥与运维中枢</p>
              </div>
            </div>
            <button
              className="md:hidden text-muted-foreground"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {menuGroups.map((group) => (
              <div key={group.title}>
                <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
                  {group.title}
                </div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-border flex items-center px-4 md:px-6">
          <button
            className="md:hidden mr-4 text-muted-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="ml-auto flex items-center gap-1">
            <NavLink
              to="/system-config"
              title="设置"
              aria-label="设置"
              className={({ isActive }) =>
                cn(
                  'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Settings className="w-5 h-5" />
            </NavLink>

            {/* 头像下拉：账户信息 + 退出登录 */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                title={user?.username}
                className="flex items-center gap-1 h-9 pl-1 pr-1.5 rounded-full transition-colors hover:bg-accent"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold uppercase">
                  {(user?.username || '?').charAt(0)}
                </span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-muted-foreground transition-transform',
                    userMenuOpen && 'rotate-180',
                  )}
                />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-60 rounded-md border border-border bg-popover shadow-md py-1.5 z-50"
                >
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium truncate">{user?.username ?? '—'}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      GM 等级 {user?.gmlevel ?? '—'}
                    </p>
                  </div>
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
