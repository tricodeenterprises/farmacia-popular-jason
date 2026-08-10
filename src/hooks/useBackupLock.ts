import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const BACKUP_LOCK_KEY = "backup_em_andamento";
const BACKUP_LOCK_TIMEOUT_MS = 30 * 60 * 1000;

interface BackupLockState {
  isLocked: boolean;
  lockMessage: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  elapsedMinutes: number;
  status: string | null;
  isStale: boolean;
}

function parseBackupLock(raw: string | null | undefined) {
  if (!raw || raw === "false" || raw === "") return null;

  const parts = raw.split("|");

  return {
    active: parts[0] === "true",
    userName: parts[1] || "Sistema",
    startedAt: parts[2] || null,
    status: parts[3] || "Processando backup",
  };
}

function getElapsedMinutes(startedAt: string | null) {
  if (!startedAt) return 0;
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 60000));
}

function isLockStale(startedAt: string | null) {
  if (!startedAt) return true;
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return true;
  return Date.now() - started > BACKUP_LOCK_TIMEOUT_MS;
}

export function useBackupLock() {
  const [state, setState] = useState<BackupLockState>({
    isLocked: false,
    lockMessage: null,
    lockedBy: null,
    startedAt: null,
    elapsedMinutes: 0,
    status: null,
    isStale: false,
  });

  const checkLock = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", BACKUP_LOCK_KEY)
        .maybeSingle();

      const parsed = parseBackupLock(data?.valor);

      if (!parsed?.active) {
        setState({
          isLocked: false,
          lockMessage: null,
          lockedBy: null,
          startedAt: null,
          elapsedMinutes: 0,
          status: null,
          isStale: false,
        });
        return;
      }

      if (isLockStale(parsed.startedAt)) {
        await clearBackupLock();
        setState({
          isLocked: false,
          lockMessage: null,
          lockedBy: null,
          startedAt: null,
          elapsedMinutes: 0,
          status: null,
          isStale: true,
        });
        return;
      }

      const elapsedMinutes = getElapsedMinutes(parsed.startedAt);

      setState({
        isLocked: true,
        lockedBy: parsed.userName,
        startedAt: parsed.startedAt,
        elapsedMinutes,
        status: parsed.status,
        isStale: false,
        lockMessage: `Backup em andamento por ${parsed.userName}. Tempo: ${elapsedMinutes} min. Status: ${parsed.status}.`,
      });
    } catch {
      setState({
        isLocked: false,
        lockMessage: null,
        lockedBy: null,
        startedAt: null,
        elapsedMinutes: 0,
        status: null,
        isStale: false,
      });
    }
  }, []);

  useEffect(() => {
    checkLock();
    const interval = setInterval(checkLock, 10000);
    return () => clearInterval(interval);
  }, [checkLock]);

  return state;
}

export async function setBackupLock(userName: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("configuracoes")
      .select("id, valor")
      .eq("chave", BACKUP_LOCK_KEY)
      .maybeSingle();

    const parsed = parseBackupLock(existing?.valor);

    if (parsed?.active && !isLockStale(parsed.startedAt)) {
      return false;
    }

    const valor = `true|${userName}|${now}|Iniciando backup`;

    if (existing) {
      await supabase
        .from("configuracoes")
        .update({ valor, updated_at: now })
        .eq("chave", BACKUP_LOCK_KEY);
    } else {
      await supabase
        .from("configuracoes")
        .insert({ chave: BACKUP_LOCK_KEY, valor });
    }

    return true;
  } catch {
    return false;
  }
}

export async function updateBackupLockStatus(status: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", BACKUP_LOCK_KEY)
      .maybeSingle();

    const parsed = parseBackupLock(data?.valor);
    if (!parsed?.active) return;

    const valor = `true|${parsed.userName}|${parsed.startedAt || new Date().toISOString()}|${status}`;

    await supabase
      .from("configuracoes")
      .update({ valor, updated_at: new Date().toISOString() })
      .eq("chave", BACKUP_LOCK_KEY);
  } catch {
    // silent
  }
}

export async function clearBackupLock(): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("configuracoes")
      .select("id")
      .eq("chave", BACKUP_LOCK_KEY)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("configuracoes")
        .update({ valor: "false", updated_at: new Date().toISOString() })
        .eq("chave", BACKUP_LOCK_KEY);
    } else {
      await supabase
        .from("configuracoes")
        .insert({ chave: BACKUP_LOCK_KEY, valor: "false" });
    }
  } catch {
    // silent
  }
}
