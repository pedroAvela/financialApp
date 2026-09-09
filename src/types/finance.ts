export type TransactionType = "income" | "expense";
export type CategoryId = "housing" | "food" | "transport" | "leisure" | "health" | "other" | "salary" | "freelance";

export interface Category {
  id: CategoryId;
  name: string;
  color: string;
  type: TransactionType;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number; // Valores monetários em centavos.
  type: TransactionType;
  categoryId: CategoryId;
  date: string; // YYYY-MM-DD, sem conversão de fuso horário.
}

export interface FinancialSettings {
  name: string;
  email: string;
  expectedIncome: number;
  openingBalance: number;
  reserve: number;
  monthlyLimit: number;
  categoryLimits: Partial<Record<CategoryId, number>>;
}
