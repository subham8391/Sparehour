"use client";
// "Block it" needs the day's free gaps, which only the Today screen has in
// hand. Today registers a handler here; the keyboard (`B`) and the task
// detail's footer call it. Elsewhere the affordance is simply absent.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type BlockHandler = (taskId: string) => void;

interface BlockingApi {
  /** True while a screen that can place blocks is mounted. */
  available: boolean;
  blockTask: (taskId: string) => void;
  register: (handler: BlockHandler) => () => void;
}

const BlockingContext = createContext<BlockingApi | null>(null);

export function useBlocking(): BlockingApi {
  const api = useContext(BlockingContext);
  if (!api) throw new Error("useBlocking needs a BlockingProvider above it");
  return api;
}

export function useBlockingOptional(): BlockingApi | null {
  return useContext(BlockingContext);
}

export function BlockingProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<BlockHandler | null>(null);
  const [available, setAvailable] = useState(false);
  const register = useCallback((handler: BlockHandler) => {
    handlerRef.current = handler;
    setAvailable(true);
    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
        setAvailable(false);
      }
    };
  }, []);
  const blockTask = useCallback((taskId: string) => handlerRef.current?.(taskId), []);
  const api = useMemo(() => ({ available, blockTask, register }), [available, blockTask, register]);
  return <BlockingContext.Provider value={api}>{children}</BlockingContext.Provider>;
}
