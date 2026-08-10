import { supabase } from "@/integrations/supabase/client";

export function sanitizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export async function fetchFileAsBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export function buildStorageUrl(baseUrl: string, arquivoUrl: string): string {
  if (arquivoUrl.startsWith("http")) return arquivoUrl;
  const cleanPath = arquivoUrl.startsWith("/") ? arquivoUrl.slice(1) : arquivoUrl;
  return `${baseUrl}/storage/v1/object/public/documentos/${cleanPath}`;
}

export function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ["jpg", "jpeg", "png", "webp", "gif", "pdf"].includes(ext)) return ext;
  } catch {}
  return "jpg";
}

export function formatMonthLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const months = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${months[d.getMonth()]}_${d.getFullYear()}`;
  } catch {
    return dateStr.split("T")[0];
  }
}

export async function getLastBackupDate(): Promise<string | null> {
  const { data } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "ultimo_backup_completo")
    .maybeSingle();
  return data?.valor || null;
}

export async function getLastIncrementalDate(): Promise<string | null> {
  const { data } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "ultimo_backup_incremental")
    .maybeSingle();
  return data?.valor || null;
}

export async function saveBackupTimestamp(chave: string, timestamp: string) {
  const { data: existing } = await supabase
    .from("configuracoes")
    .select("id")
    .eq("chave", chave)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("configuracoes")
      .update({ valor: timestamp, updated_at: new Date().toISOString() })
      .eq("chave", chave);
  } else {
    await supabase
      .from("configuracoes")
      .insert({ chave, valor: timestamp });
  }
}

export function formatDateTimeBR(iso: string | null): string {
  if (!iso) return "Nunca";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export async function uploadBackupToStorage(blob: Blob, fileName: string): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // List existing backups and keep only the last 4 (delete oldest)
    const { data: existingFiles } = await supabase.storage.from("backups").list("", {
      sortBy: { column: "created_at", order: "asc" },
    });

    if (existingFiles && existingFiles.length >= 5) {
      const toDelete = existingFiles.slice(0, existingFiles.length - 4);
      if (toDelete.length > 0) {
        await supabase.storage.from("backups").remove(toDelete.map(f => f.name));
      }
    }

    const { data, error } = await supabase.storage
      .from("backups")
      .upload(fileName, blob, {
        contentType: "application/zip",
        upsert: true,
      });

    if (error) return { success: false, error: error.message };
    return { success: true, path: data?.path };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro desconhecido" };
  }
}

export async function listCloudBackups() {
  const { data, error } = await supabase.storage.from("backups").list("", {
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return [];
  return data || [];
}

export async function downloadCloudBackup(fileName: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from("backups").download(fileName);
  if (error) return null;
  return data;
}

export async function deleteCloudBackup(fileName: string): Promise<boolean> {
  const { error } = await supabase.storage.from("backups").remove([fileName]);
  return !error;
}
