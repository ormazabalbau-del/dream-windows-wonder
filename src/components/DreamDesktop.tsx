import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { DreamEvent } from "./DreamWorld";

const DreamWorld = lazy(() => import("./DreamWorld").then((module) => ({ default: module.DreamWorld })));

type WindowId = "welcome" | "journal" | "eyes" | "credits" | null;

const desktopIcons = [
  { id: "welcome" as const, icon: "▣", label: "Mi PC" },
  { id: "eyes" as const, icon: "◉", label: "Ojos cercanos" },
  { id: "journal" as const, icon: "▤", label: "DIARIO.TXT" },
  { id: "credits" as const, icon: "♻", label: "Papelera" },
];

const eyeFiles = ["ojo_azul.exe", "testigo_03.bmp", "angel_sin_red.dll", "NO_ABRIR.gif", "iris_final_final.bmp"];

function WinButton({ children, onClick, className = "", ariaLabel }: { children: React.ReactNode; onClick?: () => void; className?: string; ariaLabel?: string }) {
  return <button type="button" className={`win-button ${className}`} onClick={onClick} aria-label={ariaLabel}>{children}</button>;
}

function WindowFrame({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  return (
    <section className={`win-window ${className}`} aria-label={title}>
      <div className="win-titlebar">
        <div className="win-title"><span className="title-app-icon">◈</span>{title}</div>
        <div className="title-actions">
          <WinButton ariaLabel="Minimizar">_</WinButton>
          <WinButton ariaLabel="Maximizar">□</WinButton>
          <WinButton onClick={onClose} ariaLabel="Cerrar">×</WinButton>
        </div>
      </div>
      <div className="win-menu"><span>Archivo</span><span>Editar</span><span>Ver</span><span>Ayuda</span></div>
      {children}
    </section>
  );
}

function useDreamAudio(active: boolean, muted: boolean) {
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!active || muted) {
      if (audioRef.current) void audioRef.current.suspend();
      return;
    }
    const AudioContextClass = window.AudioContext;
    if (!audioRef.current) {
      const context = new AudioContextClass();
      const master = context.createGain();
      master.gain.value = 0.025;
      master.connect(context.destination);
      [55, 82.5, 109].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index === 1 ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 2 ? 0.25 : 0.55;
        oscillator.connect(gain).connect(master);
        oscillator.start();
      });
      audioRef.current = context;
    }
    void audioRef.current.resume();
  }, [active, muted]);
}

