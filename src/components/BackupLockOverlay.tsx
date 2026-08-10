import { useBackupLock, clearBackupLock } from "@/hooks/useBackupLock";
import { Loader2, Shield, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BackupLockOverlay() {
  const { isLocked, lockMessage, lockedBy, elapsedMinutes, status } = useBackupLock();

  if (!isLocked) return null;

  const forceUnlock = async () => {
    await clearBackupLock();
    toast.success("Trava de backup liberada.");
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md">
      <div className="text-center space-y-6 p-8 max-w-md">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Shield className="w-10 h-10 text-primary animate-pulse" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Sistema bloqueado para backup
          </h2>

          <p className="text-muted-foreground text-sm">
            {lockMessage || "Backup em andamento. Aguarde a conclusÃ£o."}
          </p>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 text-left text-sm space-y-2">
          <p><strong>UsuÃ¡rio:</strong> {lockedBy || "Sistema"}</p>
          <p><strong>Status:</strong> {status || "Processando backup"}</p>
          <p><strong>Tempo:</strong> {elapsedMinutes} minuto(s)</p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm font-medium text-muted-foreground">Processando backup...</span>
        </div>

        {elapsedMinutes >= 10 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Backup parado ha muito tempo.
            </div>

            <Button variant="destructive" size="sm" onClick={forceUnlock}>
              Liberar trava
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground/60">
          A trava antiga e liberada automaticamente apos 30 minutos.
        </p>
      </div>
    </div>
  );
}
