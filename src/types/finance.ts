export type TransactionType = "income" | "expense";
export type TransactionStatus = "planned" | "realized";
export type ExpenseKind = "fixed" | "variable";
export interface Profile { user_id: string; name: string; timezone: string; currency: "BRL"; locale: "pt-BR"; onboarding_completed: boolean }
export interface Category { id: string; name: string; color: string; type: TransactionType; active: boolean; default_key: string | null }
export interface Transaction {
  id: string; description: string; amount: number; type: TransactionType; category_id: string; date: string;
  status: TransactionStatus; expense_kind: ExpenseKind | null; recurrence_id: string | null; occurrence_month: string | null; auto_realize?: boolean;
  installment_plan_id?: string | null; installment_number?: number | null; total_installments?: number | null;
  due_date?: string | null; payment_date?: string | null; scheduled_amount_cents?: number | null; deleted_at?: string | null;
}
export interface InstallmentPlan {
  id: string; category_id: string; description: string; total_amount_cents: number; installment_count: number;
  purchase_date: string; first_due_date: string; payment_method: string | null; expense_kind: ExpenseKind;
  status: "active" | "cancelled"; client_request_id: string; created_at: string; updated_at: string;
}
export interface Recurrence {
  id: string; category_id: string; type: TransactionType; amount: number; description: string; expense_kind: ExpenseKind | null;
  day_of_month: number; start_month: string; end_month: string | null; effective_month: string; active: boolean; setup_key: "income" | "fixed" | null;
}
export interface Budget { id: string; month: string; category_id: string | null; amount: number }
export interface FinanceSnapshot {
  profile: Profile; categories: Category[]; transactions: Transaction[]; recurrences: Recurrence[]; budgets: Budget[]; month: string; today: string;
  installmentPlans: InstallmentPlan[]; installmentTransactions: Transaction[];
}