export function DreamDesktop() {
  const [booted, setBooted] = useState(false);
  const [openWindow, setOpenWindow] = useState<WindowId>("welcome");
  const [startOpen, setStartOpen] = useState(false);
  const [dreaming, setDreaming] = useState(false);
  const [muted, setMuted] = useState(false);
  const [signals, setSignals] = useState(0);
  const [dialogue, setDialogue] = useState<{ speaker: string; text: string } | null>(null);
  const [complete, setComplete] = useState(false);
  const [time, setTime] = useState("01:35");
  useDreamAudio(dreaming, muted);

  useEffect(() => {
    const bootTimer = window.setTimeout(() => setBooted(true), 2100);
    const clock = window.setInterval(() => {
      setTime(new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
    }, 30_000);
    return () => {
      window.clearTimeout(bootTimer);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (!dialogue) return;
    const timer = window.setTimeout(() => setDialogue(null), 3800);
    return () => window.clearTimeout(timer);
  }, [dialogue]);

  const handleDreamEvent = (event: DreamEvent) => {
    if (event.type === "signal") setSignals(event.count);
    if (event.type === "dialogue") setDialogue({ speaker: event.speaker, text: event.text });
    if (event.type === "complete") {
      setComplete(true);
      setDialogue({ speaker: "WINDOWS", text: "la salida fue encontrada. pero todavía no despertaste." });
    }
  };

  const status = useMemo(() => complete ? "SUEÑO COMPLETO" : `SEÑAL ${signals}/5`, [complete, signals]);

  if (!booted) {
    return (
      <main className="boot-screen">
        <div className="boot-logo"><span>Microsoft</span><strong>Windows</strong><em>95</em></div>
        <p>Iniciando DREAMSCAPE...</p>
        <div className="boot-progress"><i /></div>
        <small>Copyright © 1981–1995 Nadie</small>
      </main>
    );
  }

  return (
    <main className={`desktop ${dreaming ? "is-dreaming" : ""}`} onClick={() => startOpen && setStartOpen(false)}>
      <div className="cloud cloud-one" /><div className="cloud cloud-two" />
      <div className="desktop-icons">
        {desktopIcons.map((item) => (
          <button type="button" className="desktop-icon" key={item.id} onDoubleClick={() => setOpenWindow(item.id)} onClick={(event) => { event.stopPropagation(); setOpenWindow(item.id); }}>
            <span className={`pixel-icon pixel-icon-${item.id}`}>{item.icon}</span><span>{item.label}</span>
          </button>
        ))}
      </div>

      {!dreaming && openWindow === "welcome" && (
        <WindowFrame title="dreamscape.exe" onClose={() => setOpenWindow(null)} className="welcome-window">
          <div className="welcome-content">
            <aside><div className="giant-eye"><i /></div><p>USUARIO:<br /><b>DESCONOCIDO</b></p></aside>
            <div className="welcome-copy">
              <h1>¿Recordás este lugar?</h1>
              <p>La computadora encontró un sueño guardado el <b>21/09/1995</b>. Cinco señales siguen activas dentro.</p>
              <div className="system-warning"><span>!</span><p><b>ADVERTENCIA</b><br />Los habitantes pueden mirarte. No todos recuerdan cómo hablar.</p></div>
              <WinButton className="enter-button" onClick={() => { setDreaming(true); setStartOpen(false); }}>► ENTRAR AL SUEÑO</WinButton>
              <small>Teclado: WASD · Ratón: mirar · Encontrá las 5 señales</small>
            </div>
          </div>
          <div className="win-status"><span>5 objeto(s)</span><span>Mi PC\Sueños\1995</span></div>
        </WindowFrame>
      )}

      {!dreaming && openWindow === "journal" && (
        <WindowFrame title="Bloc de notas - DIARIO.TXT" onClose={() => setOpenWindow(null)} className="notepad-window">
          <article className="notepad">
            <p>21 de septiembre</p><p>La pantalla se encendió sola otra vez.</p><p>Los ojos dicen que reúna cinco señales. Las esconden cerca de las casas y puertas azules.</p><p>Si el cielo pestañea, quedate quieto.</p><p>— usuario_01</p>
          </article>
        </WindowFrame>
      )}

      {!dreaming && openWindow === "eyes" && (
        <WindowFrame title="Explorando - Ojos cercanos" onClose={() => setOpenWindow(null)} className="files-window">
          <div className="file-toolbar"><WinButton>←</WinButton><WinButton>→</WinButton><span>C:\SERES\OJOS</span></div>
          <div className="file-grid">{eyeFiles.map((file, index) => <div className="file-item" key={file}><span>{index === 3 ? "▧" : "◉"}</span><p>{file}</p></div>)}</div>
          <div className="win-status"><span>{eyeFiles.length} objeto(s)</span><span>Todos observando</span></div>
        </WindowFrame>
      )}

      {!dreaming && openWindow === "credits" && (
        <WindowFrame title="Papelera de reciclaje" onClose={() => setOpenWindow(null)} className="trash-window">
          <div className="trash-list"><p>□ infancia.tmp</p><p>□ verano_que_no_ocurrio.avi</p><p>□ mi_casa_anterior.url</p><p>□ RECUPERARME.exe</p></div>
        </WindowFrame>
      )}

      {dreaming && (
        <section className="game-shell" aria-label="Juego Dreamscape 95">
          <div className="game-titlebar">
            <strong><span>◈</span> DREAMSCAPE 95 — sector jardín</strong>
            <div><WinButton onClick={() => setMuted((value) => !value)} ariaLabel={muted ? "Activar sonido" : "Silenciar sonido"}>{muted ? "♪×" : "♪"}</WinButton><WinButton onClick={() => setDreaming(false)} ariaLabel="Salir del sueño">×</WinButton></div>
          </div>
          <div className="game-viewport">
            <ClientOnly fallback={<div className="loading-dream">CARGANDO SUEÑO...</div>}>
              <Suspense fallback={<div className="loading-dream">CARGANDO SUEÑO...</div>}>
                <DreamWorld active={dreaming} muted={muted} onEvent={handleDreamEvent} />
              </Suspense>
            </ClientOnly>
            <div className="crt-lines" />
            <div className="game-hud">
              <div className="hud-box"><span>ESTADO</span><b>{status}</b></div>
              <div className="hud-box objective"><span>OBJETIVO</span><b>{complete ? "VOLVÉ AL ESCRITORIO" : "REUNÍ LAS SEÑALES"}</b></div>
            </div>
            {dialogue && <div className="dialogue-box"><span>{dialogue.speaker}</span><p>{dialogue.text}</p><i>▼</i></div>}
          </div>
          <div className="game-statusbar"><span>Zona: JARDÍN ETERNO</span><span>WASD mover · clic capturar ratón</span><span>entidades: 26</span></div>
        </section>
      )}

      <div className="taskbar" onClick={(event) => event.stopPropagation()}>
        <WinButton className={`start-button ${startOpen ? "pressed" : ""}`} onClick={() => setStartOpen((value) => !value)}><span className="windows-mark">▦</span> Inicio</WinButton>
        <div className="task-divider" />
        {dreaming ? <WinButton className="task-item" onClick={() => setDreaming(false)}>◈ DREAMSCAPE 95</WinButton> : openWindow && <WinButton className="task-item">▣ {openWindow === "welcome" ? "dreamscape.exe" : openWindow}</WinButton>}
        <div className="tray"><WinButton onClick={() => setMuted((value) => !value)} ariaLabel={muted ? "Activar sonido" : "Silenciar sonido"}>{muted ? "×♪" : "♪"}</WinButton><span>{time}</span></div>
      </div>

      {startOpen && (
        <nav className="start-menu" onClick={(event) => event.stopPropagation()} aria-label="Menú Inicio">
          <div className="start-rail"><b>Windows</b><span>95</span></div>
          <div className="start-items">
            <button type="button" onClick={() => { setDreaming(true); setStartOpen(false); }}><span>◈</span><b>Entrar al sueño</b><i>▶</i></button>
            <button type="button" onClick={() => { setOpenWindow("eyes"); setStartOpen(false); }}><span>◉</span>Habitantes</button>
            <button type="button" onClick={() => { setOpenWindow("journal"); setStartOpen(false); }}><span>▤</span>Documentos</button>
            <hr />
            <button type="button" onClick={() => window.location.reload()}><span>▣</span>Apagar el sueño...</button>
          </div>
        </nav>
      )}
    </main>
  );
}