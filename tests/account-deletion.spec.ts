import { expect, test } from "@playwright/test";
import { deleteOwnAccount, type DeletionDependencies, type OwnedObject } from "../src/lib/account-deletion";

const a = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com", hasMfa: false };
const b = { id: "22222222-2222-4222-8222-222222222222", email: "b@example.com", hasMfa: false };
const body = { confirmation: "EXCLUIR", password: "senha-de-teste" };
function fixture() {
  const events: string[] = [];
  let files: OwnedObject[] = [];
  const deps: DeletionDependencies = {
    async getIdentity() { events.push("identity"); return a; },
    async reauthenticate(email, password) { expect(email).toBe(a.email); expect(password).toBe(body.password); events.push("password"); return a; },
    async releaseReauthentication() { events.push("release"); },
    getAdmin() {
      events.push("admin");
      return {
        async listObjects(id) { expect(id).toBe(a.id); events.push("list"); return [...files]; },
        async removeObjects(bucket, paths) { events.push(`remove:${bucket}`); files = files.filter((file) => file.bucket_id !== bucket || !paths.includes(file.name)); },
        async deleteUser(id, softDelete) { expect(id).toBe(a.id); expect(softDelete).toBe(false); events.push("delete"); },
      };
    },
  };
  return { deps, events, setFiles(value: OwnedObject[]) { files = value; }, getFiles() { return files; } };
}

test("exclusão sem autenticação não verifica senha nem cria cliente administrativo", async () => {
  const f = fixture(); f.deps.getIdentity = async () => null;
  await expect(deleteOwnAccount(body, f.deps)).rejects.toMatchObject({ status: 401 });
  expect(f.events).toEqual([]);
});

test("confirmação incorreta e campos alheios não chegam ao administrador", async () => {
  for (const input of [null, [], { ...body, confirmation: "excluir" }, { ...body, confirmation: "EXCLUIR " }, { ...body, password: "" }, { ...body, user_id: b.id }, { ...body, id: b.id }, { ...body, email: b.email }]) {
    const f = fixture();
    await expect(deleteOwnAccount(input, f.deps)).rejects.toMatchObject({ status: 400 });
    expect(f.events).toEqual(["identity"]);
  }
});

test("senha incorreta ou identidade de outra conta impede qualquer exclusão", async () => {
  for (const verified of [null, b]) {
    const f = fixture(); f.deps.reauthenticate = async () => verified;
    await expect(deleteOwnAccount(body, f.deps)).rejects.toMatchObject({ status: 403 });
    expect(f.events).toEqual(["identity", "release"]);
  }
});

test("conta com MFA não pode ser confirmada só com senha", async () => {
  const f = fixture(); f.deps.getIdentity = async () => ({ ...a, hasMfa: true });
  await expect(deleteOwnAccount(body, f.deps)).rejects.toMatchObject({ status: 403 });
  expect(f.events).toEqual([]);
  f.deps.getIdentity = async () => a;
  f.deps.reauthenticate = async () => ({ ...a, hasMfa: true });
  await expect(deleteOwnAccount(body, f.deps)).rejects.toMatchObject({ status: 403 });
  expect(f.events).toEqual(["release"]);
});

test("exclusão definitiva deriva UUID da sessão e só exclui Auth após todos os arquivos", async () => {
  const f = fixture();
  f.setFiles([{ bucket_id: "documents", name: "pasta/sub/arquivo.pdf" }, { bucket_id: "avatars", name: "avatar.png" }]);
  await deleteOwnAccount(body, f.deps);
  expect(f.events).toEqual(["identity", "password", "admin", "list", "remove:documents", "remove:avatars", "list", "delete", "release"]);
  expect(f.getFiles()).toEqual([]);
});

test("falha parcial no Storage preserva Auth e repetição remove somente arquivos restantes", async () => {
  const f = fixture();
  f.setFiles([{ bucket_id: "first", name: "a" }, { bucket_id: "second", name: "b" }]);
  const createAdmin = f.deps.getAdmin;
  f.deps.getAdmin = () => {
    const admin = createAdmin();
    return { ...admin, async removeObjects(bucket, paths) { if (bucket === "second") throw new Error("segredo-interno"); await admin.removeObjects(bucket, paths); } };
  };
  await expect(deleteOwnAccount(body, f.deps)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Sua conta foi mantida") });
  expect(f.events).not.toContain("delete");
  expect(f.getFiles()).toEqual([{ bucket_id: "second", name: "b" }]);
  f.deps.getAdmin = createAdmin;
  await deleteOwnAccount(body, f.deps);
  expect(f.events.filter((event) => event === "remove:first")).toHaveLength(1);
  expect(f.events.filter((event) => event === "delete")).toHaveLength(1);
});

test("falha de inventário ou ausência de progresso nunca exclui Auth", async () => {
  for (const scenario of ["query-failure", "no-progress"]) {
    const f = fixture(); f.setFiles([{ bucket_id: "files", name: "a" }]);
    const createAdmin = f.deps.getAdmin;
    f.deps.getAdmin = () => ({ ...createAdmin(), async listObjects() { if (scenario === "query-failure") throw new Error("segredo-interno"); return f.getFiles(); }, async removeObjects() {} });
    await expect(deleteOwnAccount(body, f.deps)).rejects.toMatchObject({ status: 503, message: expect.not.stringContaining("segredo-interno") });
    expect(f.events).not.toContain("delete");
  }
});

test("remoção respeita lotes da API e pagina a partir dos objetos restantes", async () => {
  const f = fixture();
  f.setFiles(Array.from({ length: 1101 }, (_, i) => ({ bucket_id: "files", name: `${i}.txt` })));
  const createAdmin = f.deps.getAdmin;
  f.deps.getAdmin = () => {
    const admin = createAdmin();
    return { ...admin, async listObjects() { return f.getFiles().slice(0, 500); }, async removeObjects(bucket, paths) { expect(paths.length).toBeLessThanOrEqual(100); await admin.removeObjects(bucket, paths); } };
  };
  await deleteOwnAccount(body, f.deps);
  expect(f.getFiles()).toEqual([]);
  expect(f.events).toContain("delete");
});

test("falha no Auth após remover arquivos permite repetir sem restaurar objetos", async () => {
  const f = fixture(); f.setFiles([{ bucket_id: "files", name: "a" }]);
  const createAdmin = f.deps.getAdmin;
  f.deps.getAdmin = () => ({ ...createAdmin(), async deleteUser() { throw new Error("segredo-interno"); } });
  await expect(deleteOwnAccount(body, f.deps)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Arquivos já removidos") });
  expect(f.getFiles()).toEqual([]);
  f.deps.getAdmin = createAdmin;
  await deleteOwnAccount(body, f.deps);
  expect(f.events.filter((event) => event === "remove:files")).toHaveLength(1);
  expect(f.events.filter((event) => event === "delete")).toHaveLength(1);
});

test("configuração administrativa ausente impede exclusão e libera sessão temporária", async () => {
  const f = fixture(); f.deps.getAdmin = () => { throw new Error("segredo-interno"); };
  await expect(deleteOwnAccount(body, f.deps)).rejects.toMatchObject({ status: 503, message: expect.not.stringContaining("segredo-interno") });
  expect(f.events).toEqual(["identity", "password", "release"]);
});

test("falha ao encerrar sessão temporária não muda exclusão concluída para erro", async () => {
  const f = fixture(); f.deps.releaseReauthentication = async () => { throw new Error("sessão já removida"); };
  await expect(deleteOwnAccount(body, f.deps)).resolves.toBeUndefined();
  expect(f.events).toContain("delete");
});
