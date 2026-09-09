"use client";

import { categories } from "@/data/mock-data";
import { currency, dateLabel } from "@/lib/finance";
import { Icon } from "@/components/icon";
import type { Transaction } from "@/types/finance";

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) return <div className="empty-state"><Icon name="history" size={32} /><h3>Nenhuma movimentação por aqui</h3><p>Adicione um lançamento ou experimente outro filtro.</p></div>;
  return <div className="table-wrap"><table><caption className="sr-only">Movimentações financeiras</caption><thead><tr><th>Descrição</th><th className="category-column">Categoria</th><th>Data</th><th className="text-right">Valor</th></tr></thead><tbody>{sorted.map((item) => {
    const category = categories.find((category) => category.id === item.categoryId);
    return <tr key={item.id}><td><div className="transaction-name"><span className={`transaction-icon ${item.type}`}><Icon name={item.type === "income" ? "up" : "down"} size={17} /></span><div><strong>{item.description}</strong><small>{item.type === "income" ? "Receita" : "Despesa"}</small></div></div></td><td className="category-column"><span className="category-tag"><i style={{ background: category?.color }} />{category?.name}</span></td><td className="date-cell">{dateLabel(item.date)}</td><td className={`amount ${item.type === "income" ? "positive" : ""}`}>{item.type === "income" ? "+" : "−"} {currency(item.amount)}</td></tr>;
  })}</tbody></table></div>;
}

