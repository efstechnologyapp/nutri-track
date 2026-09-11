import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPromptEvent); setVisible(true); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!visible || !promptEvent) return null;
  return <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#cfe1c7] bg-[#f6faef] p-3.5 shadow-[0_16px_36px_rgba(28,77,62,0.16)] sm:left-auto sm:right-6"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1c4d3e] text-[#d3e9b9]"><Download size={18} /></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-[#214c3d]">Instalar o NutriTrack</div><div className="mt-0.5 text-xs text-[#71877c]">Use como app, direto pelo Chrome.</div></div><button className="rounded-xl bg-[#1c4d3e] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#28634f]" onClick={async () => { await promptEvent.prompt(); setVisible(false); }}>Instalar</button><button aria-label="Fechar aviso de instalação" className="rounded-full p-1.5 text-[#7b9187] hover:bg-[#e7f0e2]" onClick={() => setVisible(false)}><X size={15} /></button></div>;
}
