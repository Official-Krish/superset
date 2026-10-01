import { create } from "zustand";

export interface RestoreWorkspaceTarget {
	workspaceId: string;
	workspaceName: string;
	branch: string;
}

/**
 * Drives the single globally-mounted v2 restore dialog
 * (RestoreWorkspaceMount). Like delete, restore acts on rows that may
 * unmount mid-flight, so entry points request through this store instead of
 * rendering the dialog under the row.
 */
interface RestoreWorkspaceIntentState {
	target: RestoreWorkspaceTarget | null;
	open: boolean;
	request: (target: RestoreWorkspaceTarget) => void;
	setOpen: (workspaceId: string, open: boolean) => void;
	close: (workspaceId: string) => void;
}

export const useRestoreWorkspaceIntent = create<RestoreWorkspaceIntentState>(
	(set) => ({
		target: null,
		open: false,
		request: (target) => set({ target, open: true }),
		setOpen: (workspaceId, open) =>
			set((state) =>
				state.target?.workspaceId === workspaceId ? { open } : state,
			),
		close: (workspaceId) =>
			set((state) =>
				state.target?.workspaceId === workspaceId
					? { target: null, open: false }
					: state,
			),
	}),
);
