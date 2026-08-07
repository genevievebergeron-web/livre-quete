// ─── FILET DE SÉCURITÉ DE RENDU (v2.16.42) ────────────────────────────────────
// Jusqu'ici l'app n'avait AUCUN `ErrorBoundary` : la moindre erreur de rendu faisait
// démonter tout l'arbre React → écran blanc, sans message, sans trace, avec pour seule
// issue de fermer et rouvrir l'app (ce que des enfants de 7-12 ans ne savent pas
// forcément faire, et qui ressemble exactement aux signalements « rien ne se passe »).
// Ce composant remplace la page blanche par un écran calme et compréhensible, et met
// l'erreur dans la file durable (`errorlog.js`) pour qu'elle remonte au portail parent
// au prochain démarrage sain.
//
// Ton volontairement déculpabilisant (« ce n'est pas de ta faute ») et zéro animation
// clignotante : c'est un écran qui arrive dans un moment déjà frustrant.

import React from "react";
import { GLOBAL_CSS, uid } from "./shared.js";
import { queueError } from "./errorlog.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }

  static getDerivedStateFromError(err) { return { err }; }

  componentDidCatch(err, info) {
    queueError({
      id: "err_" + uid(),
      ts: Date.now(),
      who: "?", // le boundary vit au-dessus d'App : il ne connaît pas le joueur en session
      message: String(err?.message || err || "Erreur de rendu").slice(0, 300),
      stack: String(err?.stack || info?.componentStack || "").slice(0, 500),
      source: "render", // distingue un plantage d'écran d'une erreur JS bénigne
      appVersion: this.props.appVersion || "",
    });
  }

  render() {
    if (!this.state.err) return this.props.children;
    const box = { fontFamily: "'Press Start 2P',monospace", fontSize: 9, lineHeight: 1.9 };
    return (
      <div style={{ minHeight: "100vh", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "safe center", padding: 20 }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ maxWidth: 420, width: "100%", background: "#242440", border: "3px solid #D9BC5C", borderRadius: 12, padding: 22, textAlign: "center", color: "#EDE6D6" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🛠️</div>
          <div style={{ ...box, fontSize: 12, color: "#D9BC5C", marginBottom: 14 }}>OUPS, UN PÉPIN</div>
          <div style={{ fontFamily: "'Nunito',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            L'app a buggé, mais ce n'est pas de ta faute.
          </div>
          <div style={{ fontFamily: "'Nunito',sans-serif", fontSize: 13, color: "#B9B3A5", marginBottom: 18 }}>
            Rien n'est perdu : tes quêtes, ton XP et tes pièces sont en sécurité. Appuie sur le bouton pour repartir.
          </div>
          <button
            onClick={() => { try { window.location.reload(); } catch { /* rien à faire de plus */ } }}
            style={{ ...box, width: "100%", padding: "14px 10px", background: "#D9BC5C", color: "#1a1a2e", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            🔄 RECHARGER
          </button>
          <div style={{ fontFamily: "'Nunito',sans-serif", fontSize: 11, color: "#7C7768", marginTop: 16 }}>
            Le pépin a été noté pour le parent (portail → Journal).
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#565243", marginTop: 8, wordBreak: "break-word" }}>
            {String(this.state.err?.message || this.state.err || "").slice(0, 160)}
          </div>
        </div>
      </div>
    );
  }
}
