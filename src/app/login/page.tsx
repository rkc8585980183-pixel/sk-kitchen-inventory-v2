"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/Icons";
import { Button, Field, inputCls, Notice } from "@/components/ui";

const MESSAGES: Record<string, string> = {
  inactive: "Your account is deactivated. Please contact your administrator.",
  noprofile: "No profile found for this account. Please contact your administrator.",
};

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sent back here by the app (e.g. deactivated user): clear the session and explain why.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("e");
    if (e) {
      setError(MESSAGES[e] ?? "Please sign in again.");
      supabase.auth.signOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      setError("Invalid email or password.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 font-bold shadow-lg shadow-orange-500/30">SK</div>
          <span className="text-lg font-semibold">SK Kitchen</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Weekly inventory, done right and on time.</h2>
          <ul className="mt-8 space-y-4 text-slate-300">
            {[
              ["inventory", "Fast, simple entry for every department"],
              ["lock", "Automatic entry lock with date limits"],
              ["reports", "Live status and Excel / PDF reports"],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-orange-400">
                  <Icon name={icon as "inventory"} size={16} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} SK Kitchen</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 font-bold text-white shadow-lg shadow-orange-500/30">SK</div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your kitchen inventory account.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && <Notice tone="danger">{error}</Notice>}
            <Field label="Email">
              <input type="email" required autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@company.com" />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls + " pr-10"}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600" aria-label={show ? "Hide password" : "Show password"}>
                  <Icon name={show ? "eyeoff" : "eye"} size={18} />
                </button>
              </div>
            </Field>
            <Button type="submit" variant="primary" loading={loading} className="h-11 w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
