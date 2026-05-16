import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/api/types";
import { repairDisplayNameOrMixed } from "@/utils/utf8Mojibake";

function normalizeUserUnicode(u: User): User {
  const dn = u.displayName ?? null;
  if (!dn) return u;
  const fixed = repairDisplayNameOrMixed(dn);
  return fixed === dn ? u : { ...u, displayName: fixed };
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user: normalizeUserUnicode(user) }),
      setUser: (user) => set({ user: normalizeUserUnicode(user) }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: "coldhero-auth" },
  ),
);

/** 校正持久化里误存的 UTF-8「拉丁化」显示名（如 ç³»ç»Ÿ… → 系统管理员） */
export function repairPersistedAuthUserIfNeeded(): void {
  const { user } = useAuthStore.getState();
  if (!user) return;
  const repaired = normalizeUserUnicode(user);
  if (repaired !== user) useAuthStore.setState({ user: repaired });
}
