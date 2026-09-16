// Browser component harness only. Never imported by the application.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FinanceProvider, FinanceGate, useFinance } from "../../src/components/finance-provider";
import { TransactionForm } from "../../src/components/transaction-form";
import { InstallmentDetails } from "../../src/components/installment-details";
import { Dashboard } from "../../src/components/dashboard";
import { History } from "../../src/components/history";

function Harness() {
  const { setMonth } = useFinance();
  const [view,setView]=useState(new URL(location.href).searchParams.get("view") ?? "create");
  return <main style={{maxWidth:1100,margin:"auto",padding:16}}><nav className="form-actions mb-6"><button onClick={() => setView("dashboard")}>Teste: dashboard</button><button onClick={() => setView("history")}>Teste: histórico</button><button onClick={() => setMonth("2025-02")}>Teste: fevereiro</button></nav><FinanceGate>{view === "create" ? <TransactionForm /> : view === "details" ? <InstallmentDetails planId="11111111-1111-4111-8111-111111111111" onClose={() => setView("history")} /> : view === "dashboard" ? <Dashboard /> : <History />}</FinanceGate></main>;
}
createRoot(document.getElementById("root")!).render(<FinanceProvider profile={{name:"Teste local",email:"test@example.invalid"}}><Harness /></FinanceProvider>);
