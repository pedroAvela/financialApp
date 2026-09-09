"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { demoMonth, initialSettings, initialTransactions } from "@/data/mock-data";
import type { FinancialSettings, Transaction } from "@/types/finance";

interface FinanceContextValue {
  transactions: Transaction[];
  settings: FinancialSettings;
  month: string;
  setMonth: (month: string) => void;
  addTransaction: (transaction: Omit<Transaction, "id">) => void;
  updateSettings: (settings: Partial<FinancialSettings>) => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [settings, setSettings] = useState(initialSettings);
  const [month, setMonth] = useState(demoMonth);

  function addTransaction(transaction: Omit<Transaction, "id">) {
    setTransactions((current) => [{ ...transaction, id: crypto.randomUUID() }, ...current]);
  }

  function updateSettings(value: Partial<FinancialSettings>) {
    setSettings((current) => ({ ...current, ...value }));
  }

  return <FinanceContext.Provider value={{ transactions, settings, month, setMonth, addTransaction, updateSettings }}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance deve ser usado dentro de FinanceProvider.");
  return context;
}
