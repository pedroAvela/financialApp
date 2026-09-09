import Link from "next/link";
import { Brand } from "@/components/ui";

export default function NotFound() {
  return <main className="not-found"><Brand /><p className="eyebrow">PÁGINA NÃO ENCONTRADA</p><h1>Vamos voltar ao seu controle?</h1><p>O endereço acessado não existe.</p><Link href="/dashboard" className="button primary">Ir para a visão geral</Link></main>;
}

