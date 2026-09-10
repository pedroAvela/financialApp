"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FinanceSnapshot } from "@/types/finance";

interface FinanceContextValue {
  data: FinanceSnapshot | null; loading: boolean; error: string; month: string;
  setMonth: (month: string) => void; reload: () => Promise<void>;
  mutate: (action: string, data: Record<string, unknown>) => Promise<void>;
  identity: { name: string; email: string };
}
const FinanceContext = createContext<FinanceContextValue | null>(null);
export function FinanceProvider({ children, profile }: { children: ReactNode; profile: { name: string; email: string } }) {
  const [data, setData] = useState<FinanceSnapshot | null>(null);
  const [month, setMonthState] = useState("");
  const monthRef = useRef("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++generation.current;
    try {
      const response = await fetch("/api/finance" + (monthRef.current ? "?month=" + monthRef.current : ""), { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar seus dados.");
      if (signal?.aborted || requestId !== generation.current) return;
      monthRef.current = result.month;
      setMonthState(result.month);
      setData(result);
    } catch (error) {
      if (!signal?.aborted && requestId === generation.current) setError(error instanceof Error ? error.message : "Falha ao consultar seus dados.");
    } finally { if (!signal?.aborted && requestId === generation.current) setLoading(false); }
  }, []);
  const reload = useCallback(() => { setLoading(true); setError(""); return load(); }, [load]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  function setMonth(value: string) { monthRef.current = value; setMonthState(value); void reload(); }
  async function mutate(action: string, values: Record<string, unknown>) {
    const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data: values }) });
    const result = await response.json();
    if (!response.ok || !result.saved) throw new Error(result.error || "Não foi possível salvar. Tente novamente.");
    // A refresh failure is displayed separately; it must not suggest that a
    // successful write failed and encourage the user to submit it again.
    await reload();
    setError((current) => current ? "Alteração salva, mas a atualização da tela falhou. " + current : "");
  }
  return <FinanceContext.Provider value={{ data, loading, error, month, setMonth, reload, mutate, identity: profile }}>{children}</FinanceContext.Provider>;
}
export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance deve ser usado dentro de FinanceProvider.");
  return context;
}
export function FinanceGate({ children }: { children: ReactNode }) {
  const { data, loading, error, month, reload } = useFinance();
  if (loading && (!data || data.month !== month)) return <section className="panel form-panel" role="status" aria-live="polite">Carregando seus dados financeiros...</section>;
  if (error) return <section className="panel form-panel"><p role="alert" className="error-message">{error}</p><button className="button secondary" onClick={() => void reload()}>Tentar novamente</button></section>;
  if (!data) return <p role="alert">Não foi possível carregar seus dados.</p>;
  return <><div className="refresh-status" role="status" aria-live="polite">{loading ? "Atualizando seus dados..." : ""}</div><div className="finance-content" aria-busy={loading}>{children}</div></>;
}
