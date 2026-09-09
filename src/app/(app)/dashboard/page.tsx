import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Visão geral" };
export default function DashboardPage() { return <Dashboard />; }

