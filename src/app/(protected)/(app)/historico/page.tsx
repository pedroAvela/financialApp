import type { Metadata } from "next";
import { History } from "@/components/history";

export const metadata: Metadata = { title: "Movimentações" };
export default function HistoryPage() { return <History />; }

