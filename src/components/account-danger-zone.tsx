"use client";
import { useRef, useState, type FormEvent } from "react";

export function AccountDangerZone() {
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);

  async function exportData() {
    if (busy.current) return;
    busy.current = true; setPending("export"); setError("");
    try {
      const response = await fetch("/api/account/export", { cache: "no-store" });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Não foi possível exportar seus dados."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "meus-dados-financeiros.json";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível exportar seus dados. Tente novamente."); }
    finally { busy.current = false; setPending(null); }
  }

  async function removeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (confirmation !== "EXCLUIR" || !password) { setError("Digite EXCLUIR e informe sua senha atual."); return; }
    busy.current = true; setPending("delete"); setError("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation, password }),
      });
      if (response.status === 401) { window.location.replace("/login"); return; }
      const result = await response.json();
      if (!response.ok || result.deleted !== true) throw new Error(result.error || "Não foi possível excluir sua conta. Tente novamente.");
      window.location.replace("/login?notice=conta_excluida");
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível concluir a exclusão. Verifique sua conexão e tente novamente."); }
    finally { setPassword(""); busy.current = false; setPending(null); }
  }

  return <section className="panel form-panel account-danger-zone" aria-labelledby="danger-title" aria-busy={pending !== null}>
    <h2 id="danger-title">Zona de perigo</h2>
    <p className="muted mt-3">Excluir sua conta é definitivo e não pode ser desfeito. Seu acesso, perfil, categorias, receitas, despesas, compras parceladas, recorrências, orçamentos e eventuais arquivos serão apagados.</p>
    <p className="muted mt-3">Antes de continuar, você pode baixar seus dados financeiros de todos os períodos em JSON. Guarde a exportação em um local seguro.</p>
    <div className="form-actions mt-5">
      <button className="button secondary" type="button" disabled={pending !== null} onClick={exportData}>{pending === "export" ? "Exportando..." : "Exportar meus dados"}</button>
      {!expanded && <button className="button account-delete-button" type="button" onClick={() => { setExpanded(true); setError(""); }} disabled={pending !== null}>Excluir minha conta</button>}
    </div>
    {expanded && <form className="mt-6" onSubmit={removeAccount}>
      <fieldset disabled={pending !== null}>
        <legend className="sr-only">Confirmação da exclusão definitiva</legend>
        <p id="delete-warning" className="mb-5">Confirme sua identidade com a senha atual. A remoção de arquivos começa antes da exclusão da conta; arquivos já removidos não serão recuperados se houver uma falha.</p>
        <div className="form-grid">
          <label className="field">Digite EXCLUIR<input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required pattern="EXCLUIR" autoComplete="off" spellCheck={false} aria-describedby="delete-warning" /></label>
          <label className="field">Senha atual<input name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required maxLength={1024} /></label>
        </div>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => { setExpanded(false); setConfirmation(""); setPassword(""); setError(""); }}>Cancelar</button>
          <button type="submit" className="button account-delete-button" disabled={confirmation !== "EXCLUIR" || !password}>{pending === "delete" ? "Excluindo conta..." : "Excluir minha conta definitivamente"}</button></div>
      </fieldset>
    </form>}
    {pending === "delete" && <p className="muted mt-4" role="status">Exclusão em andamento. Aguarde a conclusão.</p>}
    {error && <p className="error-message mt-4" role="alert">{error}</p>}
  </section>;
}
