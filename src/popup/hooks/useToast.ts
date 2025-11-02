// src/popup/hooks/useToast.ts
import { useState } from "react";

export function useToast(duration = 900) {
    const [toast, setToastRaw] = useState<string | null>(null);
    const setToast = (msg: string) => {
        setToastRaw(msg);
        setTimeout(() => setToastRaw(null), duration);
    };
    return { toast, setToast };
}
