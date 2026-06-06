import { AlertTriangle, Bot, CircleCheckBig, Link2, Search, ShieldCheck } from "lucide-react";

export default function HeroVisual({ compact = false }) {
  return (
    <div className={`hero-visual${compact ? " is-compact" : ""}`} aria-hidden="true">
      <div className="circuit-lines" />
      <div className="floating-alert alert-left">
        <AlertTriangle size={18} />
      </div>
      <div className="floating-alert alert-right">
        <AlertTriangle size={18} />
      </div>
      <div className="visual-chip url-chip">
        <Link2 size={15} />
        <span>https://suspect-link.com</span>
        <CircleCheckBig size={13} />
      </div>
      <div className="visual-chip search-chip">
        <Search size={24} />
      </div>
      <div className="visual-chip ai-chip">
        <Bot size={26} />
        <strong>AI</strong>
      </div>
      <div className="shield-orbit">
        <div className="shield-plate">
          <ShieldCheck size={88} strokeWidth={1.7} />
        </div>
      </div>
      <div className="scan-ring ring-one" />
      <div className="scan-ring ring-two" />
    </div>
  );
}
