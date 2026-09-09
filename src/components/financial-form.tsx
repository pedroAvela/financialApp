"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useFinance } from "@/components/finance-provider";
import { categories } from "@/data/mock-data";
import { currency, inputMoney, moneyToCents, summarize } from "@/lib/finance";
import { Icon } from "@/components/icon";
import { Progress } from "@/components/ui";
import type { FinancialSettings } from "@/types/finance";

export function FinancialForm({ initial = false }: { initial?: boolean }) {
  const { settings, updateSettings, transactions, month } = useFinance();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { monthly, expenses } = summarize(transactions, settings, month);
  const fields: { key: "expectedIncome" | "openingBalance" | "reserve" | "monthlyLimit"; label: string; hint: string }[] = [
    { key: "expectedIncome", label: "Receita mensal prevista", hint: "Uma estimativa para comparar com seu limite." },
    { key: "openingBalance", label: "Saldo inicial do mês", hint: "Valor disponível antes dos lançamentos do mês." },
    { key: "monthlyLimit", label: "Limite mensal de despesas", hint: "Quanto você pretende gastar no máximo." },
    { key: "reserve", label: "Valor reservado", hint: "Parte do saldo que você deseja separar." },
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(fields.map((field) => [field.key, moneyToCents(String(data.get(field.key)))])) as Pick<FinancialSettings, "expectedIncome" | "openingBalance" | "reserve" | "monthlyLimit">;
    if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0) || values.monthlyLimit <= 0) {
      setMessage("");
      return setError("Use valores válidos em reais, como 1.500,00. O limite mensal deve ser maior que zero.");
    }
    const categoryLimits = { ...settings.categoryLimits };
    if (!initial) {
      for (const category of categories.filter((item) => item.type === "expense")) {
        const amount = moneyToCents(String(data.get(category.id)));
        if (!Number.isFinite(amount) || amount < 0) return setError(`Informe um limite válido para ${category.name}.`);
        categoryLimits[category.id] = amount;
      }
    }
    updateSettings({ ...values, categoryLimits });
    setError("");
    setMessage("Planejamento salvo nesta sessão.");
    if (initial) router.push("/dashboard");
  }

  return <form onSubmit={submit} onChange={() => { setMessage(""); setError(""); }} className="space-y-6">
    <section className="panel form-panel"><div className="section-title"><span className="small-icon"><Icon name="wallet" /></span><div><h2>{initial ? "Vamos começar pelo básico" : "Seu plano para o mês"}</h2><p>Valores em reais. Você pode ajustar quando precisar.</p></div></div><div className="form-grid">{fields.map((field) => <label key={field.key} className="field">{field.label} (R$)<input name={field.key} aria-label={field.label + " (R$)"} aria-describedby={field.key + "-hint"} inputMode="decimal" defaultValue={inputMoney(settings[field.key])} required maxLength={16} /><small id={field.key + "-hint"}>{field.hint}</small></label>)}</div>
      {!initial && <div className="info-box"><Icon name="spark" /><p>Receita prevista: <strong>{currency(settings.expectedIncome)}</strong>. Após o limite de despesas, o planejamento deixa <strong>{currency(settings.expectedIncome - settings.monthlyLimit)}</strong>. A previsão não é contabilizada como receita recebida.</p></div>}
    </section>
    {!initial && <section className="panel form-panel"><div className="section-title"><span className="small-icon"><Icon name="plan" /></span><div><h2>Limites por categoria</h2><p>{currency(expenses)} em despesas no mês selecionado. Use zero para deixar uma categoria sem limite.</p></div></div><div className="budget-grid">{categories.filter((category) => category.type === "expense").map((category) => {
      const spent = monthly.filter((item) => item.type === "expense" && item.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0);
      const limit = settings.categoryLimits[category.id] ?? 0;
      const percent = limit > 0 ? spent / limit * 100 : 0;
      return <div className="budget-item" key={category.id}><div className="budget-heading"><span><i style={{ background: category.color }} />{category.name}</span><small>{limit > 0 ? `${Math.round(percent)}% utilizado` : "Sem limite"}</small></div><Progress value={percent} label={`Limite de ${category.name}`} warning={percent >= 80} /><p>{currency(spent)} gastos {limit > 0 && <>de {currency(limit)}</>}</p><label className="field">Limite de {category.name.toLowerCase()} (R$)<input name={category.id} inputMode="decimal" defaultValue={inputMoney(limit)} required maxLength={16} /></label></div>;
    })}</div><p className="form-note">Os limites por categoria são referências independentes. O limite mensal controla o total de despesas.</p></section>}
    {error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="success-message">{message}</p>}
    <div className="form-actions"><button type="submit" className="button primary"><Icon name={initial ? "arrow" : "check"} />{initial ? "Começar meu controle" : "Salvar planejamento"}</button><span className="form-note">Alterações válidas somente nesta sessão.</span></div>
  </form>;
}

