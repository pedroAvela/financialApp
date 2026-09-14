export class AccountDeletionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type AccountIdentity = { id: string; email?: string; hasMfa: boolean };
export type OwnedObject = { bucket_id: string; name: string };
export type DeletionDependencies = {
  getIdentity(): Promise<AccountIdentity | null>;
  reauthenticate(email: string, password: string): Promise<AccountIdentity | null>;
  releaseReauthentication(): Promise<void>;
  getAdmin(): {
    listObjects(userId: string): Promise<OwnedObject[]>;
    removeObjects(bucket: string, paths: string[]): Promise<void>;
    deleteUser(userId: string, softDelete: false): Promise<void>;
  };
};

/** O ID vem exclusivamente de getIdentity(), nunca do corpo da requisição. */
export async function deleteOwnAccount(body: unknown, deps: DeletionDependencies) {
  const user = await deps.getIdentity();
  if (!user) throw new AccountDeletionError("Sua sessão expirou. Entre novamente.", 401);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AccountDeletionError("Dados inválidos.");
  const values = body as Record<string, unknown>;
  if (Object.keys(values).some((key) => !["confirmation", "password"].includes(key))) throw new AccountDeletionError("Campos não permitidos.");
  if (values.confirmation !== "EXCLUIR") throw new AccountDeletionError("Digite EXCLUIR exatamente como indicado.");
  if (typeof values.password !== "string" || !values.password || values.password.length > 1024) throw new AccountDeletionError("Informe sua senha atual.");
  // O aplicativo atual usa e-mail/senha. Não reduzir uma conta com MFA a senha apenas.
  if (!user.email || user.hasMfa) throw new AccountDeletionError("Esta conta exige outro método de confirmação de identidade, ainda não disponível nesta tela.", 403);
  try {
    const verified = await deps.reauthenticate(user.email, values.password);
    if (!verified || verified.id !== user.id || verified.hasMfa) throw new AccountDeletionError("Não foi possível confirmar sua identidade. Verifique sua senha atual.", 403);
    let admin: ReturnType<DeletionDependencies["getAdmin"]>;
    try { admin = deps.getAdmin(); } catch {
      throw new AccountDeletionError("A exclusão de conta ainda não está configurada no servidor. Tente novamente após a configuração.", 503);
    }
    try {
      let previousBatch = "";
      for (let batch = 0; ; batch++) {
        const objects = await admin.listObjects(user.id);
        if (objects.length === 0) break;
        const fingerprint = JSON.stringify(objects);
        if (fingerprint === previousBatch || batch >= 1000) throw new Error("Storage sem progresso");
        previousBatch = fingerprint;
        const buckets = new Map<string, string[]>();
        for (const object of objects) {
          if (!object.bucket_id || !object.name) throw new Error("Inventário inválido");
          const paths = buckets.get(object.bucket_id) ?? [];
          paths.push(object.name);
          buckets.set(object.bucket_id, paths);
        }
        for (const [bucket, paths] of buckets) {
          for (let offset = 0; offset < paths.length; offset += 100) await admin.removeObjects(bucket, paths.slice(offset, offset + 100));
        }
      }
    } catch {
      throw new AccountDeletionError("Não foi possível concluir a remoção dos arquivos. Sua conta foi mantida; alguns arquivos podem já ter sido removidos. Tente excluir novamente.", 503);
    }
    try { await admin.deleteUser(user.id, false); } catch {
      throw new AccountDeletionError("Não foi possível concluir a exclusão da conta. Arquivos já removidos não serão restaurados. Tente novamente; se sua sessão tiver encerrado, volte ao login.", 503);
    }
  } finally {
    // A sessão temporária da verificação de senha nunca substitui a do navegador.
    try { await deps.releaseReauthentication(); } catch { /* Não converter exclusão concluída em falha. */ }
  }
}
