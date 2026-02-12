import { Handlers, PageProps } from "$fresh/server.ts";

interface LoginData {
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "Your account is not authorized to access this app.",
  invalid_state: "Login session expired. Please try again.",
  exchange_failed: "Could not complete sign-in. Please try again.",
};

export const handler: Handlers<LoginData> = {
  GET(req, ctx) {
    const url = new URL(req.url);
    const error = url.searchParams.get("error") || undefined;
    return ctx.render({ error });
  },
};

export default function LoginPage({ data }: PageProps<LoginData>) {
  const errorMsg = data.error
    ? (ERROR_MESSAGES[data.error] || data.error)
    : undefined;

  return (
    <div class="login-page">
      <div class="login-card">
        <div class="login-brand">gubgub</div>
        <p class="login-sub">Sign in to continue</p>
        {errorMsg && <div class="alert alert-error">{errorMsg}</div>}
        <a href="/api/auth/login" class="btn btn-primary btn-full">
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
