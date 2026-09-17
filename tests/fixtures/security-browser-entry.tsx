// Test-only composition of real components; never imported by the application.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FinanceProvider } from "../../src/components/finance-provider";
import { History } from "../../src/components/history";
import { LogoutButton } from "../../src/components/logout-button";
function Fixture() {
  const [account, setAccount] = useState("A");
  return <main><button onClick={() => { document.documentElement.dataset.account="B"; setAccount("B"); }}>Teste: mudar conta</button><LogoutButton /><FinanceProvider key={account} profile={{ name: account, email: "fixture@example.invalid" }}><History /></FinanceProvider></main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
