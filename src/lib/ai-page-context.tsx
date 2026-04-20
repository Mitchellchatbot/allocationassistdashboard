import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface AIPageData {
  page: string;
  data?: Record<string, unknown>;
}

interface AIPageContextValue {
  pageData: AIPageData | null;
  setPageData: (d: AIPageData | null) => void;
}

const AIPageContext = createContext<AIPageContextValue>({
  pageData: null,
  setPageData: () => {},
});

export function AIPageContextProvider({ children }: { children: ReactNode }) {
  const [pageData, setPageData] = useState<AIPageData | null>(null);
  return (
    <AIPageContext.Provider value={{ pageData, setPageData }}>
      {children}
    </AIPageContext.Provider>
  );
}

export function useAIPageContext() {
  return useContext(AIPageContext);
}

/**
 * Call this inside any page component to register page-specific data
 * that the AI assistant will receive when answering questions on that page.
 */
export function useSetAIPageContext(page: string, data?: Record<string, unknown>) {
  const { setPageData } = useContext(AIPageContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPageData({ page, data });
    return () => setPageData(null);
  // JSON.stringify so we don't fire on every object reference change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, JSON.stringify(data)]);
}
