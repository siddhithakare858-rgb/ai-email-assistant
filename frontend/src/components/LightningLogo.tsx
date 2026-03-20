import { Zap } from "lucide-react";

export function LightningLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <div className="absolute inset-0 gradient-primary rounded-xl opacity-20 blur-xl" />
      <div className="relative gradient-primary rounded-xl p-2">
        <Zap size={size} className="text-primary-foreground" fill="currentColor" />
      </div>
    </div>
  );
}
