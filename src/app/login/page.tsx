"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/Icons";
import Logo from "@/components/Logo";
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-card">
        <div className="mb-8 text-center">
          <Logo size={72} className="mx-auto rounded-2xl shadow-lg shadow-black/10" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">SK Kitchen Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
  );
}
