import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import {
	createFeatureWorktreeScenario,
	type FeatureWorktreeScenario,
} from "../helpers/scenarios";
import { seedWorkspace } from "../helpers/seed";

describe("workspaceCleanup.restore integration", () => {
	let scenario: FeatureWorktreeScenario;

	afterEach(async () => {
		await scenario.dispose();
	});

	async function destroyWorkspace(deleteBranch: boolean) {
		scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch,
		});
		expect(result.success).toBe(true);
	}

	function archivedRow() {
		return scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.get();
	}

	test("restore re-creates the worktree and clears the tombstone", async () => {
		await destroyWorkspace(false);
		expect(archivedRow()?.archivedAt).toBeTruthy();
		expect(existsSync(scenario.worktreePath)).toBe(false);

		const result = await scenario.host.trpc.workspaceCleanup.restore.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});

		expect(result.workspaceId).toBe(scenario.featureWorkspaceId);
		expect(result.restoredFrom).toBe("local-branch");
		expect(existsSync(scenario.worktreePath)).toBe(true);
		const row = archivedRow();
		expect(row?.archivedAt).toBeNull();
		expect(row?.archiveReason).toBeNull();
	});

	test("restore fails with a typed error when the branch is gone everywhere", async () => {
		await destroyWorkspace(true);
		expect(archivedRow()?.archivedAt).toBeTruthy();

		const error = await scenario.host.trpc.workspaceCleanup.restore
			.mutate({ workspaceId: scenario.featureWorkspaceId })
			.then(
				() => null,
				(err: unknown) => err,
			);
		expect(String((error as { message?: string })?.message ?? error)).toMatch(
			/no longer exists/,
		);
		expect(archivedRow()?.archivedAt).toBeTruthy();
	});

	test("restore refuses when a live workspace owns the branch", async () => {
		await destroyWorkspace(false);
		seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: join(scenario.repo.repoPath, ".worktrees", "rival"),
			branch: scenario.branch,
		});

		const error = await scenario.host.trpc.workspaceCleanup.restore
			.mutate({ workspaceId: scenario.featureWorkspaceId })
			.then(
				() => null,
				(err: unknown) => err,
			);
		expect(String((error as { message?: string })?.message ?? error)).toMatch(
			/already owned/,
		);
		expect(archivedRow()?.archivedAt).toBeTruthy();
	});
});
