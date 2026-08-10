import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";

export default function InactivityWarning() {
  const { signOut, user } = useAuth();

  const { showWarning, remainingSeconds, dismissWarning } = useInactivityTimeout(
    signOut,
    30 * 60 * 1000, // 30 min
    2 * 60 * 1000    // warn 2 min before
  );

  if (!user || !showWarning) return null;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Sessão Inativa
          </AlertDialogTitle>
          <AlertDialogDescription>
            Você será desconectado em <strong>{remainingSeconds}s</strong> por inatividade.
            Clique abaixo para continuar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismissWarning} className="w-full">
            Continuar Conectado
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
