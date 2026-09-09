import type { Category, FinancialSettings, Transaction } from "@/types/finance";

export const demoMonth = "2026-09";
export const categories: Category[] = [
  { id: "housing", name: "Moradia", color: "#137968", type: "expense" },
  { id: "food", name: "Alimentação", color: "#65a897", type: "expense" },
  { id: "transport", name: "Transporte", color: "#a8c8b7", type: "expense" },
  { id: "leisure", name: "Lazer", color: "#d4b77f", type: "expense" },
  { id: "health", name: "Saúde", color: "#8997b1", type: "expense" },
  { id: "other", name: "Outros", color: "#bfaba1", type: "expense" },
  { id: "salary", name: "Salário", color: "#137968", type: "income" },
  { id: "freelance", name: "Trabalho extra", color: "#65a897", type: "income" },
];

export const initialSettings: FinancialSettings = {
  name: "Pedro", email: "pedro@exemplo.com", expectedIncome: 850000,
  openingBalance: 0, reserve: 150000, monthlyLimit: 600000,
  categoryLimits: { housing: 250000, food: 120000, transport: 60000, leisure: 80000, health: 60000, other: 50000 },
};

export const initialTransactions: Transaction[] = [
  { id: "t1", description: "Salário de setembro", amount: 750000, type: "income", categoryId: "salary", date: "2026-09-01" },
  { id: "t2", description: "Aluguel", amount: 220000, type: "expense", categoryId: "housing", date: "2026-09-02" },
  { id: "t3", description: "Projeto freelance", amount: 100000, type: "income", categoryId: "freelance", date: "2026-09-04" },
  { id: "t4", description: "Supermercado", amount: 48650, type: "expense", categoryId: "food", date: "2026-09-05" },
  { id: "t5", description: "Combustível", amount: 22000, type: "expense", categoryId: "transport", date: "2026-09-06" },
  { id: "t6", description: "Farmácia", amount: 12890, type: "expense", categoryId: "health", date: "2026-09-07" },
  { id: "t7", description: "Cinema e jantar", amount: 18500, type: "expense", categoryId: "leisure", date: "2026-09-08" },
  { id: "t8", description: "Café da manhã", amount: 3250, type: "expense", categoryId: "food", date: "2026-09-09" },
];
