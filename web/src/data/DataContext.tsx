import { createContext, useContext } from "react";
import type { Dataset } from "../engine/types";

/** The loaded bonus dataset, provided once by `Layout` so pages don't refetch. */
export const DataContext = createContext<Dataset | null>(null);

/** Reads the dataset provided by `Layout`. Throws outside a `DataContext.Provider`. */
export function useData(): Dataset {
  const dataset = useContext(DataContext);
  if (!dataset) {
    throw new Error("useData must be used within a DataContext.Provider");
  }
  return dataset;
}
