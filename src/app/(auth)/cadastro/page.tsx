import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Cadastro" };
export default function SignupPage() { return <AuthForm signup />; }

