import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { NewWorkDialog, type NewWorkRequest } from "../work/work.new-dialog";

interface NewWorkValue {
  /** Open New work: on a GitHub issue by default, or on a desk job of a kind. */
  readonly open: (request?: NewWorkRequest) => void;
}

const NewWorkContext = createContext<NewWorkValue | null>(null);

/** One New work dialog for the whole desk: the sidebar, the Inbox, the palette, and N open it. */
export function NewWorkProvider({ children }: { readonly children: ReactNode }) {
  const [request, setRequest] = useState<NewWorkRequest | null>(null);
  const value = useMemo<NewWorkValue>(
    () => ({ open: (next = { tab: "issue" }) => setRequest(next) }),
    []
  );
  return (
    <NewWorkContext.Provider value={value}>
      {children}
      <NewWorkDialog request={request} onClose={() => setRequest(null)} />
    </NewWorkContext.Provider>
  );
}

export function useNewWork(): NewWorkValue {
  const value = useContext(NewWorkContext);
  if (value === null) throw new Error("useNewWork needs a NewWorkProvider");
  return value;
}
