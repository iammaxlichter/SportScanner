//src/options/hooks/useAsync.ts
import { useEffect, useState } from "react";

export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
    const [state, setState] = useState<
        | { loading: true; value?: undefined; error?: undefined }
        | { loading: false; value: T; error?: undefined }
        | { loading: false; value?: undefined; error: unknown }
    >({ loading: true });

    useEffect(() => {
        let alive = true;
        setState({ loading: true });
        fn()
            .then(v => { if (alive) setState({ loading: false, value: v }); })
            .catch(e => { if (alive) setState({ loading: false, error: e }); });
        return () => { alive = false; };
    }, deps);

    return state;
}
