import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

interface AnnouncementContextValue {
  announce: (message: string) => void;
}

const AnnouncementContext = createContext<AnnouncementContextValue>({ announce: () => {} });

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Clear first, then set — ensures re-announcing the same message triggers a DOM change
  const announce = (msg: string) => {
    setMessage('');
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setMessage(msg), 50);
  };

  return (
    <AnnouncementContext.Provider value={{ announce }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {message}
      </div>
    </AnnouncementContext.Provider>
  );
}

export function useAnnounce() {
  return useContext(AnnouncementContext).announce;
}
