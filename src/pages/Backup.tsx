import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Download, Loader2, CheckCircle2, Clock, AlertTriangle,
  DatabaseBackup, ArrowDownToLine, Cloud, Trash2, CloudDownload
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import AppLayout from "@/components/AppLayout";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  sanitizeName, fetchFileAsBlob, buildStorageUrl, getExtFromUrl,
  formatMonthLabel, getLastBackupDate, getLastIncrementalDate,
  saveBackupTimestamp, formatDateTimeBR, uploadBackupToStorage,
  listCloudBackups, downloadCloudBackup, deleteCloudBackup
} from "@/lib/backup-utils";

type BackupStats = { pacientes: number; arquivos: number; ciclos: number };
type CloudFile = { name: string; created_at: string; metadata?: { size?: number } };

function isTodayBackup(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.toLocaleDateString("en-CA") === new Date().toLocaleDateString("en-CA");
}

export default function Backup() {
  const { isMaster } = useAuth();
  const [loading, setLoading] = useState(false);
  const [backupType, setBackupType] = useState<"completo" | "incremental" | null>(null);
  const [progress, setProgress] = useState("");
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [lastCompleto, setLastCompleto] = useState<string | null>(null);
  const [lastIncremental, setLastIncremental] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [pendingType, setPendingType] = useState<"completo" | "incremental" | null>(null);
  const [cloudBackups, setCloudBackups] = useState<CloudFile[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);

  useEffect(() => {
    if (isMaster) {
      getLastBackupDate().then(setLastCompleto);
      getLastIncrementalDate().then(setLastIncremental);
      loadCloudBackups();
    }
  }, [isMaster]);

  const loadCloudBackups = async () => {
    const files = await listCloudBackups();
    setCloudBackups(files as CloudFile[]);
  };

  const backupCompletoHoje = isTodayBackup(lastCompleto);

  if (!isMaster) {
    return (
      <AppLayout title="Backup obrigatório">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-500" /> Backup diário pendente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                O sistema só é liberado quando existe um backup completo concluído no dia atual. Solicite ao administrador master para executar o backup completo.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Último completo:</span>
                <Badge variant={backupCompletoHoje ? "outline" : "destructive"} className="font-mono text-xs">
                  {formatDateTimeBR(lastCompleto)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const requestBackup = (type: "completo" | "incremental") => {
    setPendingType(type);
    setShowAlert(true);
  };

  const confirmBackup = () => {
    setShowAlert(false);
    if (pendingType) handleBackup(pendingType);
  };

  const handleCloudDownload = async (fileName: string) => {
    setLoadingCloud(true);
    const blob = await downloadCloudBackup(fileName);
    if (blob) {
      saveAs(blob, fileName);
      toast.success("Backup baixado com sucesso!");
    } else {
      toast.error("Erro ao baixar backup.");
    }
    setLoadingCloud(false);
  };

  const handleCloudDelete = async (fileName: string) => {
    const ok = await deleteCloudBackup(fileName);
    if (ok) {
      toast.success("Backup removido da nuvem.");
      loadCloudBackups();
    } else {
      toast.error("Erro ao remover backup.");
    }
  };

  const handleBackup = async (type: "completo" | "incremental") => {
    setLoading(true);
    setBackupType(type);
    setStats(null);
    let totalFiles = 0;
    let totalCiclos = 0;
    const now = new Date().toISOString();

    let sinceDate: string | null = null;
    if (type === "incremental") {
      const dates = [lastIncremental, lastCompleto].filter(Boolean) as string[];
      if (dates.length > 0) {
        sinceDate = dates.sort().reverse()[0];
      }
      if (!sinceDate) {
        toast.error("Nenhum backup anterior encontrado. Execute um Backup Completo primeiro.");
        setLoading(false);
        setBackupType(null);
        return;
      }
    }

    try {
      setProgress("Buscando pacientes...");
      const { data: pacientes } = await supabase.from("pacientes").select("*").order("nome");
      if (!pacientes || pacientes.length === 0) {
        toast.error("Nenhum paciente encontrado.");
        setLoading(false);
        setBackupType(null);
        return;
      }

      const zip = new JSZip();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      let pacientesComDados = 0;

      for (let i = 0; i < pacientes.length; i++) {
        const pac = pacientes[i];
        const folderName = `${sanitizeName(pac.nome)}_${pac.cpf.replace(/\D/g, "")}`;
        setProgress(`Processando ${pac.nome} (${i + 1}/${pacientes.length})...`);

        const ciclosQuery = supabase
          .from("ciclos")
          .select("*, receitas(tipo, nome_medico, data_emissao, validade_ate, arquivo_url)")
          .eq("paciente_id", pac.id)
          .order("created_at", { ascending: true });

        const { data: ciclos } = await ciclosQuery;
        if (!ciclos || ciclos.length === 0) continue;

        let pacHasFiles = false;
        const pacFolder = zip.folder(folderName)!;

        for (let ci = 0; ci < ciclos.length; ci++) {
          const ciclo = ciclos[ci];
          const receita = (ciclo as any).receitas;
          const tipoLabel = receita?.tipo === "fralda" ? "Fralda" : "Medicamento";
          const statusLabel = ciclo.status === "ativo" ? "Ativo" : "Encerrado";
          const cicloFolderName = `Ciclo_${ci + 1}_${tipoLabel}_${statusLabel}`;
          const cicloFolder = pacFolder.folder(cicloFolderName)!;

          let cicloHasFiles = false;

          if (receita?.arquivo_url) {
            const shouldInclude = type === "completo" || !sinceDate;
            const receitaIsNew = sinceDate ? ciclo.created_at > sinceDate : true;
            if (shouldInclude || receitaIsNew) {
              const receitaUrl = buildStorageUrl(supabaseUrl, receita.arquivo_url);
              const blob = await fetchFileAsBlob(receitaUrl);
              if (blob) {
                cicloFolder.file(`receita.${getExtFromUrl(receitaUrl)}`, blob);
                totalFiles++;
                cicloHasFiles = true;
              }
            }
          }

          let docsQuery = supabase
            .from("documentos")
            .select("*")
            .eq("paciente_id", pac.id)
            .eq("ciclo_id", ciclo.id)
            .order("created_at", { ascending: true });

          if (type === "incremental" && sinceDate) {
            docsQuery = docsQuery.gte("created_at", sinceDate);
          }

          const { data: docs } = await docsQuery;

          const fixedDocs = (docs || []).filter(d => d.tipo !== "cupom_fiscal");
          const cupomDocs = (docs || []).filter(d => d.tipo === "cupom_fiscal");

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

          let dispsQuery = supabase
            .from("dispensacoes")
            .select("*")
            .eq("ciclo_id", ciclo.id)
            .eq("cancelada", false)
            .order("created_at", { ascending: true });

          const { data: allDisps } = await dispsQuery;

          if (allDisps && allDisps.length > 0) {
            for (let di = 0; di < allDisps.length; di++) {
              const disp = allDisps[di];
              const isNew = type === "completo" || !sinceDate || disp.created_at >= sinceDate;
              if (!isNew) continue;

              const monthLabel = formatMonthLabel(disp.created_at);
              const dispFolder = cicloFolder.folder(`Retirada_${di + 1}_${monthLabel}`)!;

              const allCupomDocs = type === "completo"
                ? (await supabase
                    .from("documentos")
                    .select("*")
                    .eq("paciente_id", pac.id)
                    .eq("ciclo_id", ciclo.id)
                    .eq("tipo", "cupom_fiscal")
                    .order("created_at", { ascending: true })).data || []
                : cupomDocs;

              const dispNumero = di + 1;
              const cupom = allCupomDocs.find(c => {
                const dados = c.dados_extraidos as any;
                return dados?.dispensacao_numero === dispNumero;
              }) || allCupomDocs[di];

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

        if (pacHasFiles || totalFiles > 0) pacientesComDados++;
      }

      if (totalFiles === 0) {
        if (type === "incremental") {
          toast.info("Nenhuma alteração encontrada desde o último backup.");
        } else {
          toast.error("Nenhum arquivo encontrado para backup.");
        }
        setLoading(false);
        setBackupType(null);
        return;
      }

      setProgress("Incluindo dados do banco...");
      const dataFolder = zip.folder("_dados_banco")!;
      const { data: allPacientes } = await supabase.from("pacientes").select("*");
      const { data: allCiclos } = await supabase.from("ciclos").select("*, receitas(*)");
      const { data: allDisp } = await supabase.from("dispensacoes").select("*").eq("cancelada", false);
      const { data: allDocs } = await supabase.from("documentos").select("*");

      const dbDump = {
        exportado_em: now,
        tipo_backup: type,
        desde: sinceDate || "início",
        pacientes: allPacientes || [],
        ciclos: allCiclos || [],
        dispensacoes: allDisp || [],
        documentos: allDocs || [],
      };
      dataFolder.file("dados.json", JSON.stringify(dbDump, null, 2));

      setProgress("Gerando arquivo ZIP...");
      const content = await zip.generateAsync({ type: "blob" }, (meta) => {
        setProgress(`Compactando... ${Math.round(meta.percent)}%`);
      });

      const dateLabel = new Date().toISOString().split("T")[0];
      const fileName = type === "completo"
        ? `backup_completo_${dateLabel}.zip`
        : `backup_incremental_${dateLabel}.zip`;

      // Download local
      saveAs(content, fileName);

      // Upload para nuvem
      setProgress("Enviando para a nuvem...");
      const uploadResult = await uploadBackupToStorage(content, fileName);
      if (uploadResult.success) {
        toast.success("Backup salvo na nuvem com sucesso!");
      } else {
        toast.warning(`Backup local OK, mas falhou ao salvar na nuvem: ${uploadResult.error}`);
      }

      const chave = type === "completo" ? "ultimo_backup_completo" : "ultimo_backup_incremental";
      if (uploadResult.success) {
        await saveBackupTimestamp(chave, now);
      } else if (type === "completo") {
        toast.error("Backup completo não foi marcado como concluído porque a nuvem falhou.");
      }

      await supabase.from("logs").insert({
        acao: `backup_${type}`,
        detalhes: { arquivos: totalFiles, ciclos: totalCiclos, desde: sinceDate, nuvem: uploadResult.success },
      });

      if (type === "completo") setLastCompleto(now);
      else setLastIncremental(now);

      setStats({ pacientes: pacientes.length, arquivos: totalFiles, ciclos: totalCiclos });
      toast.success(`Backup ${type} gerado com sucesso!`);
      loadCloudBackups();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar backup.");
    } finally {
      setLoading(false);
      setBackupType(null);
      setProgress("");
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <AppLayout title="Backup">
      <div className="space-y-6">
        <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Gerenciamento de Backup
        </h2>
        {!backupCompletoHoje && (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-800">
            Backup completo do dia ainda não confirmado. O restante do sistema permanece bloqueado até a conclusão do backup completo com envio para a nuvem.
          </div>
        )}

        {/* Status do último backup */}
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Último completo:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {formatDateTimeBR(lastCompleto)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Último incremental:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {formatDateTimeBR(lastIncremental)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backup Completo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DatabaseBackup className="w-5 h-5 text-primary" />
              Backup Completo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copia <strong>todos</strong> os dados e arquivos do sistema. Salva no computador <strong>e na nuvem</strong> automaticamente.
            </p>

            <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-xl bg-muted/50 border border-border/50">
              <p className="font-semibold text-foreground mb-1">Estrutura das pastas:</p>
              <p>📁 Nome_Paciente_CPF/</p>
              <p className="ml-4">📁 Ciclo_1_Medicamento_Ativo/</p>
              <p className="ml-8">🖼️ receita.jpg</p>
              <p className="ml-8">🖼️ identidade.jpg, procuracao.jpg...</p>
              <p className="ml-8">📁 Retirada_1_Janeiro_2026/</p>
              <p className="ml-12">🖼️ cupom_fiscal.jpg</p>
              <p>📁 _dados_banco/</p>
              <p className="ml-4">📄 dados.json (banco completo)</p>
            </div>

            <Button
              onClick={() => requestBackup("completo")}
              disabled={loading}
              className="w-full min-h-[48px]"
              size="lg"
            >
              {loading && backupType === "completo" ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {progress || "Preparando..."}
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Baixar Backup Completo (ZIP + Nuvem)
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Backup Incremental */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowDownToLine className="w-5 h-5 text-accent-foreground" />
              Backup Incremental
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copia apenas os dados <strong>adicionados ou modificados</strong> desde o último backup. Salva localmente <strong>e na nuvem</strong>.
            </p>

            {!lastCompleto && !lastIncremental && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                <p className="text-xs text-yellow-200">
                  Execute um Backup Completo primeiro para habilitar o incremental.
                </p>
              </div>
            )}

            {(lastCompleto || lastIncremental) && (
              <div className="text-xs text-muted-foreground p-3 rounded-xl bg-muted/50 border border-border/50">
                <p>
                  Dados desde:{" "}
                  <Badge variant="outline" className="font-mono">
                    {formatDateTimeBR(
                      [lastIncremental, lastCompleto].filter(Boolean).sort().reverse()[0] || null
                    )}
                  </Badge>
                </p>
              </div>
            )}

            <Button
              onClick={() => requestBackup("incremental")}
              disabled={loading || (!lastCompleto && !lastIncremental)}
              variant="outline"
              className="w-full min-h-[48px]"
              size="lg"
            >
              {loading && backupType === "incremental" ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {progress || "Preparando..."}
                </>
              ) : (
                <>
                  <ArrowDownToLine className="w-5 h-5 mr-2" />
                  Baixar Backup Incremental (ZIP + Nuvem)
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Backups na Nuvem */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cloud className="w-5 h-5 text-primary" />
              Backups Salvos na Nuvem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cloudBackups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum backup na nuvem ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {cloudBackups.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeBR(file.created_at)}
                        {file.metadata?.size ? ` • ${formatFileSize(file.metadata.size)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCloudDownload(file.name)}
                        disabled={loadingCloud}
                        title="Baixar"
                      >
                        <CloudDownload className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleCloudDelete(file.name)}
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Os últimos 5 backups são mantidos automaticamente. Os mais antigos são removidos.
            </p>
          </CardContent>
        </Card>

        {/* Stats de resultado */}
        {stats && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30">
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <p className="text-sm text-green-300">
              Backup concluído:{" "}
              <Badge variant="outline">{stats.pacientes} pacientes</Badge>{" "}
              <Badge variant="outline">{stats.ciclos} ciclos</Badge>{" "}
              <Badge variant="outline">{stats.arquivos} arquivos</Badge>
            </p>
          </div>
        )}
      </div>

      <AlertDialog open={showAlert} onOpenChange={setShowAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Atenção — Backup em Andamento
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Para garantir a integridade dos dados, certifique-se de que{" "}
                <strong>nenhum outro processo operacional</strong> (dispensações, cadastros, uploads) esteja em execução durante a geração do backup.
              </p>
              <p>Deseja prosseguir?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBackup}>
              Sim, iniciar backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
