import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/utils';

export function ToastHost() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;

  return (
    <div
      className={cn('toast', `toast-${toast.tone}`)}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="toast-icon">
        {toast.tone === 'success' && <CheckCircle2 size={17} aria-hidden="true" />}
        {toast.tone === 'error' && <AlertCircle size={17} aria-hidden="true" />}
        {toast.tone === 'info' && <Info size={17} aria-hidden="true" />}
      </span>
      <span className="toast-message">{toast.message}</span>
      <button type="button" className="toast-close" onClick={dismissToast} aria-label="Dismiss notification">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
