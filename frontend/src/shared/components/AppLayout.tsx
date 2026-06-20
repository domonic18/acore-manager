import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { useAuth } from '@/shared/hooks/useAuth';
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
} from 'lucide-react';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/accounts', label: '账号管理', icon: Users },
  { path: '/characters', label: '角色管理', icon: UserCircle },
  { path: '/transactions', label: '交易记录', icon: Receipt },
  { path: '/gm-tools', label: 'GM 工具', icon: Shield },
  { path: '/gm-accounts', label: 'GM 账号', icon: Crown },
  { path: '/rbac-config', label: '跨阵营交互', icon: SlidersHorizontal },
  { path: '/banlist', label: '封号列表', icon: ShieldAlert },
  { path: '/mutes', label: '禁言列表', icon: MessageSquareOff },
  { path: '/ip-bans', label: 'IP 封禁', icon: Ban },
  { path: '/audit-logs', label: '日志审计', icon: ScrollText },
];

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 md:relative md:translate-x-0 bg-card border-r border-border',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-border">
            <div>
              <h1 className="text-lg font-bold text-primary">ACM</h1>
              <p className="text-xs text-muted-foreground">AzerothCore Manager</p>
            </div>
            <button
              className="md:hidden text-muted-foreground"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
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
          </nav>

          {/* User Info & Logout */}
          <div className="p-4 border-t border-border space-y-3">
            {user && (
              <div className="px-3">
                <p className="text-sm font-medium">{user.username}</p>
                <p className="text-xs text-muted-foreground">
                  GM等级: {user.gmlevel}
                </p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </div>
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
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
