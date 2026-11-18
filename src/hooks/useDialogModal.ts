import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared behavior for the portal dialogs (confirm dialogs and the word
 * editor): lock page scroll, hide the app shell from assistive tech while the
 * modal is open, focus `focusRef` on open, and trap Tab inside the dialog.
 * Escape invokes `onClose`.
 */
export function useDialogModal(
  dialogRef: RefObject<HTMLElement | null>,
  focusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    document.body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    // Hide the app shell from assistive tech while the modal is open, matching
    // the aria-modal state for screen readers.
    const appRoot = document.getElementById('root');
    const previousAppInert = appRoot?.inert ?? false;
    if (appRoot) appRoot.inert = true;
    focusRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
      if (appRoot) appRoot.inert = previousAppInert;
      previouslyFocused?.focus({ preventScroll: true });
    };
    // Mount/unmount only: the refs always hold the current dialog and handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
