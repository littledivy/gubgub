import { ComponentChildren } from "preact";

interface LayoutProps {
  children: ComponentChildren;
  title?: string;
  active?: string;
  user?: { email: string; isAdmin: boolean };
}

export default function Layout({ children, title, active, user }: LayoutProps) {
  return (
    <div class="app-shell">
      <nav class="topnav">
        <a class="brand" href="/app">gubgub</a>
        <a href="/app" class={active === "dashboard" ? "active" : ""}>
          dashboard
        </a>
        <a href="/meetings" class={active === "meetings" ? "active" : ""}>
          meetings
        </a>
        <a href="/calendar" class={active === "calendar" ? "active" : ""}>
          calendar
        </a>
        <a href="/settings" class={active === "settings" ? "active" : ""}>
          settings
        </a>
        {user?.isAdmin && (
          <a href="/workers" class={active === "workers" ? "active" : ""}>
            workers
          </a>
        )}
        <div class="spacer" />
        <a href="/meetings/new" class="nav-new">+ new</a>
        {user && (
          <a href="/api/auth/logout" class="nav-logout" title={user.email}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </a>
        )}
      </nav>

      {title && <h1>{title}</h1>}
      {children}
    </div>
  );
}
