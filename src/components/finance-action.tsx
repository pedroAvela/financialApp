"use client";
import { useRef, useState } from "react";
import { useFinance } from "./finance-provider";
export function useFinanceAction() {
  const { mutate } = useFinance();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function run(action: string, data: Record<string, unknown>, success = "Alterações salvas.") {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError(""); setMessage("");
    try { await mutate(action, data); setMessage(success); return true; }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente."); return false; }
    finally { busy.current = false; setPending(false); }
  }
  return { run, pending, error, message };
}
export function ActionMessages({ error, message }: { error: string; message: string }) {
  return <>{error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="success-message">{message}</p>}</>;
}