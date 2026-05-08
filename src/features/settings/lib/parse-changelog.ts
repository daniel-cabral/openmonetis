import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
	type BumpType,
	type ChangelogSection,
	type ChangelogVersion,
	isSectionType,
} from "@/features/settings/lib/changelog-types";

function diffBump(current: string, previous: string | undefined): BumpType {
	if (!previous) return "minor";
	const [aMajor = 0, aMinor = 0] = current.split(".").map(Number);
	const [bMajor = 0, bMinor = 0] = previous.split(".").map(Number);
	if (aMajor !== bMajor) return "major";
	if (aMinor !== bMinor) return "minor";
	return "patch";
}

let cached: ChangelogVersion[] | null = null;

export function parseChangelog(): ChangelogVersion[] {
	if (cached) return cached;

	const filePath = path.join(process.cwd(), "CHANGELOG.md");
	const content = fs.readFileSync(filePath, "utf-8");
	const lines = content.split("\n");

	const versions: ChangelogVersion[] = [];
	let currentVersion: ChangelogVersion | null = null;
	let currentSection: ChangelogSection | null = null;
	let summaryLines: string[] = [];

	for (const line of lines) {
		const versionMatch = line.match(/^## \[(.+?)\] - (.+)$/);
		if (versionMatch) {
			if (currentSection && currentVersion) {
				currentVersion.sections.push(currentSection);
			}
			const version = versionMatch[1] ?? "";
			const isoDate = versionMatch[2] ?? "";
			const [y, m, d] = isoDate.split("-");
			currentVersion = {
				version,
				isoDate,
				date: d && m && y ? `${d}/${m}/${y}` : isoDate,
				bump: "patch",
				sections: [],
			};
			versions.push(currentVersion);
			currentSection = null;
			summaryLines = [];
			continue;
		}

		const sectionMatch = line.match(/^### (.+)$/);
		if (sectionMatch && currentVersion) {
			if (summaryLines.length > 0) {
				currentVersion.summary = summaryLines.join(" ").trim();
				summaryLines = [];
			}
			if (currentSection) {
				currentVersion.sections.push(currentSection);
			}
			const type = sectionMatch[1] ?? "";
			currentSection = isSectionType(type) ? { type, items: [] } : null;
			continue;
		}

		const itemMatch = line.match(/^- (.+)$/);
		if (itemMatch && currentSection) {
			currentSection.items.push(itemMatch[1] ?? "");
			continue;
		}

		if (currentVersion && !currentSection && line.trim()) {
			summaryLines.push(line.trim());
		}
	}

	if (currentSection && currentVersion) {
		currentVersion.sections.push(currentSection);
	}
	if (currentVersion && !currentVersion.summary && summaryLines.length > 0) {
		currentVersion.summary = summaryLines.join(" ").trim();
	}

	for (let i = 0; i < versions.length; i++) {
		const current = versions[i];
		if (!current) continue;
		current.bump = diffBump(current.version, versions[i + 1]?.version);
	}

	cached = versions;
	return versions;
}
