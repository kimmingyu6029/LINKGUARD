import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link className="brand-logo" to="/" aria-label="LinkGuard AI 홈">
      <span className="brand-mark">
        <ShieldCheck size={22} strokeWidth={2.4} />
      </span>
      <span>
        LinkGuard <strong>AI</strong>
      </span>
    </Link>
  );
}
