import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { setBackupLock, clearBackupLock, updateBackupLockStatus } from "@/hooks/useBackupLock";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  sanitizeName, fetchFileAsBlob, buildStorageUrl, getExtFromUrl,
  formatMonthLabel, saveBackupTimestamp, uploadBackupToStorage,
} from "@/lib/backup-utils";

const BACKUP_SCHEDULE: Record<string, number> = {
  kaynan: 8,
  samir: 12,
  paulo: 17,
  luca: 20,
};

export function useAutoBackup() {
  const { profile, user } = useAuth();
  const lastTriggeredRef = useRef<string>("");
  const runningRef = useRef(false);

  const runBackup = useCallback(async (userName: string) => {
    if (runningRef.current) return;
    runningRef.current = true;

    const locked = await setBackupLock(userName);
    if (!locked) {
      runningRef.current = false;
      return;
    }

    await updateBackupLockStatus("Backup iniciado");
    toast.info(`Backup automatico iniciado por ${userName}...`, { duration: 10000 });

    try {
      const now = new Date().toISOString();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      await updateBackupLockStatus("Buscando pacientes");
      const { data: pacientes } = await supabase.from("pacientes").select("*").order("nome");

      if (!pacientes || pacientes.length === 0) {
        toast.warning("Nenhum paciente para backup.");
        return;
      }

      const zip = new JSZip();
      let totalFiles = 0;
      let totalCiclos = 0;

      for (let i = 0; i < pacientes.length; i++) {
        const pac = pacientes[i];

        await updateBackupLockStatus(`Processando paciente ${i + 1} de ${pacientes.length}`);

        const folderName = `${sanitizeName(pac.nome)}_${pac.cpf.replace(/\D/g, "")}`;

        const { data: ciclos } = await supabase
          .from("ciclos")
          .select("*, receitas(tipo, nome_medico, data_emissao, validade_ate, arquivo_url)")
          .eq("paciente_id", pac.id)
          .order("created_at", { ascending: true });

        if (!ciclos || ciclos.length === 0) continue;

        const pacFolder = zip.folder(folderName)!;

        for (let ci = 0; ci < ciclos.length; ci++) {
          const ciclo = ciclos[ci];
          const receita = (ciclo as any).receitas;
          const tipoLabel = receita?.tipo === "fralda" ? "Fralda" : "Medicamento";
          const statusLabel = ciclo.status === "ativo" ? "Ativo" : "Encerrado";
          const cicloFolder = pacFolder.folder(`Ciclo_${ci + 1}_${tipoLabel}_${statusLabel}`)!;
          let cicloHasFiles = false;

          if (receita?.arquivo_url) {
            const receitaUrl = buildStorageUrl(supabaseUrl, receita.arquivo_url);
            const blob = await fetchFileAsBlob(receitaUrl);
            if (blob) {
              cicloFolder.file(`receita.${getExtFromUrl(receitaUrl)}`, blob);
              totalFiles++;
              cicloHasFiles = true;
            }
          }

          const { data: docs } = await supabase
            .from("documentos")
            .select("*")
            .eq("paciente_id", pac.id)
            .eq("ciclo_id", ciclo.id)
            .order("created_at", { ascending: true });

          const fixedDocs = (docs || []).filter(d => d.tipo !== "cupom_fiscal");
          const docCountByType: Record<string, number> = {};

          for (const doc of fixedDocs) {
            const docUrl = buildStorageUrl(supabaseUrl, doc.arquivo_url);
            const blob = await fetchFileAsBlob(docUrl);
            if (blob) {
              const ext = getExtFromUrl(docUrl);
              const count = (docCountByType[doc.tipo] || 0) + 1;
              docCountByType[doc.tipo] = count;
              const suffix = count > 1 ? `_${count}` : "";
              cicloFolder.file(`${doc.tipo}${suffix}.${ext}`, blob);
              totalFiles++;
              cicloHasFiles = true;
            }
          }

          const { data: allDisps } = await supabase
            .from("dispensacoes")
            .select("*")
            .eq("ciclo_id", ciclo.id)
            .eq("cancelada", false)
            .order("created_at", { ascending: true });

          if (allDisps && allDisps.length > 0) {
            for (let di = 0; di < allDisps.length; di++) {
              const disp = allDisps[di];
              const monthLabel = formatMonthLabel(disp.created_at);
              const dispFolder = cicloFolder.folder(`Retirada_${di + 1}_${monthLabel}`)!;

              const { data: cupomDocs } = await supabase
                .from("documentos")
                .select("*")
                .eq("paciente_id", pac.id)
                .eq("ciclo_id", ciclo.id)
                .eq("tipo", "cupom_fiscal")
                .order("created_at", { ascending: true });

              const cupom = (cupomDocs || [])[di];

              if (cupom) {
                const cupomUrl = buildStorageUrl(supabaseUrl, cupom.arquivo_url);
                const blob = await fetchFileAsBlob(cupomUrl);
                if (blob) {
                  dispFolder.file(`cupom_fiscal.${getExtFromUrl(cupomUrl)}`, blob);
                  totalFiles++;
                  cicloHasFiles = true;
                }
              }
            }
          }

          if (cicloHasFiles) totalCiclos++;
        }
      }

      await updateBackupLockStatus("Gerando dados do banco");

      const dataFolder = zip.folder("_dados_banco")!;
      const [allPac, allCic, allDisp, allDoc] = await Promise.all([
        supabase.from("pacientes").select("*"),
        supabase.from("ciclos").select("*, receitas(*)"),
        supabase.from("dispensacoes").select("*").eq("cancelada", false),
        supabase.from("documentos").select("*"),
      ]);

      dataFolder.file("dados.json", JSON.stringify({
        exportado_em: now,
        tipo_backup: "completo_automatico",
        usuario: userName,
        pacientes: allPac.data || [],
        ciclos: allCic.data || [],
        dispensacoes: allDisp.data || [],
        documentos: allDoc.data || [],
      }, null, 2));

      await updateBackupLockStatus("Compactando backup");
      const content = await zip.generateAsync({ type: "blob" });

      const dateLabel = new Date().toISOString().split("T")[0];
      const hourLabel = new Date().getHours().toString().padStart(2, "0");
      const fileName = `backup_auto_${userName.toLowerCase()}_${dateLabel}_${hourLabel}h.zip`;

      saveAs(content, fileName);

      await updateBackupLockStatus("Enviando backup para a nuvem");
      const uploadResult = await uploadBackupToStorage(content, fileName);

      if (uploadResult.success) {
        await saveBackupTimestamp("ultimo_backup_completo", now);
      }

      await supabase.from("logs").insert({
        user_id: user?.id,
        acao: "backup_automatico",
        detalhes: {
          arquivos: totalFiles,
          ciclos: totalCiclos,
          usuario: userName,
          nuvem: uploadResult.success,
        } as any,
      });

      await updateBackupLockStatus("Backup concluido");
      toast.success(`Backup automatico concluido. ${totalFiles} arquivos.`, { duration: 8000 });
    } catch (err) {
      console.error("Erro no backup automatico:", err);
      toast.error("Erro no backup automatico.");
    } finally {
      await clearBackupLock();
      runningRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!profile?.nome) return;

    const userName = profile.nome.toLowerCase().trim();

    const scheduledHour = Object.entries(BACKUP_SCHEDULE).find(
      ([name]) => userName.includes(name.toLowerCase())
    );

    if (!scheduledHour) return;

    const [, targetHour] = scheduledHour;

    const checkSchedule = () => {
      if (document.hidden) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      if (currentHour === targetHour && currentMinute < 5) {
        const todayKey = `${now.toISOString().split("T")[0]}-${targetHour}`;
        if (lastTriggeredRef.current !== todayKey) {
          lastTriggeredRef.current = todayKey;
          runBackup(profile.nome);
        }
      }
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 30000);
    return () => clearInterval(interval);
  }, [profile?.nome, runBackup]);
}
