import { useEffect, useState } from "react";
import { buildQueryCacheKey, executeFactQuery } from "./query.js";

export function useFactQuery({ enabled, datasetId, payload, queryFn }) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const payloadKey = payload ? buildQueryCacheKey(datasetId, payload) : "";

  useEffect(() => {
    if (!enabled || !datasetId || !payload) {
      setState({ loading: false, data: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    executeFactQuery(datasetId, payload, { queryFn })
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            data: null,
            error: err?.message || "Query failed",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, datasetId, payloadKey, queryFn]);

  return state;
}
